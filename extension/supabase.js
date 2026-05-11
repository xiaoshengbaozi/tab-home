/* ================================================================
   supabase.js — Cloud sync via Supabase: auth, REST API,
   push/pull, and sync status rendering.
   ================================================================ */

'use strict';

const DEFAULT_SYNC_SETTINGS = {
  provider: 'supabase',
  projectUrl: '',
  anonKey: '',
  enabled: false,
  lastSyncAt: null,
  lastSyncError: '',
};
const DEFAULT_SYNC_SESSION = {
  accessToken: '',
  refreshToken: '',
  user: null,
};
let syncPushTimer = null;
let suppressAutoSync = false;

async function getSyncSettings() {
  const { syncSettings = {} } = await chrome.storage.local.get('syncSettings');
  const localProjectUrl = (typeof LOCAL_SUPABASE_PROJECT_URL !== 'undefined' && LOCAL_SUPABASE_PROJECT_URL)
    ? String(LOCAL_SUPABASE_PROJECT_URL).trim()
    : '';
  const localAnonKey = (typeof LOCAL_SUPABASE_ANON_KEY !== 'undefined' && LOCAL_SUPABASE_ANON_KEY)
    ? String(LOCAL_SUPABASE_ANON_KEY).trim()
    : '';
  const merged = {
    ...DEFAULT_SYNC_SETTINGS,
    ...(syncSettings && typeof syncSettings === 'object' ? syncSettings : {}),
  };
  if (localProjectUrl) merged.projectUrl = localProjectUrl;
  if (localAnonKey) merged.anonKey = localAnonKey;
  merged.enabled = !!(merged.projectUrl && merged.anonKey);
  return {
    ...merged,
  };
}

async function saveSyncSettings(settings) {
  await chrome.storage.local.set({ syncSettings: settings });
}

async function getSyncSession() {
  const { syncSession = {} } = await chrome.storage.local.get('syncSession');
  return {
    ...DEFAULT_SYNC_SESSION,
    ...(syncSession && typeof syncSession === 'object' ? syncSession : {}),
  };
}

async function saveSyncSession(session) {
  await chrome.storage.local.set({ syncSession: session });
}

async function clearSyncSession() {
  await chrome.storage.local.set({ syncSession: DEFAULT_SYNC_SESSION });
}

async function scheduleAutoSyncPush(delay = 900) {
  const syncSettings = await getSyncSettings();
  const syncSession = await getSyncSession();
  if (!syncSettings.enabled) return;
  if (!syncSession.accessToken || !syncSession.user || !syncSession.user.id) return;
  if (suppressAutoSync) return;

  if (syncPushTimer) clearTimeout(syncPushTimer);
  syncPushTimer = setTimeout(async () => {
    syncPushTimer = null;
    try {
      await pushLocalDataToSupabase();
      const current = await getSyncSettings();
      await saveSyncSettings({ ...current, lastSyncAt: toIsoNow(), lastSyncError: '' });
      await renderSyncStatus();
    } catch (err) {
      console.warn('[wolfy] auto sync push failed:', err);
      const current = await getSyncSettings();
      await saveSyncSettings({ ...current, lastSyncError: String(err.message || err) });
      await renderSyncStatus();
      showToast(t('syncAutoFailed'));
    }
  }, delay);
}

function getSupabaseAuthBase(syncSettings) {
  return `${String(syncSettings.projectUrl || '').replace(/\/+$/, '')}/auth/v1`;
}

async function supabaseAuthRequest(path, { method = 'GET', syncSettings, body, accessToken } = {}) {
  const base = getSupabaseAuthBase(syncSettings);
  const headers = {
    apikey: syncSettings.anonKey,
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body) headers['Content-Type'] = 'application/json';

  const resp = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await resp.text();
  const data = text ? JSON.parse(text) : null;
  if (!resp.ok) {
    const message = data && (data.msg || data.error_description || data.error || data.message);
    throw new Error(message || `auth ${resp.status}`);
  }
  return data;
}

async function signUpWithSupabase(email, password, syncSettings) {
  return supabaseAuthRequest('/signup', {
    method: 'POST',
    syncSettings,
    body: { email, password },
  });
}

async function signInWithSupabase(email, password, syncSettings) {
  return supabaseAuthRequest('/token?grant_type=password', {
    method: 'POST',
    syncSettings,
    body: { email, password },
  });
}

async function fetchSupabaseUser(syncSettings, accessToken) {
  return supabaseAuthRequest('/user', {
    method: 'GET',
    syncSettings,
    accessToken,
  });
}

async function refreshAccessToken(syncSettings, refreshToken) {
  const data = await supabaseAuthRequest('/token?grant_type=refresh_token', {
    method: 'POST',
    syncSettings,
    body: { refresh_token: refreshToken },
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    user: data.user || null,
  };
}

function getSupabaseRestBase(syncSettings) {
  return `${String(syncSettings.projectUrl || '').replace(/\/+$/, '')}/rest/v1`;
}

async function supabaseRestRequest(path, { method = 'GET', syncSettings, accessToken, body, prefer } = {}) {
  const doFetch = async (token) => {
    const headers = {
      apikey: syncSettings.anonKey,
      Authorization: `Bearer ${token}`,
    };
    if (body) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;

    const resp = await fetch(`${getSupabaseRestBase(syncSettings)}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await resp.text();
    const data = text ? JSON.parse(text) : null;
    return { resp, data };
  };

  let { resp, data } = await doFetch(accessToken);

  // Auto-refresh expired token — transparent to all callers
  if (resp.status === 401) {
    const session = await getSyncSession();
    if (session.refreshToken) {
      try {
        const refreshed = await refreshAccessToken(syncSettings, session.refreshToken);
        await saveSyncSession({
          ...session,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          user: refreshed.user || session.user,
        });
        const retry = await doFetch(refreshed.accessToken);
        resp = retry.resp;
        data = retry.data;
      } catch (refreshErr) {
        console.warn('[wolfy] token refresh failed:', refreshErr);
        await clearSyncSession();
        throw new Error('Session expired. Please sign in again.');
      }
    }
  }

  if (!resp.ok) {
    const message = data && (data.message || data.error || data.msg);
    throw new Error(message || `rest ${resp.status}`);
  }
  return data;
}

function toIsoNow() {
  return new Date().toISOString();
}

function formatSyncTime(value) {
  if (!value) return t('syncNever');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('syncNever');
  try {
    const locale = currentLang === 'zh' ? 'zh-CN' : 'en-US';
    return t('syncLastAt', new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date));
  } catch {
    return t('syncNever');
  }
}

async function pushLocalDataToSupabase() {
  const syncSettings = await getSyncSettings();
  const syncSession = await getSyncSession();
  if (!syncSession.accessToken || !syncSession.user || !syncSession.user.id) throw new Error('not signed in');

  const userId = syncSession.user.id;
  const [favorites, socialLinks, backgroundSettings] = await Promise.all([
    getFavorites(),
    getSocialLinks(),
    getBackgroundSettings(),
  ]);
  const { theme = 'light', lang = 'en' } = await chrome.storage.local.get(['theme', 'lang']);
  const now = toIsoNow();

  await supabaseRestRequest(`/user_settings?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'POST',
    syncSettings,
    accessToken: syncSession.accessToken,
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [{
      user_id: userId,
      theme,
      lang,
      background_image_url: backgroundSettings.imageUrl || backgroundSettings.imageDataUrl || '',
      background_brightness: backgroundSettings.brightness ?? DEFAULT_BACKGROUND_SETTINGS.brightness,
      background_blur: backgroundSettings.blur ?? DEFAULT_BACKGROUND_SETTINGS.blur,
      updated_at: now,
    }],
  });

  await supabaseRestRequest(`/social_links?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'POST',
    syncSettings,
    accessToken: syncSession.accessToken,
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [{
      user_id: userId,
      x_url: socialLinks.x || '',
      instagram_url: socialLinks.instagram || '',
      github_url: socialLinks.github || '',
      updated_at: now,
    }],
  });

  await supabaseRestRequest(`/favorites?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    syncSettings,
    accessToken: syncSession.accessToken,
  });

  if (favorites.length > 0) {
    await supabaseRestRequest('/favorites', {
      method: 'POST',
      syncSettings,
      accessToken: syncSession.accessToken,
      prefer: 'return=minimal',
      body: favorites.map((fav) => ({
        user_id: userId,
        url: fav.url,
        title: fav.title,
        slot: fav.slot ?? 0,
        custom_logo_url: fav.customLogo || '',
        created_at: fav.addedAt || now,
        updated_at: now,
      })),
    });
  }
}

async function pullCloudDataFromSupabase() {
  const syncSettings = await getSyncSettings();
  const syncSession = await getSyncSession();
  if (!syncSession.accessToken || !syncSession.user || !syncSession.user.id) throw new Error('not signed in');

  const userId = syncSession.user.id;
  const [settingsRows, socialRows, favoritesRows] = await Promise.all([
    supabaseRestRequest(`/user_settings?user_id=eq.${encodeURIComponent(userId)}&select=*`, {
      method: 'GET',
      syncSettings,
      accessToken: syncSession.accessToken,
    }),
    supabaseRestRequest(`/social_links?user_id=eq.${encodeURIComponent(userId)}&select=*`, {
      method: 'GET',
      syncSettings,
      accessToken: syncSession.accessToken,
    }),
    supabaseRestRequest(`/favorites?user_id=eq.${encodeURIComponent(userId)}&select=*&order=slot.asc`, {
      method: 'GET',
      syncSettings,
      accessToken: syncSession.accessToken,
    }),
  ]);

  const settingsRow = Array.isArray(settingsRows) ? settingsRows[0] : null;
  const socialRow = Array.isArray(socialRows) ? socialRows[0] : null;
  const favorites = Array.isArray(favoritesRows) ? favoritesRows : [];

  suppressAutoSync = true;
  try {
    if (settingsRow) {
      if (settingsRow.theme) await chrome.storage.local.set({ theme: settingsRow.theme });
      if (settingsRow.lang) await chrome.storage.local.set({ lang: settingsRow.lang });
      await saveBackgroundSettings({
        imageUrl: settingsRow.background_image_url || '',
        imageDataUrl: '',
        brightness: settingsRow.background_brightness ?? DEFAULT_BACKGROUND_SETTINGS.brightness,
        blur: settingsRow.background_blur ?? DEFAULT_BACKGROUND_SETTINGS.blur,
      });
    }

    if (socialRow) {
      await saveSocialLinks({
        x: socialRow.x_url || '',
        instagram: socialRow.instagram_url || '',
        github: socialRow.github_url || '',
      });
    }

    await chrome.storage.local.set({
      favorites: favorites.map((fav, index) => ({
        id: `${fav.id || Date.now()}-${index}`,
        url: fav.url,
        title: fav.title,
        addedAt: fav.created_at || toIsoNow(),
        slot: typeof fav.slot === 'number' ? fav.slot : index,
        customLogo: fav.custom_logo_url || undefined,
      })),
    });

    await loadLang();
    await loadTheme();
    applyBackgroundSettings(await getBackgroundSettings());
    const current = await getSyncSettings();
    await saveSyncSettings({ ...current, lastSyncAt: toIsoNow(), lastSyncError: '' });
  } finally {
    setTimeout(() => { suppressAutoSync = false; }, 300);
  }
}

async function renderSyncStatus() {
  const syncSettings = await getSyncSettings();
  const syncSession = await getSyncSession();
  const statusEl = document.getElementById('syncStatusValue');
  const syncTimeEl = document.getElementById('syncLastSync');
  const guestPanel = document.getElementById('settingsAuthGuest');
  const userPanel = document.getElementById('settingsAuthUser');
  const backgroundPanel = document.getElementById('settingsBackgroundPanel');
  const userEmail = document.getElementById('syncUserEmail');
  const userAvatar = document.getElementById('syncUserAvatar');
  const userSubtitle = document.getElementById('syncUserSubtitle');
  if (!statusEl) return;

  if (!syncSettings.projectUrl || !syncSettings.anonKey) {
    statusEl.textContent = t('syncNotConfigured');
    statusEl.dataset.state = 'idle';
    if (syncTimeEl) syncTimeEl.textContent = t('syncNever');
    if (guestPanel) guestPanel.style.display = 'block';
    if (userPanel) userPanel.style.display = 'none';
    if (backgroundPanel) backgroundPanel.style.display = 'none';
    return;
  }

  if (syncSession && syncSession.user && syncSession.user.email) {
    statusEl.textContent = `${t('syncSignedIn')} · ${syncSession.user.email}`;
    statusEl.dataset.state = 'ready';
    if (syncTimeEl) syncTimeEl.textContent = formatSyncTime(syncSettings.lastSyncAt);
    if (guestPanel) guestPanel.style.display = 'none';
    if (userPanel) userPanel.style.display = 'block';
    if (backgroundPanel) backgroundPanel.style.display = 'block';
    if (userEmail) userEmail.textContent = syncSession.user.email;
    if (userAvatar) userAvatar.textContent = String(syncSession.user.email || 'U').trim().charAt(0).toUpperCase() || 'U';
    if (userSubtitle) userSubtitle.textContent = t('syncActiveSubtitle');
    return;
  }

  statusEl.textContent = t('syncReady');
  statusEl.dataset.state = 'configured';
  if (syncTimeEl) syncTimeEl.textContent = formatSyncTime(syncSettings.lastSyncAt);
  if (guestPanel) guestPanel.style.display = 'block';
  if (userPanel) userPanel.style.display = 'none';
  if (backgroundPanel) backgroundPanel.style.display = 'none';
}
