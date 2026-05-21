/* ================================================================
   snapshots.js — Save and restore open-tab workspace snapshots.
   ================================================================ */

'use strict';

const WORKSPACE_SNAPSHOTS_KEY = 'workspaceSnapshots';
const MAX_SNAPSHOT_TABS = 200;

async function getWorkspaceSnapshots() {
  const stored = await chrome.storage.local.get(WORKSPACE_SNAPSHOTS_KEY);
  const snapshots = stored[WORKSPACE_SNAPSHOTS_KEY];
  return Array.isArray(snapshots)
    ? snapshots
        .filter(snapshot => snapshot && snapshot.id && Array.isArray(snapshot.tabs))
        .sort((a, b) => timeValueSnapshot(b.createdAt) - timeValueSnapshot(a.createdAt))
    : [];
}

function timeValueSnapshot(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

async function saveWorkspaceSnapshots(snapshots) {
  await chrome.storage.local.set({ [WORKSPACE_SNAPSHOTS_KEY]: snapshots });
}

async function refreshWorkspaceSnapshotsViews() {
  await Promise.all([
    renderSnapshotsModal(),
    renderWorkspaceSnapshotsColumn(),
  ]);
}

function snapshotDefaultName() {
  try {
    const locale = currentLang === 'zh' ? 'zh-CN' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toLocaleString();
  }
}

function isRestorableUrl(url) {
  if (typeof url !== 'string') return false;
  return /^https?:\/\//i.test(url) || /^file:\/\//i.test(url);
}

async function createWorkspaceSnapshot(name) {
  await fetchOpenTabs();
  const tabs = getRealTabs()
    .filter(tab => isRestorableUrl(tab.url))
    .slice(0, MAX_SNAPSHOT_TABS)
    .map(tab => ({
      url: tab.url,
      title: tab.title || tab.url,
      pinned: !!tab.pinned,
    }));

  if (tabs.length === 0) return null;

  const now = new Date().toISOString();
  const snapshot = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: (name || '').trim() || snapshotDefaultName(),
    createdAt: now,
    updatedAt: now,
    tabs,
  };

  const snapshots = await getWorkspaceSnapshots();
  snapshots.unshift(snapshot);
  await saveWorkspaceSnapshots(snapshots);
  return snapshot;
}

async function removeWorkspaceSnapshot(id) {
  if (!id) return;
  const snapshots = await getWorkspaceSnapshots();
  await saveWorkspaceSnapshots(snapshots.filter(snapshot => snapshot.id !== id));
}

async function restoreWorkspaceSnapshot(id) {
  const snapshots = await getWorkspaceSnapshots();
  const snapshot = snapshots.find(item => item.id === id);
  if (!snapshot) return 0;

  let opened = 0;
  for (const tab of snapshot.tabs) {
    if (!isRestorableUrl(tab.url)) continue;
    try {
      await chrome.tabs.create({
        url: tab.url,
        active: false,
        pinned: !!tab.pinned,
      });
      opened++;
    } catch (err) {
      console.warn('[wolfy] restore snapshot tab failed:', err);
    }
  }
  return opened;
}

function formatSnapshotDate(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';
  try {
    const locale = currentLang === 'zh' ? 'zh-CN' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

const SNAPSHOT_PALETTES = [
  { bg: '58, 181, 78', ink: '255, 255, 255', muted: '226, 255, 229' },
  { bg: '246, 45, 49', ink: '255, 255, 255', muted: '255, 226, 226' },
  { bg: '43, 160, 238', ink: '255, 255, 255', muted: '224, 244, 255' },
  { bg: '247, 116, 31', ink: '255, 255, 255', muted: '255, 235, 214' },
  { bg: '99, 87, 233', ink: '255, 255, 255', muted: '232, 229, 255' },
  { bg: '32, 176, 217', ink: '255, 255, 255', muted: '219, 248, 255' },
  { bg: '180, 117, 47', ink: '255, 255, 255', muted: '255, 236, 210' },
  { bg: '197, 72, 231', ink: '255, 255, 255', muted: '249, 224, 255' },
  { bg: '117, 163, 195', ink: '255, 255, 255', muted: '226, 242, 255' },
];

function snapshotPaletteIndex(id) {
  const input = String(id || '');
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % SNAPSHOT_PALETTES.length;
}

function snapshotPaletteStyle(snapshot) {
  const palette = SNAPSHOT_PALETTES[snapshotPaletteIndex(snapshot.id)];
  return `--snapshot-bg-rgb:${palette.bg};--snapshot-ink-rgb:${palette.ink};--snapshot-muted-rgb:${palette.muted};`;
}

function renderSnapshotItem(snapshot) {
  const name = escapeHtml(snapshot.name || snapshotDefaultName());
  const date = escapeHtml(formatSnapshotDate(snapshot.createdAt));
  const count = Array.isArray(snapshot.tabs) ? snapshot.tabs.length : 0;
  const preview = escapeHtml(
    (snapshot.tabs || [])
      .slice(0, 3)
      .map(tab => {
        try { return friendlyDomain(new URL(tab.url).hostname); }
        catch { return tab.title || tab.url; }
      })
      .join(' / ')
  );

  return `
    <div class="snapshot-item snapshot-color-card" style="${snapshotPaletteStyle(snapshot)}">
      <div class="snapshot-row">
        <div class="snapshot-name">${name}</div>
        <div class="snapshot-actions">
          <button type="button" class="snapshot-action-btn" data-action="restore-snapshot" data-snapshot-id="${escapeHtml(snapshot.id)}" title="${t('restoreSnapshot')}">${t('restore')}</button>
          <button type="button" class="snapshot-action-btn snapshot-action-danger" data-action="delete-snapshot" data-snapshot-id="${escapeHtml(snapshot.id)}" title="${t('deleteSnapshot')}">${t('remove')}</button>
        </div>
      </div>
      <div class="snapshot-meta">${t('snapshotMeta', count, date)}</div>
      ${preview ? `<div class="snapshot-preview">${preview}</div>` : ''}
    </div>`;
}

async function renderSnapshotsModal() {
  const list = document.getElementById('snapshotsList');
  const empty = document.getElementById('snapshotsEmpty');
  if (!list || !empty) return;

  const snapshots = await getWorkspaceSnapshots();
  if (snapshots.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = snapshots.map(renderSnapshotItem).join('');
}

async function renderWorkspaceSnapshotsColumn() {
  const list = document.getElementById('workspaceSnapshotsList');
  const empty = document.getElementById('workspaceSnapshotsEmpty');
  if (!list || !empty) return;

  const snapshots = await getWorkspaceSnapshots();
  if (snapshots.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = snapshots.map(renderSnapshotItem).join('');
}
