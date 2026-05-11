/* ================================================================
   LUNAR CALENDAR (农历)
   Compact encoding: each hex number encodes one lunar year.
     bits  0-3  → leap month (0 = none, 1-12 = month followed by a leap)
     bits  4-15 → month lengths (1 = 30 days, 0 = 29 days), month 1 at bit 4
     bit   16   → leap month days (0 = 29 days, 1 = 30 days)
   Data covers years 1900–2100.
   Reference: lunar 1900-01-01 = Gregorian 1900-01-31.
---------------------------------------------------------------- */
'use strict';

const LUNAR_INFO = [
  0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2, // 1900-1909
  0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977, // 1910-1919
  0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970, // 1920-1929
  0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950, // 1930-1939
  0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557, // 1940-1949
  0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0, // 1950-1959
  0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0, // 1960-1969
  0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6, // 1970-1979
  0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570, // 1980-1989
  0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0, // 1990-1999
  0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5, // 2000-2009
  0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930, // 2010-2019
  0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530, // 2020-2029
  0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45, // 2030-2039
  0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0, // 2040-2049
  0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06aa0,0x1a6c4,0x0aae0, // 2050-2059
  0x092e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4, // 2060-2069
  0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0, // 2070-2079
  0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160, // 2080-2089
  0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a4d0,0x0d150,0x0f252, // 2090-2099
  0x0d520  // 2100
];

const LUNAR_MONTHS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const LUNAR_DAYS = [
  '', '初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
  '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
  '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'
];

/** Total days in a lunar year (Gregorian year used for LUNAR_INFO index). */
function lunarYearDays(y) {
  let sum = 0;
  const info = LUNAR_INFO[y - 1900];
  const monthBits = info >> 4;
  for (let i = 0; i < 12; i++) {
    sum += (monthBits >> i) & 1 ? 30 : 29;
  }
  const leap = info & 0xf;
  if (leap) sum += (info >> 16) & 1 ? 30 : 29;
  return sum;
}

/** Days in a specific lunar month (1-12). Set isLeap=true for the leap month. */
function lunarMonthDays(y, m, isLeap) {
  const info = LUNAR_INFO[y - 1900];
  const leap = info & 0xf;
  if (isLeap && m === leap) return (info >> 16) & 1 ? 30 : 29;
  return (info >> (4 + m - 1)) & 1 ? 30 : 29;
}

/**
 * Convert a Gregorian Date to a Chinese lunar date.
 * Returns { year, month, day, isLeap } or null if out of range.
 */
function getLunarDate(date) {
  const base = new Date(1900, 0, 31);
  let offset = Math.floor((date.getTime() - base.getTime()) / 86400000);
  if (offset < 0) return null;

  let ly = 1900;
  while (ly < 2101) {
    const yd = lunarYearDays(ly);
    if (offset < yd) break;
    offset -= yd;
    ly++;
  }
  if (ly > 2100) return null;

  const info = LUNAR_INFO[ly - 1900];
  const leapMonth = info & 0xf;
  let lm = 1;
  let isLeap = false;
  while (lm <= 12) {
    if (leapMonth > 0 && lm === leapMonth + 1) {
      const leapDays = (info >> 16) & 1 ? 30 : 29;
      if (offset < leapDays) {
        isLeap = true;
        lm = leapMonth;
        break;
      }
      offset -= leapDays;
    }
    const md = lunarMonthDays(ly, lm, false);
    if (offset < md) break;
    offset -= md;
    lm++;
  }

  return { year: ly, month: lm, day: offset + 1, isLeap: isLeap };
}

/** Format a lunar date as Chinese string, e.g. "三月廿三" or "闰三月廿三". */
function formatLunarDate(lunar) {
  const pre = lunar.isLeap ? '闰' : '';
  return pre + LUNAR_MONTHS[lunar.month] + '月' + LUNAR_DAYS[lunar.day];
}
