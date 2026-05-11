/* ================================================================
   weather.js — Open-Meteo weather API, WMO code icons/labels,
   geolocation, and caching.
   ================================================================ */

'use strict';

const WEATHER_CACHE_MS = 15 * 60 * 1000;
let weatherCache = {
  fetchedAt: 0,
  displayByLang: { en: '', zh: '' },
  pending: null,
};

function getWeatherLabel(code, isDay, lang = currentLang) {
  const labels = {
    0:  { en: isDay ? 'Clear' : 'Clear night', zh: isDay ? '晴' : '晴夜' },
    1:  { en: 'Mostly clear', zh: '少云' },
    2:  { en: 'Partly cloudy', zh: '多云' },
    3:  { en: 'Overcast', zh: '阴天' },
    45: { en: 'Fog', zh: '雾' },
    48: { en: 'Rime fog', zh: '雾凇' },
    51: { en: 'Light drizzle', zh: '小毛毛雨' },
    53: { en: 'Drizzle', zh: '毛毛雨' },
    55: { en: 'Heavy drizzle', zh: '强毛毛雨' },
    56: { en: 'Freezing drizzle', zh: '冻毛毛雨' },
    57: { en: 'Heavy freezing drizzle', zh: '强冻毛毛雨' },
    61: { en: 'Light rain', zh: '小雨' },
    63: { en: 'Rain', zh: '雨' },
    65: { en: 'Heavy rain', zh: '大雨' },
    66: { en: 'Freezing rain', zh: '冻雨' },
    67: { en: 'Heavy freezing rain', zh: '强冻雨' },
    71: { en: 'Light snow', zh: '小雪' },
    73: { en: 'Snow', zh: '雪' },
    75: { en: 'Heavy snow', zh: '大雪' },
    77: { en: 'Snow grains', zh: '米雪' },
    80: { en: 'Rain showers', zh: '阵雨' },
    81: { en: 'Heavy showers', zh: '强阵雨' },
    82: { en: 'Violent showers', zh: '暴雨' },
    85: { en: 'Snow showers', zh: '阵雪' },
    86: { en: 'Heavy snow showers', zh: '强阵雪' },
    95: { en: 'Thunderstorm', zh: '雷暴' },
    96: { en: 'Storm with hail', zh: '雷暴冰雹' },
    99: { en: 'Heavy hailstorm', zh: '强冰雹雷暴' },
  };
  const entry = labels[code];
  if (!entry) return lang === 'zh' ? '天气' : 'Weather';
  return lang === 'zh' ? entry.zh : entry.en;
}

function getWeatherIconSvg(code, isDay) {
  const stroke = 'currentColor';
  const common = `fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;

  if (code === 0) {
    if (isDay) {
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" ${common}></circle><path d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" ${common}></path></svg>`;
    }
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 3.5a7.7 7.7 0 1 0 6 12.5 8.7 8.7 0 1 1-6-12.5Z" ${common}></path></svg>`;
  }

  if (code === 1 || code === 2 || code === 3) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 18h9.2a3.8 3.8 0 0 0 .3-7.6 5.7 5.7 0 0 0-10.9 1.8A3.2 3.2 0 0 0 7.5 18Z" ${common}></path></svg>`;
  }

  if (code === 45 || code === 48) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10.5h12M4.5 14h15M7.5 17.5h9" ${common}></path></svg>`;
  }

  if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 14.5h9.2a3.8 3.8 0 0 0 .3-7.6 5.7 5.7 0 0 0-10.9 1.8 3.2 3.2 0 0 0 1.4 5.8Z" ${common}></path><path d="M9 17.5l-1 2M13 17.5l-1 2M17 17.5l-1 2" ${common}></path></svg>`;
  }

  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 14h9.2a3.8 3.8 0 0 0 .3-7.6 5.7 5.7 0 0 0-10.9 1.8A3.2 3.2 0 0 0 7.5 14Z" ${common}></path><path d="M9.5 18.2h.01M12 19.2h.01M14.5 18.2h.01" ${common}></path></svg>`;
  }

  if (code === 95 || code === 96 || code === 99) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 13.8h9.2a3.8 3.8 0 0 0 .3-7.6 5.7 5.7 0 0 0-10.9 1.8A3.2 3.2 0 0 0 7.5 13.8Z" ${common}></path><path d="m11 15.5-1.4 3h2.2l-1.1 3 4-5.5h-2.5l1.2-2.5" ${common}></path></svg>`;
  }

  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" ${common}></circle><path d="M12 2.8v2M12 19.2v2M4.8 12h2M17.2 12h2" ${common}></path></svg>`;
}

function cityFromTimezone(timezone) {
  const raw = String(timezone || '').trim();
  if (!raw || !raw.includes('/')) return '';
  const parts = raw.split('/');
  const cityPart = parts[parts.length - 1];
  if (!cityPart) return '';
  return cityPart
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getLocalTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

async function fetchWeatherText() {
  if (!navigator.geolocation) return null;

  const coords = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      reject,
      { enableHighAccuracy: false, timeout: 8000, maximumAge: WEATHER_CACHE_MS }
    );
  });

  const params = new URLSearchParams({
    latitude: String(coords.latitude),
    longitude: String(coords.longitude),
    current: 'temperature_2m,weather_code,is_day',
    temperature_unit: 'celsius',
    timezone: 'auto',
  });

  const resp = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    credentials: 'omit',
    cache: 'no-store',
  });
  if (!resp.ok) throw new Error(`weather ${resp.status}`);

  const data = await resp.json();
  const current = data && data.current;
  if (!current || typeof current.temperature_2m !== 'number') return null;

  const temp = Math.round(current.temperature_2m);
  const isDay = Number(current.is_day) === 1;
  const city = cityFromTimezone(getLocalTimezone()) || cityFromTimezone(data.timezone);

  const icon = getWeatherIconSvg(current.weather_code, isDay);
  const cityHtml = city ? `<span class="weather-city">${escapeHtml(city)}</span>` : '';
  const detailEn = `${temp}°C ${getWeatherLabel(current.weather_code, isDay, 'en')}`;
  const detailZh = `${temp}°C ${getWeatherLabel(current.weather_code, isDay, 'zh')}`;
  return {
    en: `<span class="weather-inline">${cityHtml}<span class="weather-icon">${icon}</span><span class="weather-detail">${escapeHtml(detailEn)}</span></span>`,
    zh: `<span class="weather-inline">${cityHtml}<span class="weather-icon">${icon}</span><span class="weather-detail">${escapeHtml(detailZh)}</span></span>`,
  };
}

async function ensureWeatherLoaded() {
  const now = Date.now();
  const cached = weatherCache.displayByLang[currentLang];
  if (cached && (now - weatherCache.fetchedAt) < WEATHER_CACHE_MS) {
    currentWeatherHtml = cached;
    updateHeaderDateDisplay();
    return;
  }

  if (weatherCache.pending) {
    try { await weatherCache.pending; } catch {}
    currentWeatherHtml = weatherCache.displayByLang[currentLang] || '';
    updateHeaderDateDisplay();
    return;
  }

  weatherCache.pending = (async () => {
    try {
      const displayByLang = await fetchWeatherText();
      if (displayByLang) {
        weatherCache.displayByLang = displayByLang;
      }
      weatherCache.fetchedAt = Date.now();
    } catch {
      weatherCache.fetchedAt = Date.now();
    }
    weatherCache.pending = null;
  })();

  try { await weatherCache.pending; } catch {}
  currentWeatherHtml = weatherCache.displayByLang[currentLang] || '';
  updateHeaderDateDisplay();
}
