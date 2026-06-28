/* ================================================================
   favorites-store.js — Long-term favorites CRUD using
   chrome.storage.local. Slot-based grid ordering + migration.
   ================================================================ */

'use strict';

/* No hard cap on favorites. The favorites column scrolls when content
   overflows. SLOT_UPPER_BOUND is just a defensive ceiling on slot indices
   — nobody should ever hit it, but it prevents pathological inputs from
   creating a grid with billions of empty cells. */
const SLOT_UPPER_BOUND = 10000;

function favoriteTimestamp() {
  return new Date().toISOString();
}

/* Favorite shape: { id, type:'favorite', url, title, addedAt, slot, customLogo? }
   Folder shape:   { id, type:'folder', title, addedAt, slot, items:[favorite-like] }

   `slot` is an explicit grid index. New favorites are placed at the
   first empty slot. Deleting a card leaves a gap so the rest don't
   shift around. The visible column count can change with screen width;
   cards just reflow into different (row, col) positions while keeping
   their slot index. */

function makeFavoriteId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeFavoriteRecord(raw, index = 0, { nested = false } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const url = normalizeHttpUrl(raw.url, { allowFile: true });
  if (!url) return null;
  const now = favoriteTimestamp();
  const fav = {
    ...raw,
    type: 'favorite',
    id: String(raw.id || makeFavoriteId()),
    url,
    title: raw.title || url,
    addedAt: raw.addedAt || raw.created_at || now,
    updatedAt: raw.updatedAt || raw.updated_at || raw.addedAt || raw.created_at || now,
  };
  delete fav.parentId;
  if (nested) delete fav.slot;
  else fav.slot = typeof raw.slot === 'number' && raw.slot >= 0 ? raw.slot : index;
  return fav;
}

function normalizeFolderRecord(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const items = Array.isArray(raw.items)
    ? raw.items.map((item, itemIndex) => normalizeFavoriteRecord(item, itemIndex, { nested: true })).filter(Boolean)
    : [];
  const now = favoriteTimestamp();
  return {
    type: 'folder',
    id: String(raw.id || makeFavoriteId()),
    title: raw.title || 'Folder',
    addedAt: raw.addedAt || raw.created_at || now,
    updatedAt: raw.updatedAt || raw.updated_at || raw.addedAt || raw.created_at || now,
    slot: typeof raw.slot === 'number' && raw.slot >= 0 ? raw.slot : index,
    items,
  };
}

function normalizeFavoriteTree(raw = []) {
  return (Array.isArray(raw) ? raw : [])
    .map((item, index) => item && item.type === 'folder'
      ? normalizeFolderRecord(item, index)
      : normalizeFavoriteRecord(item, index))
    .filter(Boolean);
}

async function getFavorites() {
  const { favorites = [] } = await chrome.storage.local.get('favorites');
  return normalizeFavoriteTree(favorites);
}

async function saveFavorites(favorites) {
  await chrome.storage.local.set({ favorites: normalizeFavoriteTree(favorites) });
}

function getFlatFavorites(favorites) {
  return (favorites || []).flatMap(item => {
    if (!item) return [];
    if (item.type === 'folder') return item.items || [];
    return item.url ? [item] : [];
  });
}

function favoriteWithoutSlot(fav) {
  const { slot, ...rest } = fav;
  return {
    ...rest,
    type: 'favorite',
    id: rest.id || makeFavoriteId(),
    updatedAt: favoriteTimestamp(),
  };
}

function firstFreeSlot(favorites) {
  const taken = new Set(favorites.map(f => f.slot));
  let slot = 0;
  while (taken.has(slot)) slot++;
  return slot;
}

async function addFavorite(url, title, customLogo = null) {
  url = normalizeHttpUrl(url, { allowFile: true });
  if (!url) return false;
  const favorites = await getFavorites();
  if (getFlatFavorites(favorites).some(f => f.url === url)) return false;

  const cleanTitle = (title || '').trim();
  let finalTitle;
  if (cleanTitle) {
    finalTitle = cleanTitle;
  } else {
    try { finalTitle = friendlyDomain(new URL(url).hostname) || url; }
    catch { finalTitle = url; }
  }

  const fav = {
    id:      makeFavoriteId(),
    type:    'favorite',
    url,
    title:   finalTitle,
    addedAt: new Date().toISOString(),
    updatedAt: favoriteTimestamp(),
    slot:    firstFreeSlot(favorites),
  };
  if (customLogo) fav.customLogo = customLogo;
  favorites.push(fav);
  await saveFavorites(favorites);
  return true;
}

/**
 * Set a favorite's slot. If another favorite already owns that slot,
 * swap their slots — gives users predictable "click-and-place" behaviour
 * during drag-and-drop reordering.
 */
async function setFavoriteSlot(id, newSlot) {
  if (!id || typeof newSlot !== 'number') return;
  if (newSlot < 0 || newSlot >= SLOT_UPPER_BOUND) return;
  const favorites = await getFavorites();
  const dragged = favorites.find(f => f.id === id);
  if (!dragged) return;
  if (dragged.slot === newSlot) return;
  const occupant = favorites.find(f => f.slot === newSlot);
  if (occupant) occupant.slot = dragged.slot;
  dragged.slot = newSlot;
  dragged.updatedAt = favoriteTimestamp();
  if (occupant) occupant.updatedAt = favoriteTimestamp();
  await saveFavorites(favorites);
}

/**
 * One-time migration:
 *  - Preserve folder entries and normalize legacy flat favorites.
 *  - Ensure every favorite has a non-negative slot. Slots that collide
 *    are reassigned to the first free slot. No upper bound — favorites
 *    are unlimited.
 * Idempotent.
 */
async function migrateAwayFromFolders() {
  const { favorites: raw = [] } = await chrome.storage.local.get('favorites');
  if (!raw.length) return;

  const before = JSON.stringify(raw);
  const cleaned = normalizeFavoriteTree(raw);

  let next = 0;
  const taken = new Set();
  const needSlot = [];
  for (const f of cleaned) {
    const valid = typeof f.slot === 'number' && f.slot >= 0 && !taken.has(f.slot);
    if (valid) taken.add(f.slot);
    else       needSlot.push(f);
  }

  for (const f of needSlot) {
    while (taken.has(next)) next++;
    f.slot = next;
    taken.add(next);
  }

  const final = cleaned;

  if (JSON.stringify(final) !== before) {
    await saveFavorites(final);
  }
}

/**
 * updateFavorite(id, fields)
 *
 * Patches a favorite by id. Pass `customLogo: null` to delete the
 * custom logo and revert to the auto-fetched favicon.
 */
async function updateFavorite(id, fields) {
  const favorites = await getFavorites();
  const fav = getFlatFavorites(favorites).find(f => f.id === id);
  if (!fav) return;
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'url') {
      const normalizedUrl = normalizeHttpUrl(v, { allowFile: true });
      if (!normalizedUrl) continue;
      fav.url = normalizedUrl;
      continue;
    }
    if (k === 'customLogo' && v === null) delete fav.customLogo;
    else fav[k] = v;
  }
  fav.updatedAt = favoriteTimestamp();
  await saveFavorites(favorites);
}

async function removeFavorite(id) {
  const favorites = await getFavorites();
  const { autoDeleteEmptyFolders = true } = await chrome.storage.local.get('autoDeleteEmptyFolders');
  const next = favorites
    .filter(item => item.id !== id)
    .map(item => item.type === 'folder'
      ? { ...item, items: (item.items || []).filter(fav => fav.id !== id), updatedAt: favoriteTimestamp() }
      : item)
    .filter(item => item.type !== 'folder' || !autoDeleteEmptyFolders || item.items.length > 0);
  await saveFavorites(next);
}

async function isFavorited(url) {
  const normalizedUrl = normalizeHttpUrl(url, { allowFile: true });
  const favorites = await getFavorites();
  return getFlatFavorites(favorites).some(f => f.url === normalizedUrl);
}

async function findFavoriteByUrl(url) {
  const normalizedUrl = normalizeHttpUrl(url, { allowFile: true });
  const favorites = await getFavorites();
  return getFlatFavorites(favorites).find(f => f.url === normalizedUrl) || null;
}

async function getFolder(folderId) {
  const favorites = await getFavorites();
  return favorites.find(item => item.type === 'folder' && item.id === folderId) || null;
}

async function updateFolder(folderId, fields) {
  const favorites = await getFavorites();
  const folder = favorites.find(item => item.type === 'folder' && item.id === folderId);
  if (!folder) return;
  if ('title' in fields) folder.title = String(fields.title || '').trim() || 'Folder';
  folder.updatedAt = favoriteTimestamp();
  await saveFavorites(favorites);
}

async function createFolderWithFavorites(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return false;
  const favorites = await getFavorites();
  const source = favorites.find(item => item.type !== 'folder' && item.id === sourceId);
  const target = favorites.find(item => item.type !== 'folder' && item.id === targetId);
  if (!source || !target) return false;

  const now = favoriteTimestamp();
  const folder = {
    id: makeFavoriteId(),
    type: 'folder',
    title: t('folderDefaultName'),
    slot: target.slot,
    addedAt: now,
    updatedAt: now,
    items: [favoriteWithoutSlot(target), favoriteWithoutSlot(source)],
  };

  const next = favorites
    .filter(item => item.id !== sourceId && item.id !== targetId);
  next.push(folder);
  await saveFavorites(next);
  return true;
}

async function moveFavoriteIntoFolder(favoriteId, folderId) {
  if (!favoriteId || !folderId || favoriteId === folderId) return false;
  const favorites = await getFavorites();
  const fav = favorites.find(item => item.type !== 'folder' && item.id === favoriteId);
  const folder = favorites.find(item => item.type === 'folder' && item.id === folderId);
  if (!fav || !folder) return false;
  if ((folder.items || []).some(item => item.url === fav.url)) return false;
  folder.items = [...(folder.items || []), favoriteWithoutSlot(fav)];
  folder.updatedAt = favoriteTimestamp();
  await saveFavorites(favorites.filter(item => item.id !== favoriteId));
  return true;
}

async function moveFavoriteOutOfFolder(folderId, favoriteId) {
  const favorites = await getFavorites();
  const { autoDeleteEmptyFolders = true } = await chrome.storage.local.get('autoDeleteEmptyFolders');
  const folder = favorites.find(item => item.type === 'folder' && item.id === folderId);
  if (!folder) return false;
  const fav = (folder.items || []).find(item => item.id === favoriteId);
  if (!fav) return false;
  folder.items = folder.items.filter(item => item.id !== favoriteId);
  folder.updatedAt = favoriteTimestamp();
  const topLevelFav = {
    ...fav,
    id: fav.id || makeFavoriteId(),
    type: 'favorite',
    slot: firstFreeSlot(favorites),
    updatedAt: favoriteTimestamp(),
  };
  const shouldKeepFolder = folder.items.length > 0 || !autoDeleteEmptyFolders;
  const next = shouldKeepFolder
    ? [...favorites, topLevelFav]
    : [...favorites.filter(item => item.id !== folderId), topLevelFav];
  await saveFavorites(next);
  return true;
}

async function reorderFavoriteInFolder(folderId, favoriteId, targetId) {
  if (!folderId || !favoriteId || !targetId || favoriteId === targetId) return false;
  const favorites = await getFavorites();
  const folder = favorites.find(item => item.type === 'folder' && item.id === folderId);
  if (!folder || !Array.isArray(folder.items)) return false;
  const from = folder.items.findIndex(item => item.id === favoriteId);
  const to = folder.items.findIndex(item => item.id === targetId);
  if (from === -1 || to === -1) return false;
  const [item] = folder.items.splice(from, 1);
  folder.items.splice(to, 0, item);
  folder.updatedAt = favoriteTimestamp();
  await saveFavorites(favorites);
  return true;
}

async function swapFavoriteSlots(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return false;
  const favorites = await getFavorites();
  const a = favorites.find(item => item.id === sourceId);
  const b = favorites.find(item => item.id === targetId);
  if (!a || !b) return false;
  const tmp = a.slot;
  a.slot = b.slot;
  b.slot = tmp;
  const now = favoriteTimestamp();
  a.updatedAt = now;
  b.updatedAt = now;
  await saveFavorites(favorites);
  return true;
}
