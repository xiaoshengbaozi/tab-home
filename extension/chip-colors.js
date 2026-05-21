/* ================================================================
   chip-colors.js - adaptive page-chip colors from loaded favicons.
   ================================================================ */

'use strict';

const CHIP_COLOR_CACHE = new Map();

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToCss(rgb) {
  return `${clampChannel(rgb.r)}, ${clampChannel(rgb.g)}, ${clampChannel(rgb.b)}`;
}

function mixRgb(a, b, amount) {
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  };
}

function luminance(rgb) {
  const channels = [rgb.r, rgb.g, rgb.b].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(a, b) {
  const light = Math.max(luminance(a), luminance(b));
  const dark = Math.min(luminance(a), luminance(b));
  return (light + 0.05) / (dark + 0.05);
}

function rgbToHsl(rgb) {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return { h, s, l };
}

function getDominantFaviconColor(img) {
  const cacheKey = img.currentSrc || img.src;
  if (CHIP_COLOR_CACHE.has(cacheKey)) return CHIP_COLOR_CACHE.get(cacheKey);

  const canvas = document.createElement('canvas');
  const size = 24;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const buckets = new Map();

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 80) continue;

      const rgb = { r: data[i], g: data[i + 1], b: data[i + 2] };
      const hsl = rgbToHsl(rgb);
      const isNearWhite = rgb.r > 238 && rgb.g > 238 && rgb.b > 238;
      const isNearBlack = rgb.r < 18 && rgb.g < 18 && rgb.b < 18;
      if ((isNearWhite || isNearBlack) && hsl.s < 0.18) continue;

      const key = `${Math.round(rgb.r / 24)},${Math.round(rgb.g / 24)},${Math.round(rgb.b / 24)}`;
      const weight = alpha / 255 * (0.35 + hsl.s * 1.3) * (0.65 + Math.abs(hsl.l - 0.5));
      const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, weight: 0 };
      bucket.r += rgb.r * weight;
      bucket.g += rgb.g * weight;
      bucket.b += rgb.b * weight;
      bucket.weight += weight;
      buckets.set(key, bucket);
    }

    let best = null;
    for (const bucket of buckets.values()) {
      if (!best || bucket.weight > best.weight) best = bucket;
    }
    if (!best || best.weight <= 0) return null;

    const color = {
      r: best.r / best.weight,
      g: best.g / best.weight,
      b: best.b / best.weight,
    };
    CHIP_COLOR_CACHE.set(cacheKey, color);
    return color;
  } catch {
    CHIP_COLOR_CACHE.set(cacheKey, null);
    return null;
  }
}

function getReadableChipPalette(primary) {
  const lightTheme = document.documentElement.dataset.theme === 'light';
  const base = lightTheme ? { r: 255, g: 255, b: 255 } : { r: 9, g: 14, b: 28 };
  let bg = mixRgb(primary, base, lightTheme ? 0.58 : 0.48);
  const lightInk = { r: 255, g: 255, b: 255 };
  const darkInk = { r: 13, g: 20, b: 36 };
  let ink = contrastRatio(bg, darkInk) >= contrastRatio(bg, lightInk) ? darkInk : lightInk;

  if (contrastRatio(bg, ink) < 4.5) {
    bg = mixRgb(bg, ink === darkInk ? lightInk : { r: 0, g: 0, b: 0 }, 0.22);
    ink = contrastRatio(bg, darkInk) >= contrastRatio(bg, lightInk) ? darkInk : lightInk;
  }

  const muted = mixRgb(ink, bg, ink === darkInk ? 0.34 : 0.26);
  const actionBg = mixRgb(bg, ink, ink === darkInk ? 0.08 : 0.12);
  const actionHover = mixRgb(bg, primary, lightTheme ? 0.34 : 0.38);
  const border = mixRgb(primary, ink, ink === darkInk ? 0.16 : 0.24);

  return { bg, ink, muted, actionBg, actionHover, border };
}

function applyPaletteToChip(chip, primary) {
  const palette = getReadableChipPalette(primary);

  chip.classList.add('has-favicon-color');
  applyPaletteVars(chip, primary, palette);

  const card = chip.closest('.mission-card');
  if (!card) return;
  const sourceChip = getCardColorSourceChip(card);
  if (sourceChip !== chip) return;
  card.classList.add('has-favicon-color');
  applyPaletteVars(card, primary, palette);
}

function applyPaletteVars(target, primary, palette) {
  target.dataset.faviconPrimaryRgb = rgbToCss(primary);
  target.style.setProperty('--chip-primary-rgb', rgbToCss(primary));
  target.style.setProperty('--chip-bg-rgb', rgbToCss(palette.bg));
  target.style.setProperty('--chip-ink-rgb', rgbToCss(palette.ink));
  target.style.setProperty('--chip-muted-rgb', rgbToCss(palette.muted));
  target.style.setProperty('--chip-action-bg-rgb', rgbToCss(palette.actionBg));
  target.style.setProperty('--chip-action-hover-rgb', rgbToCss(palette.actionHover));
  target.style.setProperty('--chip-border-rgb', rgbToCss(palette.border));
}

function getCardColorSourceChip(card) {
  const chips = card.querySelectorAll('.page-chip.clickable:not(.page-chip-overflow)');
  for (const chip of chips) {
    const img = chip.querySelector('.chip-favicon');
    if (img && img.complete && img.naturalWidth > 0) return chip;
  }
  return null;
}

function colorizeChipFromFavicon(chip) {
  if (!chip || chip.classList.contains('has-favicon-color')) return;
  const img = chip.querySelector('.chip-favicon');
  if (!img || !img.complete || img.naturalWidth === 0) return;
  const primary = getDominantFaviconColor(img);
  if (primary) applyPaletteToChip(chip, primary);
}

function applyFaviconChipColors(root = document) {
  const chips = root.querySelectorAll('.page-chip.clickable:not(.page-chip-overflow)');
  chips.forEach(chip => {
    const img = chip.querySelector('.chip-favicon');
    if (!img) return;
    if (img.complete) {
      colorizeChipFromFavicon(chip);
    } else {
      img.addEventListener('load', () => colorizeChipFromFavicon(chip), { once: true });
    }
  });
}

function refreshFaviconChipColors(root = document) {
  const chips = root.querySelectorAll('.page-chip.has-favicon-color');
  chips.forEach(chip => {
    const raw = chip.dataset.faviconPrimaryRgb;
    if (!raw) return;
    const parts = raw.split(',').map(v => Number(v.trim()));
    if (parts.length !== 3 || parts.some(Number.isNaN)) return;
    applyPaletteToChip(chip, { r: parts[0], g: parts[1], b: parts[2] });
  });
}
