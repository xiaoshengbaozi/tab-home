/* ================================================================
   dashboard.js — Main dashboard renderer: domain cards, favorites
   column, and the full static dashboard layout.
   ================================================================ */

'use strict';

/* ----------------------------------------------------------------
   SVG ICON STRINGS
   ---------------------------------------------------------------- */
const ICONS = {
  tabs:    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8.25V18a2.25 2.25 0 0 0 2.25 2.25h13.5A2.25 2.25 0 0 0 21 18V8.25m-18 0V6a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 6v2.25m-18 0h18" /></svg>`,
  close:   `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>`,
  archive: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg>`,
  focus:   `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25" /></svg>`,
};


/* ----------------------------------------------------------------
   IN-MEMORY STORE FOR OPEN-TAB GROUPS
   ---------------------------------------------------------------- */
let domainGroups       = [];   // regular open-tabs groups
let pinnedDomainGroups = [];   // pinned-tabs groups (rendered above)


/* ----------------------------------------------------------------
   OVERFLOW CHIPS ("+N more" expand button in domain cards)
   ---------------------------------------------------------------- */

function buildOverflowChips(hiddenTabs, urlCounts = {}, favoritedUrls = new Set()) {
  const hiddenChips = hiddenTabs.map(tab => {
    const label     = cleanTitle(smartTitle(stripTitleNoise(tab.title || ''), tab.url), '');
    const count     = urlCounts[tab.url] || 1;
    const safeUrl   = (tab.url || '').replace(/"/g, '&quot;');
    const safeTitle = label.replace(/"/g, '&quot;');
    const dupeTag   = count > 1
      ? ` <button class="chip-dupe-badge" data-action="dedup-this-url" data-tab-url="${safeUrl}" title="${t('closeDupes')}"><span class="dupe-count">${t('dupeBadge', count)}</span><span class="dupe-action">${t('closeDupes')}</span></button>`
      : '';
    const chipClass = count > 1 ? ' chip-has-dupes' : '';
    const isFav     = favoritedUrls.has(tab.url);
    const isPinned  = !!tab.pinned;
    const faviconUrl = getFaviconUrl(tab.url, 32);
    return `<div class="page-chip clickable${chipClass}" data-action="focus-tab" data-tab-url="${safeUrl}" data-tab-id="${tab.id}" title="${safeTitle}">
      ${faviconUrl ? `<img class="chip-favicon" src="${faviconUrl}" alt="" onerror="this.style.display='none'">` : ''}
      <span class="chip-text">${label}</span>${dupeTag}
      <div class="chip-actions">
        <button class="chip-action chip-star${isFav ? ' active' : ''}" data-action="favorite-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="${isFav ? t('removeFromFav') : t('addToFav')}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>
        </button>
        <button class="chip-action chip-pin${isPinned ? ' active' : ''}" data-action="pin-tab" data-tab-url="${safeUrl}" data-tab-id="${tab.id}" title="${isPinned ? t('unpinTip') : t('pinTip')}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
        </button>
        <button class="chip-action chip-close" data-action="close-single-tab" data-tab-url="${safeUrl}" data-tab-id="${tab.id}" title="${t('closeThisTab')}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="page-chips-overflow" style="display:none">${hiddenChips}</div>
    <div class="page-chip page-chip-overflow clickable" data-action="expand-chips">
      <span class="chip-text">${t('plusN', hiddenTabs.length)}</span>
    </div>`;
}


/* ----------------------------------------------------------------
   DOMAIN CARD RENDERER
   ---------------------------------------------------------------- */

/**
 * renderDomainCard(group, groupIndex)
 *
 * Builds the HTML for one domain group card.
 * group = { domain: string, tabs: [{ url, title, id, windowId, active }] }
 */
function renderDomainCard(group, favoritedUrls = new Set()) {
  const tabs      = group.tabs || [];
  const tabCount  = tabs.length;
  const isLanding = group.domain === '__landing-pages__';
  const stableId  = 'domain-' + group.domain.replace(/[^a-z0-9]/g, '-');

  const urlCounts = {};
  for (const tab of tabs) urlCounts[tab.url] = (urlCounts[tab.url] || 0) + 1;
  const dupeUrls   = Object.entries(urlCounts).filter(([, c]) => c > 1);
  const hasDupes   = dupeUrls.length > 0;

  const tabBadge = `<span class="open-tabs-badge">
    ${ICONS.tabs}
    ${tabCount}
  </span>`;

  const seen = new Set();
  const uniqueTabs = [];
  for (const tab of tabs) {
    if (!seen.has(tab.url)) { seen.add(tab.url); uniqueTabs.push(tab); }
  }

  const visibleTabs = uniqueTabs.slice(0, 8);
  const extraCount  = uniqueTabs.length - visibleTabs.length;

  const pageChips = visibleTabs.map(tab => {
    let label = cleanTitle(smartTitle(stripTitleNoise(tab.title || ''), tab.url), group.domain);
    try {
      const parsed = new URL(tab.url);
      if (parsed.hostname === 'localhost' && parsed.port) label = `${parsed.port} ${label}`;
    } catch {}
    const count     = urlCounts[tab.url];
    const safeUrl   = (tab.url || '').replace(/"/g, '&quot;');
    const safeTitle = label.replace(/"/g, '&quot;');
    const dupeTag   = count > 1
      ? ` <button class="chip-dupe-badge" data-action="dedup-this-url" data-tab-url="${safeUrl}" title="${t('closeDupes')}"><span class="dupe-count">${t('dupeBadge', count)}</span><span class="dupe-action">${t('closeDupes')}</span></button>`
      : '';
    const chipClass = count > 1 ? ' chip-has-dupes' : '';
    const isFav     = favoritedUrls.has(tab.url);
    const isPinned  = !!tab.pinned;
    const faviconUrl = getFaviconUrl(tab.url, 32);
    return `<div class="page-chip clickable${chipClass}" data-action="focus-tab" data-tab-url="${safeUrl}" data-tab-id="${tab.id}" title="${safeTitle}">
      ${faviconUrl ? `<img class="chip-favicon" src="${faviconUrl}" alt="" onerror="this.style.display='none'">` : ''}
      <span class="chip-text">${label}</span>${dupeTag}
      <div class="chip-actions">
        <button class="chip-action chip-star${isFav ? ' active' : ''}" data-action="favorite-tab" data-tab-url="${safeUrl}" data-tab-title="${safeTitle}" title="${isFav ? t('removeFromFav') : t('addToFav')}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>
        </button>
        <button class="chip-action chip-pin${isPinned ? ' active' : ''}" data-action="pin-tab" data-tab-url="${safeUrl}" data-tab-id="${tab.id}" title="${isPinned ? t('unpinTip') : t('pinTip')}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
        </button>
        <button class="chip-action chip-close" data-action="close-single-tab" data-tab-url="${safeUrl}" data-tab-id="${tab.id}" title="${t('closeThisTab')}">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>`;
  }).join('') + (extraCount > 0 ? buildOverflowChips(uniqueTabs.slice(8), urlCounts, favoritedUrls) : '');

  const closeAllBtn = `
    <button class="action-btn close-tabs mission-close-all" data-action="close-domain-tabs" data-domain-id="${stableId}" title="${t('closeAllN', tabCount)}">
      ${ICONS.close}
    </button>`;

  const cardClasses = [
    'mission-card',
    'domain-card',
    tabCount === 1 ? 'single-tab-domain' : '',
    hasDupes ? 'has-amber-bar' : ''
  ].filter(Boolean).join(' ');

  return `
    <div class="${cardClasses}" data-domain-id="${stableId}">
      <div class="status-bar"></div>
      <div class="mission-content">
        <div class="mission-top">
          <span class="mission-name">${isLanding ? t('homepages') : (group.label || friendlyDomain(group.domain))}</span>
          ${tabBadge}
          ${closeAllBtn}
        </div>
        <div class="mission-pages">${pageChips}</div>
      </div>
      <div class="mission-meta">
        <div class="mission-page-count">${tabCount}</div>
        <div class="mission-page-label">${t('tabs')}</div>
      </div>
    </div>`;
}


/* ----------------------------------------------------------------
   LONG-TERM FAVORITES — Render Column
   ---------------------------------------------------------------- */

async function renderFavoritesColumn() {
  const list  = document.getElementById('favoritesList');
  const empty = document.getElementById('favoritesEmpty');
  if (!list || !empty) return;

  try {
    const items = await getFavorites();
    if (items.length === 0) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    list.innerHTML = items
      .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
      .map(renderFavoriteItem)
      .join('');
  } catch (err) {
    console.warn('[wolfy] Could not load favorites:', err);
  }
}

function renderFavoriteItem(fav) {
  const safeUrl   = (fav.url || '').replace(/"/g, '&quot;');
  const safeTitle = (fav.title || fav.url || '').replace(/"/g, '&quot;');

  let imgHtml = '';
  if (fav.customLogo) {
    imgHtml = `<img class="favorite-favicon" src="${fav.customLogo}" alt="">`;
  } else if (fav.iconUrl) {
    const safe       = fav.iconUrl.replace(/"/g, '&quot;');
    const isBinary   = fav.iconUrl.startsWith('data:');
    const resolved   = isBinary ? 'data-resolved="1"' : '';
    imgHtml = `<img class="favorite-favicon" src="${safe}" data-fav-id="${fav.id}" ${resolved} alt="">`;
  } else {
    const chain = getFaviconFallbackChain(fav.url, 128);
    if (chain.length > 0) {
      const primary  = chain[0].replace(/"/g, '&quot;');
      const fallback = chain.slice(1).join('|').replace(/"/g, '&quot;');
      imgHtml = `<img class="favorite-favicon" src="${primary}" data-fallback="${fallback}" data-fav-id="${fav.id}" alt="">`;
    }
  }

  return `
    <a class="favorite-item" href="${safeUrl}" target="_blank" rel="noopener noreferrer" draggable="true" data-fav-id="${fav.id}" title="${safeUrl}">
      ${imgHtml}
      <span class="favorite-title">${safeTitle}</span>
      <button class="favorite-menu" data-action="favorite-menu" data-fav-id="${fav.id}" title="${t('moreActions')}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
      </button>
    </a>`;
}


/* ----------------------------------------------------------------
   MAIN DASHBOARD RENDERER
   ---------------------------------------------------------------- */

/**
 * renderStaticDashboard()
 *
 * The main render function:
 * 1. Paints greeting + date
 * 2. Fetches open tabs via chrome.tabs.query()
 * 3. Groups tabs by domain (with landing pages pulled out to their own group)
 * 4. Renders domain cards
 * 5. Updates footer stats
 * 6. Renders the "Long-term Favorites" column
 */
async function renderStaticDashboard() {
  applyBackgroundSettings(await getBackgroundSettings());

  // --- Header ---
  updateHeaderDateDisplay();
  void ensureWeatherLoaded();

  // --- Fetch tabs ---
  await fetchOpenTabs();
  const realTabs = getRealTabs();

  // --- Group tabs by domain ---
  const LANDING_PAGE_PATTERNS = [
    ...(typeof LOCAL_LANDING_PAGE_PATTERNS !== 'undefined' ? LOCAL_LANDING_PAGE_PATTERNS : []),
  ];

  function isLandingPage(url) {
    try {
      const parsed = new URL(url);
      return LANDING_PAGE_PATTERNS.some(p => {
        const hostnameMatch = p.hostname
          ? parsed.hostname === p.hostname
          : p.hostnameEndsWith
            ? parsed.hostname.endsWith(p.hostnameEndsWith)
            : false;
        if (!hostnameMatch) return false;
        if (p.test)       return p.test(parsed.pathname, url);
        if (p.pathPrefix) return parsed.pathname.startsWith(p.pathPrefix);
        if (p.pathExact)  return p.pathExact.includes(parsed.pathname);
        return parsed.pathname === '/';
      });
    } catch { return false; }
  }

  const customGroups = typeof LOCAL_CUSTOM_GROUPS !== 'undefined' ? LOCAL_CUSTOM_GROUPS : [];

  function matchCustomGroup(url) {
    try {
      const parsed = new URL(url);
      return customGroups.find(r => {
        const hostMatch = r.hostname
          ? parsed.hostname === r.hostname
          : r.hostnameEndsWith
            ? parsed.hostname.endsWith(r.hostnameEndsWith)
            : false;
        if (!hostMatch) return false;
        if (r.pathPrefix) return parsed.pathname.startsWith(r.pathPrefix);
        return true;
      }) || null;
    } catch { return null; }
  }

  const landingHostnames = new Set(LANDING_PAGE_PATTERNS.map(p => p.hostname).filter(Boolean));
  const landingSuffixes  = LANDING_PAGE_PATTERNS.map(p => p.hostnameEndsWith).filter(Boolean);
  function isLandingDomain(domain) {
    if (landingHostnames.has(domain)) return true;
    return landingSuffixes.some(s => domain.endsWith(s));
  }

  function groupTabsByDomain(tabs) {
    const groupMap = {};
    const landing  = [];
    for (const tab of tabs) {
      try {
        if (isLandingPage(tab.url)) { landing.push(tab); continue; }
        const customRule = matchCustomGroup(tab.url);
        if (customRule) {
          const key = customRule.groupKey;
          if (!groupMap[key]) groupMap[key] = { domain: key, label: customRule.groupLabel, tabs: [] };
          groupMap[key].tabs.push(tab);
          continue;
        }
        const hostname = (tab.url && tab.url.startsWith('file://'))
          ? 'local-files'
          : new URL(tab.url).hostname;
        if (!hostname) continue;
        if (!groupMap[hostname]) groupMap[hostname] = { domain: hostname, tabs: [] };
        groupMap[hostname].tabs.push(tab);
      } catch { /* skip malformed */ }
    }
    if (landing.length > 0) {
      groupMap['__landing-pages__'] = { domain: '__landing-pages__', tabs: landing };
    }

    const tabRecency = (t) => (t.lastAccessed || 0);
    for (const g of Object.values(groupMap)) {
      g.tabs.sort((a, b) => {
        const t = tabRecency(b) - tabRecency(a);
        return t !== 0 ? t : (b.id - a.id);
      });
    }

    return Object.values(groupMap).sort((a, b) => {
      const aIsLanding = a.domain === '__landing-pages__';
      const bIsLanding = b.domain === '__landing-pages__';
      if (aIsLanding !== bIsLanding) return aIsLanding ? -1 : 1;

      const aTime = a.tabs[0] ? tabRecency(a.tabs[0]) : 0;
      const bTime = b.tabs[0] ? tabRecency(b.tabs[0]) : 0;
      if (aTime !== bTime) return bTime - aTime;

      const aMaxId = a.tabs[0] ? a.tabs[0].id : 0;
      const bMaxId = b.tabs[0] ? b.tabs[0].id : 0;
      return bMaxId - aMaxId;
    });
  }

  const pinnedRealTabs  = realTabs.filter(t => t.pinned);
  const regularRealTabs = realTabs.filter(t => !t.pinned);
  pinnedDomainGroups = groupTabsByDomain(pinnedRealTabs);
  domainGroups       = groupTabsByDomain(regularRealTabs);

  // --- Render domain cards ---
  const openTabsSection       = document.getElementById('openTabsSection');
  const openTabsSubSection    = document.getElementById('openTabsSubSection');
  const openTabsMissionsEl    = document.getElementById('openTabsMissions');
  const openTabsSectionCount  = document.getElementById('openTabsSectionCount');
  const openTabsSectionTitle  = document.getElementById('openTabsSectionTitle');
  const openTabsSectionAction = document.getElementById('openTabsSectionAction');
  const pinnedSubSection      = document.getElementById('pinnedSubSection');
  const pinnedMissionsEl      = document.getElementById('pinnedMissions');
  const pinnedSectionCount    = document.getElementById('pinnedSectionCount');
  const pinnedSectionTitle    = document.getElementById('pinnedSectionTitle');

  const favoritedUrls = new Set((await getFavorites()).map(f => f.url));

  // Pinned sub-section
  if (pinnedSubSection) {
    if (pinnedDomainGroups.length > 0) {
      if (pinnedSectionTitle) pinnedSectionTitle.textContent = t('pinned');
      if (pinnedSectionCount) pinnedSectionCount.innerHTML = `<span class="section-badge">${t('nTabsCount', pinnedRealTabs.length)}</span>`;
      pinnedMissionsEl.innerHTML = pinnedDomainGroups.map(g => renderDomainCard(g, favoritedUrls)).join('');
      pinnedSubSection.style.display = 'block';
    } else {
      pinnedSubSection.style.display = 'none';
    }
  }

  if (openTabsSection) openTabsSection.style.display = 'block';

  if (domainGroups.length > 0 && openTabsSubSection) {
    if (openTabsSectionTitle) openTabsSectionTitle.textContent = t('openTabs');
    openTabsSectionCount.innerHTML = t('nDomains', domainGroups.length);
    if (openTabsSectionAction) {
      openTabsSectionAction.innerHTML = `<button class="action-btn close-tabs" data-action="close-all-open-tabs">${ICONS.close} ${t('closeAllN', regularRealTabs.length)}</button>`;
    }
    openTabsMissionsEl.innerHTML = domainGroups.map(g => renderDomainCard(g, favoritedUrls)).join('');
    openTabsSubSection.style.display = 'block';
  } else if (openTabsSubSection) {
    openTabsSubSection.style.display = 'none';
    if (openTabsSectionAction) openTabsSectionAction.innerHTML = '';
  }

  // --- Footer stats ---
  const statTabs = document.getElementById('statTabs');
  if (statTabs) statTabs.textContent = openTabs.length;
  await renderFooterSocials();

  // --- Check for duplicate tab-out tabs ---
  checkTabOutDupes();

  // --- Render "Long-term Favorites" column ---
  await renderFavoritesColumn();
  await renderWorkspaceSnapshotsColumn();
}

async function renderDashboard() {
  await renderStaticDashboard();
}
