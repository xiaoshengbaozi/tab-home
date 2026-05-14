/* ================================================================
   theme.js — Theme (light/dark) management, background image
   application, static i18n application, and footer socials rendering.
   ================================================================ */

'use strict';

/* ----------------------------------------------------------------
   THEME — 'light' or 'dark', stored in chrome.storage.local
   ---------------------------------------------------------------- */
const ICON_SUN  = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>`;
const ICON_MOON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" /></svg>`;

async function loadTheme() {
  try {
    const { theme } = await chrome.storage.local.get('theme');
    const t = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
  } catch {
    document.documentElement.dataset.theme = 'light';
  }
  paintThemeToggle();
}

function paintThemeToggle() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  const isDark = document.documentElement.dataset.theme === 'dark';
  btn.innerHTML = isDark ? ICON_SUN : ICON_MOON;
}

async function toggleTheme() {
  const cur  = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  paintThemeToggle();
  try { await chrome.storage.local.set({ theme: next }); } catch {}
}

/**
 * applyStaticI18n()
 *
 * Updates the static labels in index.html that aren't otherwise
 * rebuilt by renderStaticDashboard. Called on init and on language switch.
 */
function applyStaticI18n() {
  document.documentElement.lang = currentLang === 'zh' ? 'zh' : 'en';

  const set = (selector, key, attr = 'textContent') => {
    const el = document.querySelector(selector);
    if (!el) return;
    if (attr === 'textContent') el.textContent = t(key);
    else el.setAttribute(attr, t(key));
  };

  // Header toggle button — shows the OTHER language as a hint to click
  set('#langToggle', 'langToggle');
  const settingsToggle = document.getElementById('settingsToggle');
  if (settingsToggle) {
    settingsToggle.setAttribute('title', t('settings'));
    settingsToggle.innerHTML = getSettingsIcon();
  }
  const snapshotsToggle = document.getElementById('snapshotsToggle');
  if (snapshotsToggle) {
    snapshotsToggle.setAttribute('title', t('workspaceSnapshots'));
    snapshotsToggle.innerHTML = getSnapshotsIcon();
  }
  const commandPaletteToggle = document.getElementById('commandPaletteToggle');
  if (commandPaletteToggle) {
    commandPaletteToggle.setAttribute('title', t('searchCommands'));
    commandPaletteToggle.innerHTML = getCommandIcon();
  }

  // Favorites column
  set('.favorites-column .section-header h2', 'favorites');
  set('#favoritesAddToggle', 'addAFavorite', 'title');
  set('#favoritesUrlLabel', 'urlLabel');
  set('#favoritesTitleLabel', 'titleLabel');
  set('#favoritesUrlInput', 'titlePlaceholder' /*unused below for url*/, 'placeholder');
  const urlInput = document.getElementById('favoritesUrlInput');
  if (urlInput) urlInput.placeholder = 'https://...';
  set('#favoritesTitleInput', 'titlePlaceholder', 'placeholder');
  set('#favoritesLogoPlaceholder', 'auto');
  set('label[for="favoritesLogoInput"]', 'uploadLogo');
  set('.favorites-logo-reset', 'reset');
  set('#favoritesFormSubmit', 'add');
  set('.favorites-form-cancel', 'cancel');
  set('#favoritesFormDelete', 'remove');
  set('#favoritesEmpty', 'favoritesEmpty');

  // Open tabs section default title (overwritten by render when tabs exist)
  set('#openTabsSectionTitle', 'rightNow');

  // Footer stat
  set('.stat-label', 'statTabs');
  set('#footerSocialsEdit', 'editLinks', 'title');
  set('#snapshotsTitle', 'workspaceSnapshots');
  set('#snapshotsSubtitle', 'snapshotsSubtitle');
  set('#snapshotNameLabel', 'snapshotName');
  set('#snapshotNameInput', 'snapshotPlaceholder', 'placeholder');
  set('#snapshotsCreateBtn', 'saveCurrentSnapshot');
  set('#snapshotsCloseBtn', 'cancel');
  set('#snapshotsEmpty', 'noSnapshots');
  set('#commandPaletteInput', 'commandPlaceholder', 'placeholder');
  set('#commandPaletteEmpty', 'commandNoMatches');
  const socialsFormSubmit = document.getElementById('socialsFormSubmit');
  if (socialsFormSubmit) socialsFormSubmit.textContent = t('save');
  set('#syncStatusTitle', 'syncStatus');
  set('#syncEmailLabel', 'email');
  set('#syncPasswordLabel', 'password');
  const syncSignInBtn = document.getElementById('syncSignInBtn');
  if (syncSignInBtn) syncSignInBtn.textContent = t('signIn');
  const syncSignUpBtn = document.getElementById('syncSignUpBtn');
  if (syncSignUpBtn) syncSignUpBtn.textContent = t('createAccount');
  const syncSignOutBtn = document.getElementById('syncSignOutBtn');
  if (syncSignOutBtn) syncSignOutBtn.textContent = t('signOut');
  set('#backgroundUrlLabel', 'backgroundUrl');
  set('#backgroundUploadLabel', 'uploadImage');
  set('#backgroundClearBtn', 'clear');
  set('#backgroundBrightnessLabel', 'brightness');
  set('#backgroundBlurLabel', 'blur');
  const settingsFormSubmit = document.getElementById('settingsFormSubmit');
  if (settingsFormSubmit) settingsFormSubmit.textContent = t('save');
  void renderSyncStatus();

  // tab-out duplicate banner — only the suffix and button label
  const cleanupText = document.querySelector('.tab-cleanup-text');
  if (cleanupText) {
    const strong = document.getElementById('tabOutDupeCount');
    const suffix = currentLang === 'zh' ? ` ${t('nWolfyTabsOpen')}` : ` ${t('nWolfyTabsOpen')}`;
    cleanupText.innerHTML = '';
    if (strong) cleanupText.appendChild(strong);
    cleanupText.appendChild(document.createTextNode(suffix));
  }
  set('.tab-cleanup-btn', 'keepOne');
}

function applyBackgroundSettings(settings) {
  const bg = document.getElementById('pageBackground');
  if (!bg) return;
  const source = settings.imageDataUrl || normalizeSocialUrl(settings.imageUrl);
  const hasImage = !!source;
  const brightness = Math.max(35, Math.min(100, Number(settings.brightness || 72)));
  const blur = Math.max(0, Number(settings.blur || 0));
  bg.style.backgroundImage = hasImage ? `url("${source.replace(/"/g, '%22')}")` : 'none';
  bg.style.opacity = hasImage ? '1' : '0';
  bg.style.filter = hasImage ? `blur(${blur}px) brightness(${brightness / 100})` : 'none';
}

async function renderFooterSocials() {
  const container = document.getElementById('footerSocials');
  const editBtn = document.getElementById('footerSocialsEdit');
  if (!container) return;

  const links = await getSocialLinks();
  const items = SOCIAL_PLATFORMS.map((platform) => {
    const url = normalizeSocialUrl(links[platform.key]);
    const icon = socialIcon(platform.key);
    const label = escapeHtml(platform.label);
    if (!url) {
      return `<button class="footer-social footer-social-empty" type="button" data-action="open-socials-modal"><span class="footer-social-icon">${icon}</span><span class="footer-social-name">${label}</span></button>`;
    }
    return `<a class="footer-social" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><span class="footer-social-icon">${icon}</span><span class="footer-social-name">${label}</span></a>`;
  }).join('');

  container.innerHTML = items;
  if (editBtn) editBtn.textContent = t('editLinks');
}
