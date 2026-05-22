/* ================================================================
   domain.js — Domain name cleanup, friendly brand names, title
   smartening, favicon resolution, and icon caching.
   ================================================================ */

'use strict';

/* ----------------------------------------------------------------
   DOMAIN & TITLE CLEANUP HELPERS
   ---------------------------------------------------------------- */

// Map of known hostnames → friendly display names.
const FRIENDLY_DOMAINS = {
  'github.com':           'GitHub',
  'www.github.com':       'GitHub',
  'gist.github.com':      'GitHub Gist',
  'youtube.com':          'YouTube',
  'www.youtube.com':      'YouTube',
  'music.youtube.com':    'YouTube Music',
  'x.com':                'X',
  'www.x.com':            'X',
  'twitter.com':          'X',
  'www.twitter.com':      'X',
  'reddit.com':           'Reddit',
  'www.reddit.com':       'Reddit',
  'old.reddit.com':       'Reddit',
  'substack.com':         'Substack',
  'www.substack.com':     'Substack',
  'medium.com':           'Medium',
  'www.medium.com':       'Medium',
  'linkedin.com':         'LinkedIn',
  'www.linkedin.com':     'LinkedIn',
  'stackoverflow.com':    'Stack Overflow',
  'www.stackoverflow.com':'Stack Overflow',
  'news.ycombinator.com': 'Hacker News',
  'google.com':           'Google',
  'www.google.com':       'Google',
  'mail.google.com':      'Gmail',
  'docs.google.com':      'Google Docs',
  'drive.google.com':     'Google Drive',
  'calendar.google.com':  'Google Calendar',
  'meet.google.com':      'Google Meet',
  'gemini.google.com':    'Gemini',
  'chatgpt.com':          'ChatGPT',
  'www.chatgpt.com':      'ChatGPT',
  'chat.openai.com':      'ChatGPT',
  'claude.ai':            'Claude',
  'www.claude.ai':        'Claude',
  'code.claude.com':      'Claude Code',
  'notion.so':            'Notion',
  'www.notion.so':        'Notion',
  'figma.com':            'Figma',
  'www.figma.com':        'Figma',
  'slack.com':            'Slack',
  'app.slack.com':        'Slack',
  'discord.com':          'Discord',
  'www.discord.com':      'Discord',
  'wikipedia.org':        'Wikipedia',
  'en.wikipedia.org':     'Wikipedia',
  'amazon.com':           'Amazon',
  'www.amazon.com':       'Amazon',
  'netflix.com':          'Netflix',
  'www.netflix.com':      'Netflix',
  'spotify.com':          'Spotify',
  'open.spotify.com':     'Spotify',
  'vercel.com':           'Vercel',
  'www.vercel.com':       'Vercel',
  'npmjs.com':            'npm',
  'www.npmjs.com':        'npm',
  'developer.mozilla.org':'MDN',
  'arxiv.org':            'arXiv',
  'www.arxiv.org':        'arXiv',
  'huggingface.co':       'Hugging Face',
  'www.huggingface.co':   'Hugging Face',
  'producthunt.com':      'Product Hunt',
  'www.producthunt.com':  'Product Hunt',
  'xiaohongshu.com':      'RedNote',
  'www.xiaohongshu.com':  'RedNote',
  'local-files':          'Local Files',
};

function isLocalHostname(hostname) {
  const host = (hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1') return true;

  const parts = host.split('.');
  if (parts.length !== 4) return false;

  const nums = parts.map(part => Number(part));
  if (nums.some((n, i) => !/^\d+$/.test(parts[i]) || n < 0 || n > 255)) return false;

  const [a, b] = nums;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 0 && b === 0 && nums[2] === 0 && nums[3] === 0)
  );
}

function friendlyDomain(hostname) {
  if (!hostname) return '';
  if (hostname === '__local__' || isLocalHostname(hostname)) return t('local');
  if (FRIENDLY_DOMAINS[hostname]) return FRIENDLY_DOMAINS[hostname];

  if (hostname.endsWith('.substack.com') && hostname !== 'substack.com') {
    return capitalize(hostname.replace('.substack.com', '')) + "'s Substack";
  }
  if (hostname.endsWith('.github.io')) {
    return capitalize(hostname.replace('.github.io', '')) + ' (GitHub Pages)';
  }

  const TLDS_2 = ['co.uk', 'co.jp', 'com.cn', 'com.tw', 'com.au', 'com.hk', 'co.kr'];
  const parts = hostname.replace(/^www\./, '').split('.');
  let brand;
  if (parts.length >= 3 && TLDS_2.includes(parts.slice(-2).join('.'))) {
    brand = parts[parts.length - 3];
  } else if (parts.length >= 2) {
    brand = parts[parts.length - 2];
  } else {
    brand = parts[0];
  }
  return capitalize(brand);
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function stripTitleNoise(title) {
  if (!title) return '';
  title = title.replace(/^\(\d+\+?\)\s*/, '');
  title = title.replace(/\s*\([\d,]+\+?\)\s*/g, ' ');
  title = title.replace(/\s*[\-‐-―]\s*[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '');
  title = title.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '');
  title = title.replace(/\s+on X:\s*/, ': ');
  title = title.replace(/\s*\/\s*X\s*$/, '');
  return title.trim();
}

function cleanTitle(title, hostname) {
  if (!title || !hostname) return title || '';

  const friendly = friendlyDomain(hostname);
  const domain   = hostname.replace(/^www\./, '');
  const seps     = [' - ', ' | ', ' — ', ' · ', ' – '];

  for (const sep of seps) {
    const idx = title.lastIndexOf(sep);
    if (idx === -1) continue;
    const suffix     = title.slice(idx + sep.length).trim();
    const suffixLow  = suffix.toLowerCase();
    if (
      suffixLow === domain.toLowerCase() ||
      suffixLow === friendly.toLowerCase() ||
      suffixLow === domain.replace(/\.\w+$/, '').toLowerCase() ||
      domain.toLowerCase().includes(suffixLow) ||
      friendly.toLowerCase().includes(suffixLow)
    ) {
      const cleaned = title.slice(0, idx).trim();
      if (cleaned.length >= 5) return cleaned;
    }
  }
  return title;
}

function smartTitle(title, url) {
  if (!url) return title || '';
  let pathname = '', hostname = '';
  try { const u = new URL(url); pathname = u.pathname; hostname = u.hostname; }
  catch { return title || ''; }

  const titleIsUrl = !title || title === url || title.startsWith(hostname) || title.startsWith('http');

  if ((hostname === 'x.com' || hostname === 'twitter.com' || hostname === 'www.x.com') && pathname.includes('/status/')) {
    const username = pathname.split('/')[1];
    if (username) return titleIsUrl ? `Post by @${username}` : title;
  }

  if (hostname === 'github.com' || hostname === 'www.github.com') {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const [owner, repo, ...rest] = parts;
      if (rest[0] === 'issues' && rest[1]) return `${owner}/${repo} Issue #${rest[1]}`;
      if (rest[0] === 'pull'   && rest[1]) return `${owner}/${repo} PR #${rest[1]}`;
      if (rest[0] === 'blob' || rest[0] === 'tree') return `${owner}/${repo} — ${rest.slice(2).join('/')}`;
      if (titleIsUrl) return `${owner}/${repo}`;
    }
  }

  if ((hostname === 'www.youtube.com' || hostname === 'youtube.com') && pathname === '/watch') {
    if (titleIsUrl) return 'YouTube Video';
  }

  if ((hostname === 'www.reddit.com' || hostname === 'reddit.com' || hostname === 'old.reddit.com') && pathname.includes('/comments/')) {
    const parts  = pathname.split('/').filter(Boolean);
    const subIdx = parts.indexOf('r');
    if (subIdx !== -1 && parts[subIdx + 1]) {
      if (titleIsUrl) return `r/${parts[subIdx + 1]} post`;
    }
  }

  return title || url;
}


/* ----------------------------------------------------------------
   FAVICON URL — prefers Chrome's cached favicon (most accurate for sites
   the user has visited), which works for sites Google's S2 service can't
   resolve (e.g. WhatsApp Web). Requires the "favicon" permission.
   ---------------------------------------------------------------- */
function getFaviconUrl(pageUrl, size = 64) {
  if (!pageUrl) return '';
  try {
    const u = new URL(chrome.runtime.getURL('/_favicon/'));
    u.searchParams.set('pageUrl', pageUrl);
    u.searchParams.set('size', String(size));
    return u.toString();
  } catch {
    return '';
  }
}

/**
 * High-quality favicon fallback chain.
 *  1. apple-touch-icon.png            — typically 180–512px, beautiful
 *  2. apple-touch-icon-precomposed.png — older convention, same idea
 *  3. Chrome's cached _favicon (real icon, but lower-res)
 */
function getFaviconFallbackChain(pageUrl, size = 128) {
  if (!pageUrl) return [];
  let origin = '';
  try { origin = new URL(pageUrl).origin; } catch { return []; }
  return [
    `${origin}/apple-touch-icon.png`,
    `${origin}/apple-touch-icon-precomposed.png`,
    getFaviconUrl(pageUrl, size),
  ].filter(Boolean);
}

// Global error-handler: when an <img class="favorite-favicon"> 404s, walk
// the fallback chain stored in data-fallback. Capture phase because `error`
// events don't bubble.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (!img.dataset || typeof img.dataset.fallback !== 'string') return;
  const list = img.dataset.fallback.split('|').filter(Boolean);
  if (list.length === 0) {
    img.style.display = 'none';
    return;
  }
  const next = list.shift();
  img.dataset.fallback = list.join('|');
  img.src = next;
}, true);

/* ----------------------------------------------------------------
   ICON RESOLUTION CACHE — once an image loads successfully, persist
   the URL that worked into the favorite's `iconUrl` field. Future
   renders skip the fallback chain entirely.
   ---------------------------------------------------------------- */
let _pendingIconWrites = new Map();   // favId → resolved url
let _iconWriteTimer    = null;
let _suppressFavReRender = false;     // set briefly so onChanged skips us

async function flushIconWrites() {
  _iconWriteTimer = null;
  const writes = _pendingIconWrites;
  if (writes.size === 0) return;
  _pendingIconWrites = new Map();
  const { favorites = [] } = await chrome.storage.local.get('favorites');
  let modified = false;
  for (const [favId, url] of writes) {
    const fav = favorites.find(f => f.id === favId);
    if (fav && fav.iconUrl !== url) {
      fav.iconUrl = url;
      modified = true;
    }
  }
  if (!modified) return;
  _suppressFavReRender = true;
  await chrome.storage.local.set({ favorites });
  setTimeout(() => { _suppressFavReRender = false; }, 200);
}

function queueIconWrite(favId, url) {
  if (!favId || !url) return;
  _pendingIconWrites.set(favId, url);
  if (_iconWriteTimer) clearTimeout(_iconWriteTimer);
  _iconWriteTimer = setTimeout(flushIconWrites, 500);
}

// Capture phase — `load` doesn't bubble for individual images.
document.addEventListener('load', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (!img.classList.contains('favorite-favicon')) return;
  const favId = img.dataset.favId;
  if (!favId) return;
  if (img.dataset.resolved === '1') return;   // already cached
  const finalUrl = img.currentSrc || img.src;
  if (!finalUrl) return;
  if (finalUrl.startsWith('data:')) return;
  img.dataset.resolved = '1';
  downloadAndCacheIcon(favId, finalUrl);
}, true);

const MAX_ICON_BYTES = 200 * 1024;   // hard cap to keep storage reasonable

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function downloadAndCacheIcon(favId, url) {
  try {
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) return;
    const blob = await r.blob();
    if (blob.size === 0 || blob.size > MAX_ICON_BYTES) return;
    const dataUrl = await blobToDataUrl(blob);
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return;
    queueIconWrite(favId, dataUrl);
  } catch {
    // Fetch failed (network, blocked, etc.) — leave iconUrl unset; we'll
    // try again next render via the fallback chain.
  }
}
