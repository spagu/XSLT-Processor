/**
 * Date arithmetic of the EXSLT dates-and-times module, ported from libexslt
 * `date.c`: calendar positions, `date:add()`, `date:difference()` and
 * `date:seconds()`. C integer division truncates, hence `Math.trunc`.
 */

"use strict";

import {
  DateType,
  SECS_PER_DAY,
  createDate,
  dayInYear,
  daysInMonth,
} from "./calendar.js";
import { parseDate } from "./dateParse.js";
import { createDuration, parseDuration } from "./duration.js";

/** Days in a 400-year Gregorian cycle. */
const DAYS_PER_EPOCH = 146097;

/** Years in a Gregorian cycle. */
const YEARS_PER_EPOCH = 400;

const trunc = Math.trunc;

/**
 * Leap days before a year's start term of `_exsltDateCastYMToDays`.
 *
 * @param {number} year - Year
 * @returns {number} `year/4 - year/100 + year/400` with C division
 */
function leapDays(year) {
  return trunc(year / 4) - trunc(year / 100) + trunc(year / 400);
}

/**
 * Days from the calendar origin to the start of a value's month
 * (libexslt `_exsltDateCastYMToDays`).
 *
 * @param {object} dt - Date value
 * @returns {number} The day count
 */
function monthStartDays(dt) {
  const beforeMonth = dayInYear(0, dt.mon, dt.year);
  if (dt.year <= 0) {
    return (dt.year - 1) * 365 + leapDays(dt.year) + beforeMonth - 1;
  }
  return (dt.year - 1) * 365 + leapDays(dt.year - 1) + beforeMonth;
}

/**
 * Seconds since midnight of a value.
 *
 * @param {object} dt - Date value
 * @returns {number} The seconds
 */
function timeToNumber(dt) {
  return dt.hour * 3600 + dt.min * 60 + dt.sec;
}

/**
 * Day of the week, 0 for Sunday (libexslt `_exsltDateDayInWeek`).
 *
 * @param {number} yday - Day in the year
 * @param {number} year - Year
 * @returns {number} 0-6
 */
export function dayOfWeek(yday, year) {
  if (year <= 0) {
    const day = ((year % 7) - 2 + leapDays(year) + yday) % 7;
    return day < 0 ? day + 7 : day;
  }
  return ((year % 7) - 1 + leapDays(year - 1) + yday) % 7;
}

/**
 * ISO 8601 week of the year (libexslt `exsltDateWeekInYear`).
 *
 * @param {object} dt - Date value
 * @returns {number} The week number
 */
export function weekInYear(dt) {
  let diy = dayInYear(dt.day, dt.mon, dt.year);
  // Monday is day 0 of the ISO week, Thursday decides the year
  const diw = (dayOfWeek(diy, dt.year) + 6) % 7;
  diy += 3 - diw;
  if (diy < 1) {
    let year = dt.year - 1;
    if (year === 0) year--;
    diy += dayInYear(31, 12, year);
  } else if (diy > dayInYear(31, 12, dt.year)) {
    diy -= dayInYear(31, 12, dt.year);
  }
  return trunc((diy - 1) / 7) + 1;
}

/**
 * Week of the month, weeks starting on Monday (libexslt `exsltDateWeekInMonth`).
 *
 * @param {object} dt - Date value
 * @returns {number} The week number
 */
export function weekInMonth(dt) {
  const firstDay = (dayOfWeek(dayInYear(1, dt.mon, dt.year), dt.year) + 6) % 7;
  return trunc((dt.day + firstDay - 1) / 7) + 1;
}

/**
 * Keep only the fields of a less specific type (`_exsltDateTruncateDate`).
 *
 * @param {object} dt - Date value, modified
 * @param {number} type - The target {@link DateType}
 */
function truncateDate(dt, type) {
  if ((type & DateType.TIME) !== DateType.TIME) {
    dt.hour = 0;
    dt.min = 0;
    dt.sec = 0;
  }
  if ((type & DateType.GDAY) !== DateType.GDAY) dt.day = 1;
  if ((type & DateType.GMONTH) !== DateType.GMONTH) dt.mon = 1;
  if ((type & DateType.GYEAR) !== DateType.GYEAR) dt.year = 0;
  dt.type = type;
}

/**
 * Whether a value is a gYear, gYearMonth, date or dateTime.
 *
 * @param {object} dt - Date value
 * @returns {boolean} True for the types with a year
 */
export function hasYear(dt) {
  return dt.type >= DateType.GYEAR && dt.type <= DateType.DATETIME;
}

/**
 * Duration from x to y (libexslt `_exsltDateDifference`); the more specific
 * operand is truncated to the type of the other. Without `inSeconds`, gYear
 * and gYearMonth differences are counted in months.
 *
 * @param {object} x - Start date value, may be truncated
 * @param {object} y - End date value, may be truncated
 * @param {boolean} inSeconds - Always compute days and seconds
 * @returns {object|null} The duration, null for unsupported types
 */
export function dateDifference(x, y, inSeconds) {
  if (!hasYear(x) || !hasYear(y)) return null;
  if (x.type < y.type) truncateDate(y, x.type);
  else if (x.type > y.type) truncateDate(x, y.type);

  const dur = createDuration();
  if (x.type <= DateType.GYEARMONTH && !inSeconds) {
    dur.mon = (y.year - x.year) * 12 + (y.mon - x.mon);
    return dur;
  }
  const sec = timeToNumber(y) - timeToNumber(x) + (x.tzo - y.tzo) * 60;
  const carry = Math.floor(sec / SECS_PER_DAY);
  dur.sec = sec - carry * SECS_PER_DAY;
  dur.day = monthStartDays(y) - monthStartDays(x) + y.day - x.day + carry;
  return dur;
}

/**
 * Add a duration to a date value (libexslt `_exsltDateAdd`). A day past
 * the end of the resulting month is clamped first; the type grows to show
 * the fields the addition made significant.
 *
 * @param {object} dt - Date value
 * @param {{mon: number, day: number, sec: number}} dur - Duration
 * @returns {object} The new date value
 */
export function addDuration(dt, dur) {
  const ret = createDate(dt.type);
  let mon = dt.mon + (dur.mon % 12);
  let carry = trunc(dur.mon / 12);
  if (mon < 1) {
    mon += 12;
    carry -= 1;
  } else if (mon > 12) {
    mon -= 12;
    carry += 1;
  }
  ret.mon = mon;
  carry += trunc(dur.day / DAYS_PER_EPOCH) * YEARS_PER_EPOCH;
  ret.year = dt.year + carry;
  ret.tzo = dt.tzo;
  ret.tzFlag = dt.tzFlag;

  const sum = dt.sec + dur.sec;
  ret.sec = sum % 60;
  carry = trunc(sum / 60);
  ret.min = dt.min + (carry % 60);
  carry = trunc(carry / 60);
  if (ret.min >= 60) {
    ret.min -= 60;
    carry += 1;
  }
  ret.hour = dt.hour + (carry % 24);
  carry = trunc(carry / 24);
  if (ret.hour >= 24) {
    ret.hour -= 24;
    carry += 1;
  }

  let day = Math.min(Math.max(dt.day, 1), daysInMonth(ret.year, ret.mon));
  day += (dur.day % DAYS_PER_EPOCH) + carry;
  while (day < 1 || day > daysInMonth(ret.year, ret.mon)) {
    if (day < 1) {
      ret.mon -= 1;
      if (ret.mon < 1) {
        ret.mon = 12;
        ret.year -= 1;
      }
      day += daysInMonth(ret.year, ret.mon);
    } else {
      day -= daysInMonth(ret.year, ret.mon);
      ret.mon += 1;
      if (ret.mon > 12) {
        ret.mon = 1;
        ret.year += 1;
      }
    }
  }
  ret.day = day;

  if (ret.type !== DateType.DATETIME) {
    if (ret.hour || ret.min || ret.sec) ret.type = DateType.DATETIME;
    else if (ret.type !== DateType.DATE) {
      if (ret.day !== 1) ret.type = DateType.DATE;
      else if (ret.type !== DateType.GYEARMONTH && ret.mon !== 1) {
        ret.type = DateType.GYEARMONTH;
      }
    }
  }
  return ret;
}

/**
 * `date:seconds()`: seconds from 1970-01-01T00:00:00Z to a date value (a
 * gYear, gYearMonth, date or dateTime), or the length of a duration without
 * months.
 *
 * @param {object|string} value - A date value, or the text to parse
 * @returns {number} The seconds, NaN when not applicable
 */
export function secondsOf(value) {
  const dt = typeof value === "string" ? parseDate(value) : value;
  if (dt !== null) {
    if (dt.type < DateType.GYEAR) return Number.NaN;
    const epoch = createDate(DateType.DATETIME);
    epoch.year = 1970;
    epoch.tzFlag = true;
    const diff = dateDifference(epoch, dt, true);
    return diff.day * SECS_PER_DAY + diff.sec;
  }
  const dur = parseDuration(value);
  return dur !== null && dur.mon === 0
    ? dur.day * SECS_PER_DAY + dur.sec
    : Number.NaN;
}
