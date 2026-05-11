/* ================================================================
   i18n.js — String table, translation helpers, language management,
   social platform config, and display formatting utilities.
   ================================================================ */

'use strict';

/* ----------------------------------------------------------------
   I18N — String table with simple t() lookup

   Values can be strings or functions (for pluralization / interpolation).
   Add a key once in both languages. Missing keys fall back to English.
   ---------------------------------------------------------------- */
const STRINGS = {
  en: {
    favorites: 'Favorites',
    add: 'Add', save: 'Save', cancel: 'Cancel', confirmOk: 'Confirm',
    uploadLogo: 'Upload logo (or paste image)', reset: 'Reset', auto: 'Auto',
    urlLabel: 'URL', titleLabel: 'Title',
    titlePlaceholder: 'Title (optional)',
    favoritesEmpty: 'Nothing pinned yet. Click + to add a URL, or star a tab on the right.',
    addAFavorite: 'Add a favorite',
    edit: 'Edit', remove: 'Remove', moreActions: 'More',
    rightNow: 'Right now', openTabs: 'Open tabs', pinned: 'Pinned',
    nTabsCount: (n) => `${n} tab${n !== 1 ? 's' : ''}`,
    homepages: 'Homepages',
    nDomains: (n) => `${n} domain${n !== 1 ? 's' : ''}`,
    nTabsOpen: (n) => `${n} tab${n !== 1 ? 's' : ''} open`,
    dupeBadge: (n) => `duplicate x ${n}`,
    closeAllN: (n) => `Close all ${n} tab${n !== 1 ? 's' : ''}`,
    closeDupes: 'Close duplicates',
    plusN: (n) => `+${n} more`,
    statTabs: 'Open tabs',
    socialLinks: 'Social links',
    editLinks: 'Edit',
    socialEmpty: 'Add your links',
    socialSaved: 'Social links updated',
    settings: 'Settings',
    backgroundUrl: 'Background image URL',
    uploadImage: 'Upload image',
    clear: 'Clear',
    brightness: 'Brightness',
    blur: 'Blur',
    backgroundSaved: 'Background updated',
    exportSettings: 'Export',
    importSettings: 'Import',
    supabaseProjectUrl: 'Supabase project URL',
    supabaseAnonKey: 'Supabase anon key',
    syncReady: 'Sync configured',
    syncNotConfigured: 'Sync not configured',
    syncStatus: 'Sync status',
    email: 'Email',
    password: 'Password',
    signIn: 'Sign in',
    createAccount: 'Create account',
    signOut: 'Sign out',
    syncSignedOut: 'Signed out',
    syncSignedIn: 'Signed in',
    syncSigningInFailed: 'Sign-in failed',
    syncSigningUpFailed: 'Sign-up failed',
    syncSignOutDone: 'Signed out',
    syncMissingConfig: 'Add Supabase URL and anon key first',
    syncAutoOn: 'Auto sync enabled',
    syncAutoFailed: 'Auto sync failed',
    syncLoginRequired: 'Sign in first',
    syncEmailConfirmRequired: 'Account created. Check your email confirmation settings.',
    syncSignedInButCloudFailed: 'Signed in, but cloud sync setup is incomplete',
    syncActiveSubtitle: 'Cloud sync active',
    syncNever: 'Not synced yet',
    syncLastAt: (value) => `Last sync ${value}`,
    addToFav: 'Add to favorites', removeFromFav: 'Remove from favorites',
    pinTip: 'Pin tab', unpinTip: 'Unpin tab',
    closeThisTab: 'Close this tab',
    nWolfyTabsOpen: 'tab-home tabs open', keepOne: 'Keep one',
    addedToFavorites: 'Added to favorites', removedFromFavorites: 'Removed from favorites',
    confirmRemoveFav: 'Remove this from favorites?',
    alreadyAdded: 'Already in favorites',
    saveFailed: 'Save failed (storage may be full)',
    favoriteUpdated: 'Favorite updated', tabClosed: 'Tab closed',
    allTabsClosed: 'All tabs closed. Fresh start.',
    closedExtras: 'Closed duplicate tab-home tabs',
    closedDupes: 'Closed duplicate tabs',
    closedNFromX: (n, name) => `Closed ${n} tab${n !== 1 ? 's' : ''} from ${name}`,
    tabs: 'tabs',
    weatherUnknown: 'Weather unavailable',
    weatherLoading: 'Loading weather...',
    langToggle: '中',
  },
  zh: {
    favorites: '收藏',
    add: '添加', save: '保存', cancel: '取消', confirmOk: '确定',
    uploadLogo: '上传图标（或粘贴图片）', reset: '重置', auto: '自动',
    urlLabel: '网址', titleLabel: '标题',
    titlePlaceholder: '标题（可选）',
    favoritesEmpty: '还没有收藏。点击 + 添加链接，或在右侧给标签页标星。',
    addAFavorite: '添加收藏',
    edit: '编辑', remove: '删除', moreActions: '更多',
    rightNow: '正在打开', openTabs: '当前标签', pinned: '已固定',
    nTabsCount: (n) => `${n} 个标签`,
    homepages: '主页',
    nDomains: (n) => `${n} 个域名`,
    nTabsOpen: (n) => `已打开 ${n} 个`,
    dupeBadge: (n) => `重复 x ${n}`,
    closeAllN: (n) => `关闭全部 ${n} 个`,
    closeDupes: '关闭重复',
    plusN: (n) => `还有 ${n} 个`,
    statTabs: '已打开',
    socialLinks: '社交链接',
    editLinks: '编辑',
    socialEmpty: '添加你的链接',
    socialSaved: '社交链接已更新',
    settings: '设置',
    backgroundUrl: '背景图片链接',
    uploadImage: '上传图片',
    clear: '清除',
    brightness: '亮度',
    blur: '模糊',
    backgroundSaved: '背景已更新',
    exportSettings: '导出',
    importSettings: '导入',
    supabaseProjectUrl: 'Supabase 项目地址',
    supabaseAnonKey: 'Supabase 匿名密钥',
    syncReady: '同步已配置',
    syncNotConfigured: '同步未配置',
    syncStatus: '同步状态',
    email: '邮箱',
    password: '密码',
    signIn: '登录',
    createAccount: '创建账号',
    signOut: '退出登录',
    syncSignedOut: '未登录',
    syncSignedIn: '已登录',
    syncSigningInFailed: '登录失败',
    syncSigningUpFailed: '注册失败',
    syncSignOutDone: '已退出登录',
    syncMissingConfig: '请先填写 Supabase URL 和 anon key',
    syncAutoOn: '自动同步已开启',
    syncAutoFailed: '自动同步失败',
    syncLoginRequired: '请先登录',
    syncEmailConfirmRequired: '账号已创建，请检查邮箱确认设置。',
    syncSignedInButCloudFailed: '已登录，但云端同步配置还不完整',
    syncActiveSubtitle: '云端同步已启用',
    syncNever: '尚未同步',
    syncLastAt: (value) => `上次同步 ${value}`,
    addToFav: '加入收藏', removeFromFav: '移除收藏',
    pinTip: '固定此标签', unpinTip: '取消固定',
    closeThisTab: '关闭此标签',
    nWolfyTabsOpen: '个 tab-home 标签页', keepOne: '只保留一个',
    addedToFavorites: '已加入收藏', removedFromFavorites: '已从收藏移除',
    confirmRemoveFav: '确定要取消收藏此网址吗？',
    alreadyAdded: '已经收藏过了',
    saveFailed: '保存失败（存储可能已满）',
    favoriteUpdated: '收藏已更新', tabClosed: '标签已关闭',
    allTabsClosed: '所有标签已关闭。重新开始。',
    closedExtras: '已关闭重复的 tab-home',
    closedDupes: '已关闭重复的标签页',
    closedNFromX: (n, name) => `已从 ${name} 关闭 ${n} 个标签`,
    tabs: '个',
    weatherUnknown: '天气不可用',
    weatherLoading: '天气加载中...',
    langToggle: 'EN',
  },
};

let currentLang = 'en';
let currentWeatherHtml = '';
const SOCIAL_PLATFORMS = [
  { key: 'x', label: 'X', placeholder: 'https://x.com/yourname' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourname' },
  { key: 'github', label: 'GitHub', placeholder: 'https://github.com/yourname' },
];
const DEFAULT_BACKGROUND_SETTINGS = {
  imageUrl: '',
  imageDataUrl: '',
  brightness: 72,
  blur: 0,
};

function t(key, ...args) {
  const v = (STRINGS[currentLang] && STRINGS[currentLang][key]) ?? STRINGS.en[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadLang() {
  try {
    const { lang } = await chrome.storage.local.get('lang');
    if (lang === 'zh' || lang === 'en') currentLang = lang;
  } catch {}
}

async function saveLang(lang) {
  if (lang !== 'zh' && lang !== 'en') return;
  currentLang = lang;
  try { await chrome.storage.local.set({ lang }); } catch {}
}

function updateHeaderDateDisplay() {
  const dateEl = document.getElementById('dateDisplay');
  if (!dateEl) return;
  const dateText = getDateDisplay();
  dateEl.innerHTML = currentWeatherHtml ? `${dateText} <span class="date-separator">|</span> ${currentWeatherHtml}` : dateText;
}

function getSettingsIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9M4.5 6h2.25M8.25 6a2.25 2.25 0 1 0 4.5 0 2.25 2.25 0 0 0-4.5 0ZM13.5 18h6M4.5 18h4.5m0 0a2.25 2.25 0 1 0 4.5 0 2.25 2.25 0 0 0-4.5 0ZM15.75 12h3.75M4.5 12h7.5m0 0a2.25 2.25 0 1 0 4.5 0 2.25 2.25 0 0 0-4.5 0Z" /></svg>`;
}

function normalizeSocialUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

function socialIcon(name) {
  if (name === 'x') {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5.5 18 18.5M18 5.5 6 18.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>`;
  }
  if (name === 'instagram') {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"></rect><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"></circle><circle cx="16.4" cy="7.6" r="0.9" fill="currentColor"></circle></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18.8c-4.5 1.3-4.5-2.4-6.3-2.9m12.6 5.8v-3.4a2.96 2.96 0 0 0-.8-2.3c2.6-.3 5.4-1.3 5.4-5.8a4.5 4.5 0 0 0-1.2-3.1 4.2 4.2 0 0 0-.1-3.1s-1-.3-3.3 1.2a11.4 11.4 0 0 0-6 0C7 3.7 6 4 6 4a4.2 4.2 0 0 0-.1 3.1 4.5 4.5 0 0 0-1.2 3.1c0 4.5 2.8 5.5 5.4 5.8a2.96 2.96 0 0 0-.8 2.3v3.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
}

async function getSocialLinks() {
  const { socialLinks = {} } = await chrome.storage.local.get('socialLinks');
  return socialLinks && typeof socialLinks === 'object' ? socialLinks : {};
}

async function saveSocialLinks(links) {
  await chrome.storage.local.set({ socialLinks: links });
}

async function getBackgroundSettings() {
  const { backgroundSettings = {} } = await chrome.storage.local.get('backgroundSettings');
  return {
    ...DEFAULT_BACKGROUND_SETTINGS,
    ...(backgroundSettings && typeof backgroundSettings === 'object' ? backgroundSettings : {}),
  };
}

async function saveBackgroundSettings(settings) {
  await chrome.storage.local.set({ backgroundSettings: settings });
}

/**
 * getDateDisplay() — weekday + DD/MM/YYYY + lunar, e.g. "Sunday · 09/05/2026 (三月廿三)"
 * Weekday name follows the current language setting.
 */
function getDateDisplay() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const date = `${dd}/${mm}/${d.getFullYear()}`;
  const locale = currentLang === 'zh' ? 'zh-CN' : 'en-US';
  let weekday = '';
  try {
    weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d);
  } catch {}
  let lunarText = '';
  if (currentLang === 'zh') {
    const lunar = getLunarDate(d);
    if (lunar) lunarText = ` <span class="lunar-date">(${formatLunarDate(lunar)})</span>`;
  }
  return weekday ? `${weekday} · ${date}${lunarText}` : date;
}
