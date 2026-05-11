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

/* Favorite shape: { id, url, title, addedAt, slot, customLogo? }

   `slot` is an explicit grid index. New favorites are placed at the
   first empty slot. Deleting a card leaves a gap so the rest don't
   shift around. The visible column count can change with screen width;
   cards just reflow into different (row, col) positions while keeping
   their slot index. */

async function getFavorites() {
  const { favorites = [] } = await chrome.storage.local.get('favorites');
  return favorites
    .filter(f => f && f.type !== 'folder' && f.url)
    .map(({ type, parentId, ...rest }) => rest);
}

async function addFavorite(url, title, customLogo = null) {
  if (!url) return false;
  const favorites = await getFavorites();
  if (favorites.some(f => f.url === url)) return false;

  const cleanTitle = (title || '').trim();
  let finalTitle;
  if (cleanTitle) {
    finalTitle = cleanTitle;
  } else {
    try { finalTitle = friendlyDomain(new URL(url).hostname) || url; }
    catch { finalTitle = url; }
  }

  const taken = new Set(favorites.map(f => f.slot));
  let slot = 0;
  while (taken.has(slot)) slot++;

  const fav = {
    id:      Date.now().toString(),
    url,
    title:   finalTitle,
    addedAt: new Date().toISOString(),
    slot,
  };
  if (customLogo) fav.customLogo = customLogo;
  favorites.push(fav);
  await chrome.storage.local.set({ favorites });
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
  await chrome.storage.local.set({ favorites });
}

/**
 * One-time migration:
 *  - Strip legacy folder entries / parentId / type fields.
 *  - Ensure every favorite has a non-negative slot. Slots that collide
 *    are reassigned to the first free slot. No upper bound — favorites
 *    are unlimited.
 * Idempotent.
 */
async function migrateAwayFromFolders() {
  const { favorites: raw = [] } = await chrome.storage.local.get('favorites');
  if (!raw.length) return;

  const before = JSON.stringify(raw);

  const cleaned = raw
    .filter(f => f && f.type !== 'folder' && f.url)
    .map(({ type, parentId, ...rest }) => rest);

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
    await chrome.storage.local.set({ favorites: final });
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
  const fav = favorites.find(f => f.id === id);
  if (!fav) return;
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'customLogo' && v === null) delete fav.customLogo;
    else fav[k] = v;
  }
  await chrome.storage.local.set({ favorites });
}

async function removeFavorite(id) {
  const favorites = await getFavorites();
  const next = favorites.filter(f => f.id !== id);
  await chrome.storage.local.set({ favorites: next });
}

async function isFavorited(url) {
  const favorites = await getFavorites();
  return favorites.some(f => f.url === url);
}
