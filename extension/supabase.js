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
const SYNCED_FAVORITE_URLS_KEY = 'syncedFavoriteUrls';
const SYNCED_WORKSPACE_SNAPSHOT_IDS_KEY = 'syncedWorkspaceSnapshotIds';
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

function timeValue(value) {
  if (!value) return 0;
  const date = new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? 0 : time;
}

function latestFavoriteTimestamp(fav) {
  return fav.updatedAt || fav.updated_at || fav.addedAt || fav.created_at || '';
}

function normalizeLocalFavorite(fav, index = 0) {
  const now = toIsoNow();
  return {
    id: fav.id || `${Date.now()}-${index}`,
    url: fav.url,
    title: fav.title || fav.url,
    addedAt: fav.addedAt || fav.created_at || now,
    updatedAt: fav.updatedAt || fav.updated_at || fav.addedAt || fav.created_at || now,
    slot: typeof fav.slot === 'number' ? fav.slot : index,
    customLogo: fav.customLogo || fav.custom_logo_url || undefined,
    iconUrl: fav.iconUrl || undefined,
  };
}

function normalizeCloudFavorite(fav, index = 0) {
  return normalizeLocalFavorite({
    id: `${fav.id || Date.now()}-${index}`,
    url: fav.url,
    title: fav.title,
    addedAt: fav.created_at,
    updatedAt: fav.updated_at || fav.created_at,
    slot: fav.slot,
    customLogo: fav.custom_logo_url || undefined,
  }, index);
}

function favoriteIsNewer(a, b) {
  return timeValue(latestFavoriteTimestamp(a)) > timeValue(latestFavoriteTimestamp(b));
}

function compactFavoriteSlots(favorites) {
  const sorted = favorites
    .filter(fav => fav && fav.url)
    .sort((a, b) => {
      const slotDiff = (a.slot ?? 0) - (b.slot ?? 0);
      if (slotDiff !== 0) return slotDiff;
      return timeValue(a.addedAt) - timeValue(b.addedAt);
    });

  return sorted.map((fav, index) => ({
    ...fav,
    slot: index,
  }));
}

function mergeFavorites(localFavorites, cloudFavorites) {
  const byUrl = new Map();
  for (const [index, fav] of localFavorites.entries()) {
    if (!fav || !fav.url) continue;
    byUrl.set(fav.url, normalizeLocalFavorite(fav, index));
  }

  for (const [index, rawCloudFav] of cloudFavorites.entries()) {
    if (!rawCloudFav || !rawCloudFav.url) continue;
    const cloudFav = normalizeCloudFavorite(rawCloudFav, index);
    const localFav = byUrl.get(cloudFav.url);
    if (!localFav) {
      byUrl.set(cloudFav.url, cloudFav);
      continue;
    }

    const winner = favoriteIsNewer(cloudFav, localFav) ? cloudFav : localFav;
    byUrl.set(cloudFav.url, {
      ...winner,
      iconUrl: localFav.iconUrl,
      customLogo: winner.customLogo || localFav.customLogo || undefined,
      addedAt: timeValue(localFav.addedAt) <= timeValue(cloudFav.addedAt)
        ? localFav.addedAt
        : cloudFav.addedAt,
    });
  }

  return compactFavoriteSlots(Array.from(byUrl.values()));
}

function normalizeLocalWorkspaceSnapshot(snapshot) {
  const now = toIsoNow();
  return {
    id: String(snapshot.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    name: snapshot.name || snapshotDefaultName(),
    createdAt: snapshot.createdAt || snapshot.created_at || now,
    updatedAt: snapshot.updatedAt || snapshot.updated_at || snapshot.createdAt || snapshot.created_at || now,
    tabs: Array.isArray(snapshot.tabs) ? snapshot.tabs : [],
  };
}

function normalizeCloudWorkspaceSnapshot(snapshot) {
  return normalizeLocalWorkspaceSnapshot({
    id: snapshot.snapshot_id || snapshot.id,
    name: snapshot.name,
    createdAt: snapshot.created_at,
    updatedAt: snapshot.updated_at || snapshot.created_at,
    tabs: Array.isArray(snapshot.tabs) ? snapshot.tabs : [],
  });
}

function workspaceSnapshotIsNewer(a, b) {
  return timeValue(a.updatedAt || a.updated_at || a.createdAt || a.created_at)
    > timeValue(b.updatedAt || b.updated_at || b.createdAt || b.created_at);
}

function mergeWorkspaceSnapshots(localSnapshots, cloudSnapshots) {
  const byId = new Map();
  for (const snapshot of localSnapshots) {
    if (!snapshot || !snapshot.id) continue;
    const localSnapshot = normalizeLocalWorkspaceSnapshot(snapshot);
    byId.set(localSnapshot.id, localSnapshot);
  }

  for (const rawCloudSnapshot of cloudSnapshots) {
    if (!rawCloudSnapshot || !(rawCloudSnapshot.snapshot_id || rawCloudSnapshot.id)) continue;
    const cloudSnapshot = normalizeCloudWorkspaceSnapshot(rawCloudSnapshot);
    const localSnapshot = byId.get(cloudSnapshot.id);
    byId.set(
      cloudSnapshot.id,
      localSnapshot && !workspaceSnapshotIsNewer(cloudSnapshot, localSnapshot)
        ? localSnapshot
        : cloudSnapshot
    );
  }

  return Array.from(byId.values())
    .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
}

async function getSyncedFavoriteUrls() {
  const stored = await chrome.storage.local.get(SYNCED_FAVORITE_URLS_KEY);
  const urls = stored[SYNCED_FAVORITE_URLS_KEY];
  return Array.isArray(urls) ? new Set(urls.filter(Boolean)) : new Set();
}

async function saveSyncedFavoriteUrls(favorites) {
  const urls = favorites
    .map((fav) => fav && fav.url)
    .filter(Boolean);
  await chrome.storage.local.set({ [SYNCED_FAVORITE_URLS_KEY]: Array.from(new Set(urls)) });
}

async function getSyncedWorkspaceSnapshotIds() {
  const stored = await chrome.storage.local.get(SYNCED_WORKSPACE_SNAPSHOT_IDS_KEY);
  const ids = stored[SYNCED_WORKSPACE_SNAPSHOT_IDS_KEY];
  return Array.isArray(ids) ? new Set(ids.filter(Boolean)) : new Set();
}

async function saveSyncedWorkspaceSnapshotIds(snapshots) {
  const ids = snapshots
    .map((snapshot) => snapshot && snapshot.id)
    .filter(Boolean);
  await chrome.storage.local.set({ [SYNCED_WORKSPACE_SNAPSHOT_IDS_KEY]: Array.from(new Set(ids)) });
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
  const [favorites, socialLinks, backgroundSettings, workspaceSnapshots] = await Promise.all([
    getFavorites(),
    getSocialLinks(),
    getBackgroundSettings(),
    getWorkspaceSnapshots(),
  ]);
  const { theme = 'light', lang = 'en' } = await chrome.storage.local.get(['theme', 'lang']);
  const now = toIsoNow();
  const normalizedFavorites = compactFavoriteSlots(
    favorites.map((fav, index) => normalizeLocalFavorite(fav, index))
  );
  const normalizedSnapshots = workspaceSnapshots.map(normalizeLocalWorkspaceSnapshot);

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

  if (normalizedFavorites.length > 0) {
    await chrome.storage.local.set({ favorites: normalizedFavorites });

    await supabaseRestRequest('/favorites?on_conflict=user_id,url', {
      method: 'POST',
      syncSettings,
      accessToken: syncSession.accessToken,
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: normalizedFavorites.map((fav) => ({
        user_id: userId,
        url: fav.url,
        title: fav.title,
        slot: fav.slot ?? 0,
        custom_logo_url: fav.customLogo || '',
        created_at: fav.addedAt || now,
        updated_at: fav.updatedAt || now,
      })),
    });
  }

  const cloudFavorites = await supabaseRestRequest(`/favorites?user_id=eq.${encodeURIComponent(userId)}&select=url`, {
    method: 'GET',
    syncSettings,
    accessToken: syncSession.accessToken,
  });
  const localUrls = new Set(normalizedFavorites.map((fav) => fav.url).filter(Boolean));
  const previouslySyncedUrls = await getSyncedFavoriteUrls();
  const deletedUrls = (Array.isArray(cloudFavorites) ? cloudFavorites : [])
    .map((fav) => fav && fav.url)
    .filter((url) => url && !localUrls.has(url) && previouslySyncedUrls.has(url));

  for (const url of deletedUrls) {
    await supabaseRestRequest(
      `/favorites?user_id=eq.${encodeURIComponent(userId)}&url=eq.${encodeURIComponent(url)}`,
      {
        method: 'DELETE',
        syncSettings,
        accessToken: syncSession.accessToken,
      }
    );
  }

  await saveSyncedFavoriteUrls(normalizedFavorites);

  if (normalizedSnapshots.length > 0) {
    await saveWorkspaceSnapshots(normalizedSnapshots);

    await supabaseRestRequest('/workspace_snapshots?on_conflict=user_id,snapshot_id', {
      method: 'POST',
      syncSettings,
      accessToken: syncSession.accessToken,
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: normalizedSnapshots.map((snapshot) => ({
        user_id: userId,
        snapshot_id: snapshot.id,
        name: snapshot.name,
        tabs: snapshot.tabs,
        created_at: snapshot.createdAt || now,
        updated_at: snapshot.updatedAt || now,
      })),
    });
  }

  const cloudSnapshots = await supabaseRestRequest(`/workspace_snapshots?user_id=eq.${encodeURIComponent(userId)}&select=snapshot_id`, {
    method: 'GET',
    syncSettings,
    accessToken: syncSession.accessToken,
  });
  const localSnapshotIds = new Set(normalizedSnapshots.map((snapshot) => snapshot.id).filter(Boolean));
  const previouslySyncedSnapshotIds = await getSyncedWorkspaceSnapshotIds();
  const deletedSnapshotIds = (Array.isArray(cloudSnapshots) ? cloudSnapshots : [])
    .map((snapshot) => snapshot && snapshot.snapshot_id)
    .filter((id) => id && !localSnapshotIds.has(id) && previouslySyncedSnapshotIds.has(id));

  for (const id of deletedSnapshotIds) {
    await supabaseRestRequest(
      `/workspace_snapshots?user_id=eq.${encodeURIComponent(userId)}&snapshot_id=eq.${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        syncSettings,
        accessToken: syncSession.accessToken,
      }
    );
  }

  await saveSyncedWorkspaceSnapshotIds(normalizedSnapshots);
}

async function pullCloudDataFromSupabase() {
  const syncSettings = await getSyncSettings();
  const syncSession = await getSyncSession();
  if (!syncSession.accessToken || !syncSession.user || !syncSession.user.id) throw new Error('not signed in');

  const userId = syncSession.user.id;
  const [settingsRows, socialRows, favoritesRows, snapshotRows] = await Promise.all([
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
    supabaseRestRequest(`/workspace_snapshots?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc`, {
      method: 'GET',
      syncSettings,
      accessToken: syncSession.accessToken,
    }),
  ]);

  const settingsRow = Array.isArray(settingsRows) ? settingsRows[0] : null;
  const socialRow = Array.isArray(socialRows) ? socialRows[0] : null;
  const cloudFavorites = Array.isArray(favoritesRows) ? favoritesRows : [];
  const cloudSnapshots = Array.isArray(snapshotRows) ? snapshotRows : [];
  const localFavorites = await getFavorites();
  const localSnapshots = await getWorkspaceSnapshots();
  const mergedFavorites = mergeFavorites(localFavorites, cloudFavorites);
  const mergedSnapshots = mergeWorkspaceSnapshots(localSnapshots, cloudSnapshots);

  suppressAutoSync = true;
  try {
    if (settingsRow) {
      if (settingsRow.theme) await chrome.storage.local.set({ theme: settingsRow.theme });
      if (settingsRow.lang) await chrome.storage.local.set({ lang: settingsRow.lang });
      const backgroundImage = settingsRow.background_image_url || '';
      const isInlineBackgroundImage = /^data:image\//i.test(backgroundImage);
      await saveBackgroundSettings({
        imageUrl: isInlineBackgroundImage ? '' : backgroundImage,
        imageDataUrl: isInlineBackgroundImage ? backgroundImage : '',
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
      favorites: mergedFavorites,
    });
    await saveWorkspaceSnapshots(mergedSnapshots);
    await saveSyncedFavoriteUrls(mergedFavorites);
    await saveSyncedWorkspaceSnapshotIds(mergedSnapshots);

    await loadLang();
    await loadTheme();
    applyBackgroundSettings(await getBackgroundSettings());
    const current = await getSyncSettings();
    await saveSyncSettings({ ...current, lastSyncAt: toIsoNow(), lastSyncError: '' });
  } finally {
    setTimeout(() => { suppressAutoSync = false; }, 300);
  }

  await pushLocalDataToSupabase();
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
