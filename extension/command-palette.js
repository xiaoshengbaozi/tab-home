/* ================================================================
   command-palette.js — Search tabs, favorites, snapshots, and actions.
   ================================================================ */

'use strict';

const COMMAND_PALETTE_MAX_RESULTS = 18;
let commandPaletteItems = [];
let commandPaletteSelectedIndex = 0;
let commandPaletteSpacePending = false;
let commandPaletteSpaceTimer = null;

function commandIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" /></svg>`;
}

function isCommandPaletteOpen() {
  const modal = document.getElementById('commandPaletteModal');
  return !!modal && modal.style.display !== 'none';
}

function closeCommandPalette() {
  const modal = document.getElementById('commandPaletteModal');
  if (modal) modal.style.display = 'none';
}

async function openCommandPalette() {
  const modal = document.getElementById('commandPaletteModal');
  const input = document.getElementById('commandPaletteInput');
  if (!modal || !input) return;
  await buildCommandPaletteItems();
  input.value = '';
  commandPaletteSelectedIndex = 0;
  renderCommandPaletteResults('');
  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 0);
}

function normalizeSearchText(value) {
  return String(value || '').trim().toLowerCase();
}

function makeCommandItem({ type, title, subtitle = '', action, url = '', id = '', keywords = '' }) {
  return {
    type,
    title,
    subtitle,
    action,
    url,
    id,
    searchText: normalizeSearchText(`${type} ${title} ${subtitle} ${url} ${keywords}`),
  };
}

async function buildCommandPaletteItems() {
  await fetchOpenTabs();
  const realTabs = getRealTabs();
  const favorites = await getFavorites();
  const snapshots = await getWorkspaceSnapshots();

  const tabItems = realTabs.map(tab => makeCommandItem({
    type: t('commandTypeTab'),
    title: cleanTitle(smartTitle(stripTitleNoise(tab.title || ''), tab.url), ''),
    subtitle: tab.url || '',
    action: 'focus-tab',
    url: tab.url || '',
    id: String(tab.id || ''),
  }));

  const favoriteItems = favorites.map(fav => makeCommandItem({
    type: t('commandTypeFavorite'),
    title: fav.title || fav.url,
    subtitle: fav.url || '',
    action: 'open-url',
    url: fav.url || '',
    id: fav.id || '',
  }));

  const snapshotItems = snapshots.map(snapshot => makeCommandItem({
    type: t('commandTypeSnapshot'),
    title: snapshot.name || snapshotDefaultName(),
    subtitle: t('snapshotMeta', snapshot.tabs.length, formatSnapshotDate(snapshot.createdAt)),
    action: 'restore-snapshot',
    id: snapshot.id,
    keywords: (snapshot.tabs || []).map(tab => `${tab.title || ''} ${tab.url || ''}`).join(' '),
  }));

  const actionItems = [
    makeCommandItem({
      type: t('commandTypeAction'),
      title: t('saveCurrentSnapshot'),
      subtitle: t('commandSaveSnapshotHint'),
      action: 'save-snapshot',
      keywords: 'snapshot workspace save tabs',
    }),
    makeCommandItem({
      type: t('commandTypeAction'),
      title: t('workspaceSnapshots'),
      subtitle: t('commandOpenSnapshotsHint'),
      action: 'open-snapshots',
      keywords: 'snapshot workspace restore tabs',
    }),
    makeCommandItem({
      type: t('commandTypeAction'),
      title: t('settings'),
      subtitle: t('commandOpenSettingsHint'),
      action: 'open-settings',
      keywords: 'settings sync background account',
    }),
    makeCommandItem({
      type: t('commandTypeAction'),
      title: t('closeDupes'),
      subtitle: t('commandCloseDupesHint'),
      action: 'close-duplicates',
      keywords: 'duplicate close cleanup tabs',
    }),
  ];

  commandPaletteItems = [...actionItems, ...tabItems, ...favoriteItems, ...snapshotItems];
}

function getCommandPaletteMatches(query) {
  const q = normalizeSearchText(query);
  if (!q) return commandPaletteItems.slice(0, COMMAND_PALETTE_MAX_RESULTS);
  const parts = q.split(/\s+/).filter(Boolean);
  return commandPaletteItems
    .filter(item => parts.every(part => item.searchText.includes(part)))
    .slice(0, COMMAND_PALETTE_MAX_RESULTS);
}

function renderCommandPaletteResults(query) {
  const list = document.getElementById('commandPaletteResults');
  const empty = document.getElementById('commandPaletteEmpty');
  if (!list || !empty) return;
  const matches = getCommandPaletteMatches(query);
  commandPaletteSelectedIndex = Math.min(commandPaletteSelectedIndex, Math.max(matches.length - 1, 0));

  if (matches.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = matches.map((item, index) => `
    <button type="button" class="command-result ${index === commandPaletteSelectedIndex ? 'selected' : ''}" data-action="run-command-palette-item" data-command-index="${index}">
      <span class="command-result-type">${escapeHtml(item.type)}</span>
      <span class="command-result-main">
        <span class="command-result-title">${escapeHtml(item.title || item.url)}</span>
        <span class="command-result-subtitle">${escapeHtml(item.subtitle || item.url)}</span>
      </span>
    </button>
  `).join('');
}

async function runCommandPaletteItem(index = commandPaletteSelectedIndex) {
  const input = document.getElementById('commandPaletteInput');
  const matches = getCommandPaletteMatches(input ? input.value : '');
  const item = matches[index];
  if (!item) return;
  closeCommandPalette();

  if (item.action === 'focus-tab') {
    const tabId = parseInt(item.id, 10);
    if (!Number.isNaN(tabId)) {
      try {
        const tab = await chrome.tabs.get(tabId);
        await chrome.tabs.update(tabId, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
        return;
      } catch {}
    }
    if (item.url) await focusTab(item.url);
    return;
  }

  if (item.action === 'open-url') {
    if (item.url) await chrome.tabs.create({ url: item.url, active: true });
    return;
  }

  if (item.action === 'restore-snapshot') {
    const opened = await restoreWorkspaceSnapshot(item.id);
    await renderDashboard();
    showToast(t('restoredSnapshot', opened));
    return;
  }

  if (item.action === 'save-snapshot') {
    const snapshot = await createWorkspaceSnapshot('');
    showToast(snapshot ? t('snapshotSaved', snapshot.tabs.length) : t('snapshotEmpty'));
    return;
  }

  if (item.action === 'open-snapshots') {
    const modal = document.getElementById('snapshotsModal');
    const inputEl = document.getElementById('snapshotNameInput');
    if (inputEl) inputEl.value = '';
    await renderSnapshotsModal();
    if (modal) modal.style.display = 'flex';
    if (inputEl) setTimeout(() => inputEl.focus(), 0);
    return;
  }

  if (item.action === 'open-settings') {
    document.getElementById('settingsToggle')?.click();
    return;
  }

  if (item.action === 'close-duplicates') {
    await fetchOpenTabs();
    const counts = new Map();
    for (const tab of getRealTabs()) counts.set(tab.url, (counts.get(tab.url) || 0) + 1);
    const urls = Array.from(counts.entries()).filter(([, count]) => count > 1).map(([url]) => url);
    if (urls.length === 0) {
      showToast(t('noDuplicates'));
      return;
    }
    await closeDuplicateTabs(urls, true);
    await renderDashboard();
    showToast(t('closedDupes'));
  }
}
