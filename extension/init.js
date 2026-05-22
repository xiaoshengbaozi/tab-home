/* ================================================================
   init.js — Live update listeners and initialization.
   ================================================================ */

'use strict';

/* ----------------------------------------------------------------
   LIVE UPDATES — re-render whenever Chrome's tab state changes

   Without this, opening a favorite (or any tab change in another window)
   wouldn't show up here until the user manually refreshed the page.
   Debounced so a burst of events triggers exactly one re-render.
   ---------------------------------------------------------------- */
let _rerenderTimer = null;
function scheduleLiveRerender() {
  if (_rerenderTimer) clearTimeout(_rerenderTimer);
  _rerenderTimer = setTimeout(() => {
    _rerenderTimer = null;
    renderDashboard();
  }, 150);
}

if (chrome.tabs && chrome.tabs.onCreated) {
  chrome.tabs.onCreated.addListener(scheduleLiveRerender);
  chrome.tabs.onRemoved.addListener(scheduleLiveRerender);
  chrome.tabs.onUpdated.addListener((_id, changeInfo) => {
    if (changeInfo.url || changeInfo.title || 'pinned' in changeInfo || 'audible' in changeInfo || 'mutedInfo' in changeInfo) {
      scheduleLiveRerender();
    }
  });
  chrome.tabs.onMoved.addListener(scheduleLiveRerender);
  if (chrome.tabs.onActivated) chrome.tabs.onActivated.addListener(scheduleLiveRerender);
}

// Storage changes can come from another context (e.g. right-click menu in
// background.js adds a favorite) — re-render so the page stays in sync.
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes.favorites && !_suppressFavReRender) {
      renderFavoritesColumn();
    }
    if (changes[WORKSPACE_SNAPSHOTS_KEY]) {
      renderWorkspaceSnapshotsColumn();
    }

    const syncRelevantKeys = ['favorites', WORKSPACE_SNAPSHOTS_KEY, 'socialLinks', 'backgroundSettings', 'theme', 'lang'];
    if (syncRelevantKeys.some((key) => key in changes)) {
      await scheduleAutoSyncPush();
    }
  });
}


/* ----------------------------------------------------------------
   INITIALIZE
   ---------------------------------------------------------------- */
(async () => {
  try {
    await loadLang();
    await loadTheme();
    await migrateAwayFromFolders();
    applyStaticI18n();
    try {
      const syncSession = await getSyncSession();
      const syncSettings = await getSyncSettings();
      if (syncSettings.enabled && syncSession.accessToken && syncSession.user && syncSession.user.id) {
        await pullCloudDataFromSupabase();
      }
    } catch (err) {
      console.warn('[wolfy] initial auto sync pull failed:', err);
    }
    await renderDashboard();
  } catch (err) {
    console.error('[wolfy] dashboard initialization failed:', err);
  }
})();
