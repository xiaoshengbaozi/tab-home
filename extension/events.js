/* ================================================================
   events.js — Event delegation, modals, form handling, drag-and-drop,
   image upload/paste, and all user interaction logic.
   ================================================================ */

'use strict';

/* ----------------------------------------------------------------
   EVENT HANDLERS — using event delegation

   One listener on document handles ALL button clicks.
   Think of it as one security guard watching the whole building
   instead of one per door.
   ---------------------------------------------------------------- */

document.addEventListener('click', async (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) {
    if (e.target.id === 'favoritesModal') { closeFavoriteModal(); return; }
    if (e.target.id === 'socialsModal') {
      const modal = document.getElementById('socialsModal');
      if (modal) modal.style.display = 'none';
      return;
    }
    if (e.target.id === 'settingsModal') {
      const modal = document.getElementById('settingsModal');
      if (modal) modal.style.display = 'none';
      return;
    }
    if (e.target.id === 'snapshotsModal') {
      const modal = document.getElementById('snapshotsModal');
      if (modal) modal.style.display = 'none';
      return;
    }
    if (e.target.id === 'commandPaletteModal') {
      closeCommandPalette();
      return;
    }
    return;
  }

  const action = actionEl.dataset.action;

  if (action === 'open-settings-modal') {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;
    const settings = await getBackgroundSettings();
    const syncSettings = await getSyncSettings();
    const syncSession = await getSyncSession();
    const syncEmailInput = document.getElementById('syncEmailInput');
    const syncPasswordInput = document.getElementById('syncPasswordInput');
    const urlInput = document.getElementById('backgroundUrlInput');
    const brightnessInput = document.getElementById('backgroundBrightnessInput');
    const blurInput = document.getElementById('backgroundBlurInput');
    const uploadInput = document.getElementById('backgroundUploadInput');
    if (syncEmailInput) syncEmailInput.value = (syncSession.user && syncSession.user.email) ? syncSession.user.email : '';
    if (syncPasswordInput) syncPasswordInput.value = '';
    if (urlInput) urlInput.value = settings.imageUrl || '';
    if (brightnessInput) brightnessInput.value = String(settings.brightness ?? DEFAULT_BACKGROUND_SETTINGS.brightness);
    if (blurInput) blurInput.value = String(settings.blur ?? DEFAULT_BACKGROUND_SETTINGS.blur);
    if (uploadInput) {
      uploadInput.value = '';
      delete uploadInput.dataset.pendingImage;
    }
    modal.style.display = 'flex';
    await renderSyncStatus();
    const shouldFocusEmail = !(syncSession && syncSession.user && syncSession.user.email);
    if (shouldFocusEmail && syncEmailInput) setTimeout(() => syncEmailInput.focus(), 0);
    else if (urlInput) setTimeout(() => urlInput.focus(), 0);
    return;
  }

  if (action === 'cancel-settings-form') {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.style.display = 'none';
    return;
  }

  if (action === 'clear-background-image') {
    const urlInput = document.getElementById('backgroundUrlInput');
    const uploadInput = document.getElementById('backgroundUploadInput');
    if (urlInput) urlInput.value = '';
    if (uploadInput) {
      uploadInput.value = '';
      delete uploadInput.dataset.pendingImage;
    }
    return;
  }

  if (action === 'open-command-palette') {
    await openCommandPalette();
    return;
  }

  if (action === 'open-snapshots-modal') {
    const modal = document.getElementById('snapshotsModal');
    const input = document.getElementById('snapshotNameInput');
    if (!modal) return;
    if (input) input.value = '';
    await renderSnapshotsModal();
    modal.style.display = 'flex';
    if (input) setTimeout(() => input.focus(), 0);
    return;
  }

  if (action === 'cancel-snapshots-form') {
    const modal = document.getElementById('snapshotsModal');
    if (modal) modal.style.display = 'none';
    return;
  }

  if (action === 'restore-snapshot') {
    const snapshotId = actionEl.dataset.snapshotId;
    if (!snapshotId) return;
    const opened = await restoreWorkspaceSnapshot(snapshotId);
    await renderDashboard();
    showToast(t('restoredSnapshot', opened));
    return;
  }

  if (action === 'delete-snapshot') {
    const snapshotId = actionEl.dataset.snapshotId;
    if (!snapshotId) return;
    const ok = await showConfirm({
      message: t('confirmDeleteSnapshot'),
      okLabel: t('remove'),
    });
    if (!ok) return;
    await removeWorkspaceSnapshot(snapshotId);
    await refreshWorkspaceSnapshotsViews();
    showToast(t('snapshotDeleted'));
    return;
  }

  if (action === 'run-command-palette-item') {
    const index = parseInt(actionEl.dataset.commandIndex, 10);
    await runCommandPaletteItem(Number.isNaN(index) ? 0 : index);
    return;
  }

  if (action === 'sign-up-sync' || action === 'sign-in-sync') {
    const syncSettings = await getSyncSettings();
    if (!syncSettings.projectUrl || !syncSettings.anonKey) {
      showToast(t('syncMissingConfig'));
      return;
    }

    const email = document.getElementById('syncEmailInput')?.value.trim() || '';
    const password = document.getElementById('syncPasswordInput')?.value || '';
    if (!email || !password) {
      showToast(action === 'sign-up-sync' ? t('syncSigningUpFailed') : t('syncSigningInFailed'));
      return;
    }

    try {
      if (action === 'sign-up-sync') {
        const result = await signUpWithSupabase(email, password, syncSettings);
        if (result && result.access_token) {
          const user = result.user || await fetchSupabaseUser(syncSettings, result.access_token);
          await saveSyncSession({
            accessToken: result.access_token || '',
            refreshToken: result.refresh_token || '',
            user: user || null,
          });
        } else {
          showToast(t('syncEmailConfirmRequired'));
          return;
        }
      } else {
        const result = await signInWithSupabase(email, password, syncSettings);
        const user = result.user || await fetchSupabaseUser(syncSettings, result.access_token);
        await saveSyncSession({
          accessToken: result.access_token || '',
          refreshToken: result.refresh_token || '',
          user: user || null,
        });
      }
      await renderSyncStatus();
      try {
        await pullCloudDataFromSupabase();
        await renderDashboard();
        showToast(t('syncAutoOn'));
      } catch (syncErr) {
        console.warn('[wolfy] post-login sync failed:', syncErr);
        const message = syncErr && syncErr.message
          ? `${t('syncSignedInButCloudFailed')}: ${syncErr.message}`
          : t('syncSignedInButCloudFailed');
        showToast(message);
      }
    } catch (err) {
      console.warn('[wolfy] supabase auth failed:', err);
      const fallback = action === 'sign-up-sync' ? t('syncSigningUpFailed') : t('syncSigningInFailed');
      const message = err && err.message ? `${fallback}: ${err.message}` : fallback;
      showToast(message);
    }
    return;
  }

  if (action === 'sign-out-sync') {
    await clearSyncSession();
    if (syncPushTimer) {
      clearTimeout(syncPushTimer);
      syncPushTimer = null;
    }
    const syncPasswordInput = document.getElementById('syncPasswordInput');
    if (syncPasswordInput) syncPasswordInput.value = '';
    await renderSyncStatus();
    showToast(t('syncSignOutDone'));
    return;
  }

  if (action === 'open-socials-modal') {
    const modal = document.getElementById('socialsModal');
    if (!modal) return;
    const links = await getSocialLinks();
    const xInput = document.getElementById('socialXInput');
    const instagramInput = document.getElementById('socialInstagramInput');
    const githubInput = document.getElementById('socialGithubInput');
    if (xInput) xInput.value = links.x || '';
    if (instagramInput) instagramInput.value = links.instagram || '';
    if (githubInput) githubInput.value = links.github || '';
    modal.style.display = 'flex';
    if (xInput) setTimeout(() => xInput.focus(), 0);
    return;
  }

  if (action === 'cancel-socials-form') {
    const modal = document.getElementById('socialsModal');
    if (modal) modal.style.display = 'none';
    return;
  }

  // ---- Close duplicate tab-out tabs ----
  if (action === 'close-tabout-dupes') {
    await closeTabOutDupes();
    playCloseSound();
    const banner = document.getElementById('tabOutDupeBanner');
    if (banner) {
      banner.style.transition = 'opacity 0.4s';
      banner.style.opacity = '0';
      setTimeout(() => { banner.style.display = 'none'; banner.style.opacity = '1'; }, 400);
    }
    showToast(t('closedExtras'));
    return;
  }

  // ---- Language toggle ----
  if (action === 'toggle-lang') {
    await saveLang(currentLang === 'zh' ? 'en' : 'zh');
    currentWeatherHtml = weatherCache.displayByLang[currentLang] || '';
    applyStaticI18n();
    await renderDashboard();
    return;
  }

  // ---- Theme toggle (light / dark) ----
  if (action === 'toggle-theme') {
    await toggleTheme();
    if (typeof refreshFaviconChipColors === 'function') refreshFaviconChipColors();
    return;
  }

  // ---- Favorites: toggle add modal ----
  if (action === 'toggle-favorite-form') {
    const modal = document.getElementById('favoritesModal');
    const btn   = document.getElementById('favoritesAddToggle');
    if (!modal) return;
    const showing = modal.style.display !== 'none';
    if (showing) {
      resetFavoriteForm();
      modal.style.display = 'none';
      if (btn) btn.classList.remove('open');
    } else {
      resetFavoriteForm();
      modal.style.display = 'flex';
      if (btn) btn.classList.add('open');
      const urlInput = document.getElementById('favoritesUrlInput');
      if (urlInput) setTimeout(() => urlInput.focus(), 0);
    }
    return;
  }

  // ---- Favorites: cancel (close modal) ----
  if (action === 'cancel-favorite-form') {
    closeFavoriteModal();
    return;
  }

  // ---- Favorites: delete from edit modal ----
  if (action === 'delete-from-form') {
    const form = document.getElementById('favoritesForm');
    const id   = form && form.dataset.editingId;
    if (!id) return;
    await removeFavorite(id);
    closeFavoriteModal();
    await renderFavoritesColumn();
    showToast(t('removedFromFavorites'));
    return;
  }

  // ---- Click on modal backdrop closes it ----
  if (e.target.id === 'favoritesModal') {
    closeFavoriteModal();
    return;
  }

  if (e.target.id === 'socialsModal') {
    const modal = document.getElementById('socialsModal');
    if (modal) modal.style.display = 'none';
    return;
  }

  if (e.target.id === 'settingsModal') {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.style.display = 'none';
    return;
  }

  if (e.target.id === 'snapshotsModal') {
    const modal = document.getElementById('snapshotsModal');
    if (modal) modal.style.display = 'none';
    return;
  }

  if (e.target.id === 'commandPaletteModal') {
    closeCommandPalette();
    return;
  }

  // ---- Favorites: open the 3-dot menu next to the card (click again to close) ----
  if (action === 'favorite-menu') {
    e.preventDefault();
    e.stopPropagation();
    const id = actionEl.dataset.favId;
    if (!id) return;
    const existing = document.getElementById('favoritePopupMenu');
    if (existing && existing.dataset.favId === id) {
      closeFavoriteMenu();
    } else {
      closeFavoriteMenu();
      openFavoriteMenu(actionEl, id);
    }
    return;
  }

  // ---- Menu items ----
  if (action === 'menu-edit-favorite') {
    const id = actionEl.dataset.favId;
    closeFavoriteMenu();
    if (id) await openEditFavorite(id);
    return;
  }
  if (action === 'menu-remove-favorite') {
    const id = actionEl.dataset.favId;
    closeFavoriteMenu();
    if (id) {
      await removeFavorite(id);
      await renderFavoritesColumn();
      showToast(t('removedFromFavorites'));
    }
    return;
  }


  // ---- Favorites: reset logo to default favicon ----
  if (action === 'reset-favorite-logo') {
    pendingLogoDataUrl = null;
    clearCustomLogo    = true;

    const urlVal = document.getElementById('favoritesUrlInput').value.trim();
    setLogoPreviewForUrl(urlVal);
    return;
  }


  // ---- Favorites: star a tab from a chip ----
  if (action === 'favorite-tab') {
    e.stopPropagation();
    const tabUrl = actionEl.dataset.tabUrl;
    if (!tabUrl) return;

    const already = await isFavorited(tabUrl);
    if (already) {
      const ok = await showConfirm({
        message: t('confirmRemoveFav'),
        okLabel: t('remove'),
      });
      if (!ok) return;
      const favs = await getFavorites();
      const fav  = favs.find(f => f.url === tabUrl);
      if (fav) await removeFavorite(fav.id);
      actionEl.classList.remove('active');
      showToast(t('removedFromFavorites'));
    } else {
      const ok = await addFavorite(tabUrl);
      if (ok) {
        actionEl.classList.add('active');
        showToast(t('addedToFavorites'));
      } else {
        showToast(t('alreadyAdded'));
      }
    }
    await renderFavoritesColumn();
    return;
  }

  const card = actionEl.closest('.mission-card');

  // ---- Expand overflow chips ("+N more") ----
  if (action === 'expand-chips') {
    const overflowContainer = actionEl.parentElement.querySelector('.page-chips-overflow');
    if (overflowContainer) {
      overflowContainer.style.display = 'contents';
      actionEl.remove();
    }
    return;
  }

  // ---- Focus a specific tab ----
  if (action === 'focus-tab') {
    const tabId = parseInt(actionEl.dataset.tabId, 10);
    if (!Number.isNaN(tabId)) {
      try {
        const tab = await chrome.tabs.get(tabId);
        await chrome.tabs.update(tabId, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
        return;
      } catch { /* tab gone — fall through to URL fallback */ }
    }
    const tabUrl = actionEl.dataset.tabUrl;
    if (tabUrl) await focusTab(tabUrl);
    return;
  }

  // ---- Close a single tab ----
  if (action === 'close-single-tab') {
    e.stopPropagation();
    const tabId = parseInt(actionEl.dataset.tabId, 10);
    if (Number.isNaN(tabId)) return;

    try { await chrome.tabs.remove(tabId); } catch {}
    await fetchOpenTabs();

    playCloseSound();

    const chip = actionEl.closest('.page-chip');
    if (chip) {
      const rect = chip.getBoundingClientRect();
      shootConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
      chip.style.transition = 'opacity 0.2s, transform 0.2s';
      chip.style.opacity    = '0';
      chip.style.transform  = 'scale(0.8)';
      setTimeout(() => {
        chip.remove();
        const parentCard = document.querySelector('.mission-card:has(.mission-pages:empty)');
        if (parentCard) animateCardOut(parentCard);
        document.querySelectorAll('.mission-card').forEach(c => {
          if (c.querySelectorAll('.page-chip[data-action="focus-tab"]').length === 0) {
            animateCardOut(c);
          }
        });
      }, 200);
    }

    const statTabs = document.getElementById('statTabs');
    if (statTabs) statTabs.textContent = openTabs.length;

    showToast(t('tabClosed'));
    return;
  }

  // ---- Pin / unpin a single tab in Chrome (use exact tab id, not URL) ----
  if (action === 'pin-tab') {
    e.stopPropagation();
    const tabId = parseInt(actionEl.dataset.tabId, 10);
    if (Number.isNaN(tabId)) return;
    let tab;
    try { tab = await chrome.tabs.get(tabId); } catch { return; }
    const newPinned = !tab.pinned;
    await chrome.tabs.update(tabId, { pinned: newPinned });
    actionEl.classList.toggle('active', newPinned);
    actionEl.title = newPinned ? t('unpinTip') : t('pinTip');
    return;
  }

  // ---- Close all tabs in a domain group ----
  if (action === 'close-domain-tabs') {
    const domainId    = actionEl.dataset.domainId;
    const inPinned    = !!actionEl.closest('#pinnedSubSection');
    const sourceList  = inPinned ? pinnedDomainGroups : domainGroups;
    const group       = sourceList.find(g => 'domain-' + g.domain.replace(/[^a-z0-9]/g, '-') === domainId);
    if (!group) return;

    const tabIds = group.tabs.map(t => t.id).filter(Boolean);
    if (tabIds.length > 0) {
      try { await chrome.tabs.remove(tabIds); } catch {}
      await fetchOpenTabs();
    }

    if (card) {
      playCloseSound();
      animateCardOut(card);
    }

    const idx = sourceList.indexOf(group);
    if (idx !== -1) sourceList.splice(idx, 1);

    const groupLabel = group.domain === '__landing-pages__' ? t('homepages') : (group.label || friendlyDomain(group.domain));
    showToast(t('closedNFromX', tabIds.length, groupLabel));

    const statTabs = document.getElementById('statTabs');
    if (statTabs) statTabs.textContent = openTabs.length;
    return;
  }

  // ---- Close duplicates of THIS specific URL (the inline chip badge) ----
  if (action === 'dedup-this-url') {
    e.stopPropagation();
    e.preventDefault();
    const url    = actionEl.dataset.tabUrl;
    const chip   = actionEl.closest('.page-chip');
    const chipId = chip ? parseInt(chip.dataset.tabId, 10) : NaN;
    if (!url) return;

    const allTabs   = await chrome.tabs.query({});
    const sourceTab = !Number.isNaN(chipId) ? allTabs.find(t => t.id === chipId) : null;
    const wantPinned = sourceTab ? !!sourceTab.pinned : false;
    const matching = allTabs.filter(t => t.url === url && !!t.pinned === wantPinned);
    if (matching.length <= 1) return;

    const keep = matching.find(t => t.active) || matching[0];
    const toClose = matching.filter(t => t.id !== keep.id).map(t => t.id);
    if (toClose.length > 0) await chrome.tabs.remove(toClose);
    await fetchOpenTabs();

    playCloseSound();
    actionEl.style.transition = 'opacity 0.2s';
    actionEl.style.opacity    = '0';
    setTimeout(() => actionEl.remove(), 200);
    showToast(t('closedDupes'));
    return;
  }

  // ---- Close ALL open tabs ----
  if (action === 'close-all-open-tabs') {
    const allUrls = openTabs
      .filter(t => t.url && !t.url.startsWith('chrome') && !t.url.startsWith('about:'))
      .map(t => t.url);
    await closeTabsByUrls(allUrls);
    playCloseSound();

    document.querySelectorAll('#openTabsMissions .mission-card').forEach(c => {
      shootConfetti(
        c.getBoundingClientRect().left + c.offsetWidth / 2,
        c.getBoundingClientRect().top  + c.offsetHeight / 2
      );
      animateCardOut(c);
    });

    showToast(t('allTabsClosed'));
    return;
  }
});

/* ----------------------------------------------------------------
   FAVORITES FORM — shared state for add/edit mode

   pendingLogoDataUrl:
     - null   = no new logo uploaded this session (keep current value on save)
     - string = data URL the user just picked, save as customLogo

   clearCustomLogo:
     - true   = user clicked "Reset", remove customLogo on save (revert to favicon)
     - false  = leave customLogo alone
   ---------------------------------------------------------------- */
let pendingLogoDataUrl = null;
let clearCustomLogo    = false;

function setLogoPreview(src, fallbackList = []) {
  const placeholder = document.getElementById('favoritesLogoPlaceholder');
  const img         = document.getElementById('favoritesLogoPreviewImg');
  if (!img || !placeholder) return;
  if (src) {
    img.dataset.fallback = fallbackList.join('|');
    img.src = src;
    img.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    img.removeAttribute('src');
    delete img.dataset.fallback;
    img.style.display = 'none';
    placeholder.style.display = 'block';
  }
}

/**
 * Set the logo preview using the same fallback chain as favorite cards.
 * Customizable: pass a customLogo data URL to skip the chain entirely.
 */
function setLogoPreviewForUrl(pageUrl, customLogo = null) {
  if (customLogo) { setLogoPreview(customLogo); return; }
  const chain = getFaviconFallbackChain(pageUrl, 128);
  if (chain.length === 0) { setLogoPreview(''); return; }
  setLogoPreview(chain[0], chain.slice(1));
}

function resetFavoriteForm() {
  const form = document.getElementById('favoritesForm');
  if (!form) return;
  form.dataset.editingId = '';
  document.getElementById('favoritesUrlInput').value   = '';
  document.getElementById('favoritesTitleInput').value = '';
  document.getElementById('favoritesLogoInput').value  = '';
  document.getElementById('favoritesFormSubmit').textContent = 'Add';
  const delBtn = document.getElementById('favoritesFormDelete');
  if (delBtn) delBtn.style.display = 'none';
  setLogoPreview('');
  pendingLogoDataUrl = null;
  clearCustomLogo    = false;
}

function closeFavoriteModal() {
  const modal = document.getElementById('favoritesModal');
  const btn   = document.getElementById('favoritesAddToggle');
  resetFavoriteForm();
  if (modal) modal.style.display = 'none';
  if (btn)   btn.classList.remove('open');
}

/**
 * showConfirm({ message, okLabel?, cancelLabel? })
 * Returns Promise<boolean> — resolves true on confirm, false on cancel /
 * Esc / backdrop click. In-page modal styled to match the rest of the app.
 */
function showConfirm({ message, okLabel, cancelLabel } = {}) {
  return new Promise((resolve) => {
    const modal     = document.getElementById('confirmModal');
    const msgEl     = document.getElementById('confirmMessage');
    const okBtn     = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    if (!modal || !msgEl || !okBtn || !cancelBtn) {
      resolve(window.confirm(message || ''));
      return;
    }

    msgEl.textContent     = message || '';
    okBtn.textContent     = okLabel     || t('confirmOk');
    cancelBtn.textContent = cancelLabel || t('cancel');
    modal.style.display = 'flex';

    const cleanup = () => {
      modal.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey, true);
    };
    const onOk     = () => { cleanup(); resolve(true);  };
    const onCancel = () => { cleanup(); resolve(false); };
    const onBackdrop = (e) => { if (e.target === modal) onCancel(); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
      else if (e.key === 'Enter') { e.stopPropagation(); onOk(); }
    };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey, true);

    setTimeout(() => cancelBtn.focus(), 0);
  });
}

async function openEditFavorite(id) {
  const favs = await getFavorites();
  const fav  = favs.find(f => f.id === id);
  if (!fav) return;
  document.getElementById('favoritesUrlInput').value   = fav.url || '';
  document.getElementById('favoritesTitleInput').value = fav.title || '';
  setLogoPreviewForUrl(fav.url, fav.customLogo);
  pendingLogoDataUrl = null;
  clearCustomLogo    = false;
  const form  = document.getElementById('favoritesForm');
  const modal = document.getElementById('favoritesModal');
  form.dataset.editingId = id;
  if (modal) modal.style.display = 'flex';
  document.getElementById('favoritesAddToggle').classList.add('open');
  document.getElementById('favoritesFormSubmit').textContent = 'Save';
  const delBtn = document.getElementById('favoritesFormDelete');
  if (delBtn) delBtn.style.display = 'inline-flex';
}

function openFavoriteMenu(anchorEl, favId) {
  const menu = document.createElement('div');
  menu.id = 'favoritePopupMenu';
  menu.className = 'favorite-popup-menu';
  menu.dataset.favId = favId;
  menu.innerHTML = `
    <button class="favorite-popup-item" data-action="menu-edit-favorite"   data-fav-id="${favId}">${t('edit')}</button>
    <button class="favorite-popup-item favorite-popup-item-danger" data-action="menu-remove-favorite" data-fav-id="${favId}">${t('remove')}</button>
  `;
  document.body.appendChild(menu);

  const r = anchorEl.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  let top  = r.bottom + 4;
  let left = r.right  - m.width;
  if (top + m.height > window.innerHeight - 4) top = r.top - m.height - 4;
  if (left < 4) left = 4;
  menu.style.top  = `${top}px`;
  menu.style.left = `${left}px`;
}

function closeFavoriteMenu() {
  const menu = document.getElementById('favoritePopupMenu');
  if (menu) menu.remove();
}

// Click outside the menu closes it.
document.addEventListener('click', (e) => {
  if (!document.getElementById('favoritePopupMenu')) return;
  if (e.target.closest('#favoritePopupMenu')) return;
  if (e.target.closest('[data-action="favorite-menu"]')) return;
  closeFavoriteMenu();
});

// Escape closes whichever overlay is open.
document.addEventListener('keydown', (e) => {
  if (isCommandPaletteOpen()) {
    const input = document.getElementById('commandPaletteInput');
    const matches = getCommandPaletteMatches(input ? input.value : '');
    if (e.key === 'Escape') {
      e.preventDefault();
      closeCommandPalette();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      commandPaletteSelectedIndex = Math.min(commandPaletteSelectedIndex + 1, Math.max(matches.length - 1, 0));
      renderCommandPaletteResults(input ? input.value : '');
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      commandPaletteSelectedIndex = Math.max(commandPaletteSelectedIndex - 1, 0);
      renderCommandPaletteResults(input ? input.value : '');
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      void runCommandPaletteItem();
      return;
    }
  }

  const target = e.target;
  const isTyping = target && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
  if (!isTyping && e.code === 'Space') {
    commandPaletteSpacePending = true;
    if (commandPaletteSpaceTimer) clearTimeout(commandPaletteSpaceTimer);
    commandPaletteSpaceTimer = setTimeout(() => {
      commandPaletteSpacePending = false;
      commandPaletteSpaceTimer = null;
    }, 700);
    return;
  }
  if (!isTyping && commandPaletteSpacePending && e.key.toLowerCase() === 's') {
    e.preventDefault();
    commandPaletteSpacePending = false;
    if (commandPaletteSpaceTimer) {
      clearTimeout(commandPaletteSpaceTimer);
      commandPaletteSpaceTimer = null;
    }
    void openCommandPalette();
    return;
  }

  if (e.key !== 'Escape') return;
  const modal = document.getElementById('favoritesModal');
  if (modal && modal.style.display !== 'none') { closeFavoriteModal(); return; }
  const socialsModal = document.getElementById('socialsModal');
  if (socialsModal && socialsModal.style.display !== 'none') { socialsModal.style.display = 'none'; return; }
  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal && settingsModal.style.display !== 'none') { settingsModal.style.display = 'none'; return; }
  const snapshotsModal = document.getElementById('snapshotsModal');
  if (snapshotsModal && snapshotsModal.style.display !== 'none') { snapshotsModal.style.display = 'none'; return; }
  closeFavoriteMenu();
});

/**
 * Downscale an image blob to fit within `maxSize × maxSize` using a canvas,
 * exporting as a PNG data URL. Preserves transparency. Never upscales.
 */
function compressImage(blob, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const srcW = img.naturalWidth  || img.width;
      const srcH = img.naturalHeight || img.height;
      if (!srcW || !srcH) { reject(new Error('zero-size image')); return; }
      const ratio = Math.min(maxSize / srcW, maxSize / srcH, 1);
      const w = Math.max(1, Math.round(srcW * ratio));
      const h = Math.max(1, Math.round(srcH * ratio));
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Stage an image blob as the favorite's custom logo. Auto-compresses to ≤256×256
 * so storage stays small no matter how big the original image is.
 */
async function stageCustomLogoFromBlob(blob) {
  if (!blob || !blob.type || !blob.type.startsWith('image/')) return;
  try {
    const dataUrl = await compressImage(blob, 256);
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return;
    pendingLogoDataUrl = dataUrl;
    clearCustomLogo    = false;
    setLogoPreview(dataUrl);
  } catch (err) {
    console.warn('[wolfy] image compress failed:', err);
  }
}

// ---- Logo file picker — read as base64 data URL, show in preview ----
document.addEventListener('change', (e) => {
  if (e.target.id === 'backgroundUploadInput') {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    compressImage(file, 1920).then((dataUrl) => {
      e.target.dataset.pendingImage = dataUrl;
      const urlInput = document.getElementById('backgroundUrlInput');
      if (urlInput) urlInput.value = '';
    }).catch((err) => {
      console.warn('[wolfy] background image compress failed:', err);
    });
    return;
  }

  if (e.target.id !== 'favoritesLogoInput') return;
  const file = e.target.files && e.target.files[0];
  if (file) stageCustomLogoFromBlob(file);
});

// ---- Paste an image from the clipboard while the favorites modal is open. ----
document.addEventListener('paste', async (e) => {
  const modal = document.getElementById('favoritesModal');
  if (!modal || modal.style.display === 'none') return;
  const items = (e.clipboardData && e.clipboardData.items) || [];
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault();
      await stageCustomLogoFromBlob(file);
      return;
    }
  }
});

// ---- Live preview update: when URL field changes and no custom logo
//      is staged, pull a favicon for the new domain. ----
document.addEventListener('input', (e) => {
  if (e.target.id === 'commandPaletteInput') {
    commandPaletteSelectedIndex = 0;
    renderCommandPaletteResults(e.target.value);
    return;
  }

  if (e.target.id !== 'favoritesUrlInput') return;
  if (pendingLogoDataUrl) return;
  const form = document.getElementById('favoritesForm');
  if (form.dataset.editingId && !clearCustomLogo) return;
  const url = e.target.value.trim();
  setLogoPreviewForUrl(url);
});

// ---- Form submissions ----
document.addEventListener('submit', async (e) => {
  if (e.target.id === 'snapshotsForm') {
    e.preventDefault();
    const input = document.getElementById('snapshotNameInput');
    const snapshot = await createWorkspaceSnapshot(input ? input.value : '');
    if (!snapshot) {
      showToast(t('snapshotEmpty'));
      return;
    }
    if (input) input.value = '';
    await refreshWorkspaceSnapshotsViews();
    showToast(t('snapshotSaved', snapshot.tabs.length));
    return;
  }

  if (e.target.id === 'settingsForm') {
    e.preventDefault();
    const uploadInput = document.getElementById('backgroundUploadInput');
    const settings = {
      imageUrl: document.getElementById('backgroundUrlInput')?.value.trim() || '',
      imageDataUrl: (uploadInput && uploadInput.dataset.pendingImage) ? uploadInput.dataset.pendingImage : '',
      brightness: Number(document.getElementById('backgroundBrightnessInput')?.value || DEFAULT_BACKGROUND_SETTINGS.brightness),
      blur: Number(document.getElementById('backgroundBlurInput')?.value || DEFAULT_BACKGROUND_SETTINGS.blur),
    };
    if (settings.imageUrl) settings.imageDataUrl = '';
    await saveBackgroundSettings(settings);
    applyBackgroundSettings(settings);
    if (uploadInput) delete uploadInput.dataset.pendingImage;
    const modal = document.getElementById('settingsModal');
    if (modal) modal.style.display = 'none';
    showToast(t('backgroundSaved'));
    return;
  }

  if (e.target.id === 'socialsForm') {
    e.preventDefault();
    const links = {
      x: document.getElementById('socialXInput')?.value.trim() || '',
      instagram: document.getElementById('socialInstagramInput')?.value.trim() || '',
      github: document.getElementById('socialGithubInput')?.value.trim() || '',
    };
    await saveSocialLinks(links);
    const modal = document.getElementById('socialsModal');
    if (modal) modal.style.display = 'none';
    await renderFooterSocials();
    showToast(t('socialSaved'));
    return;
  }

  if (e.target.id !== 'favoritesForm') return;
  e.preventDefault();

  const form       = e.target;
  const editingId  = form.dataset.editingId || '';
  const urlInput   = document.getElementById('favoritesUrlInput');
  const titleInput = document.getElementById('favoritesTitleInput');
  let   url        = urlInput.value.trim();
  let   title      = titleInput.value.trim();
  if (!url) return;

  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    url = 'https://' + url;
  }

  if (!title) {
    try { title = friendlyDomain(new URL(url).hostname); }
    catch { title = url; }
  }

  try {
    if (editingId) {
      const fields = { url, title };
      if (pendingLogoDataUrl)      fields.customLogo = pendingLogoDataUrl;
      else if (clearCustomLogo)    fields.customLogo = null;
      await updateFavorite(editingId, fields);
      showToast(t('favoriteUpdated'));
    } else {
      const ok = await addFavorite(url, title, pendingLogoDataUrl);
      if (!ok) {
        showToast(t('alreadyAdded'));
        return;
      }
      showToast(t('addedToFavorites'));
    }
  } catch (err) {
    console.error('[wolfy] save favorite failed:', err);
    showToast(t('saveFailed'));
    return;
  }

  closeFavoriteModal();

  await renderFavoritesColumn();
  document.querySelectorAll(`.chip-star[data-tab-url="${url.replace(/"/g, '&quot;')}"]`).forEach(b => b.classList.add('active'));
});


/* ----------------------------------------------------------------
   FAVORITES DRAG-AND-DROP — reorder cards within the favorites column.

   Scope: strictly limited to the favorites column. Drops elsewhere on
   the page (including the OpenTabs section) are ignored.

   Drop targets:
     - another card        → swap slots
     - empty slot          → place there
     - anywhere else       → no-op
   ---------------------------------------------------------------- */
let _draggedFavId = null;

function clearDropMarkers() {
  document.querySelectorAll('.favorite-item.drop-target')
    .forEach(el => el.classList.remove('drop-target'));
}

document.addEventListener('dragstart', (e) => {
  const item = e.target.closest('.favorite-item');
  if (!item) return;
  _draggedFavId = item.dataset.favId;
  item.classList.add('dragging');
  document.body.classList.add('dragging-favorite');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', _draggedFavId);
});

document.addEventListener('dragend', () => {
  document.querySelectorAll('.favorite-item.dragging')
    .forEach(el => el.classList.remove('dragging'));
  document.body.classList.remove('dragging-favorite');
  clearDropMarkers();
  _draggedFavId = null;
});

document.addEventListener('dragover', (e) => {
  if (!_draggedFavId) return;

  const card = e.target.closest('.favorite-item');
  if (card && card.dataset.favId && card.dataset.favId !== _draggedFavId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDropMarkers();
    card.classList.add('drop-target');
    return;
  }

});

document.addEventListener('drop', async (e) => {
  if (!_draggedFavId) return;
  const draggedId = _draggedFavId;
  _draggedFavId = null;

  const card = e.target.closest('.favorite-item');
  if (card && card.dataset.favId && card.dataset.favId !== draggedId) {
    e.preventDefault();
    clearDropMarkers();
    const favorites = await getFavorites();
    const a = favorites.find(f => f.id === draggedId);
    const b = favorites.find(f => f.id === card.dataset.favId);
    if (a && b) {
      const tmp = a.slot;
      a.slot = b.slot;
      b.slot = tmp;
      const now = favoriteTimestamp();
      a.updatedAt = now;
      b.updatedAt = now;
      await chrome.storage.local.set({ favorites });
      await renderFavoritesColumn();
    }
    return;
  }

  clearDropMarkers();
});
