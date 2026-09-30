/**
 * Calendar primitives of the EXSLT dates-and-times module, ported from
 * libexslt `date.c`: date types, leap years, month lengths and validity.
 *
 * A date value is `{type, year, mon, day, hour, min, sec, tzFlag, tzo}`:
 * years are continuous (year 0 is 1 BCE), `tzo` is the offset in minutes and
 * `tzFlag` is set only by an explicit "Z" (as in libexslt).
 */

"use strict";

/** Date types, bit sets of the fields they carry (libexslt `exsltDateType`). */
export const DateType = Object.freeze({
  TIME: 1,
  GDAY: 2,
  GMONTH: 4,
  GMONTHDAY: 6,
  GYEAR: 8,
  GYEARMONTH: 12,
  DATE: 14,
  DATETIME: 15,
});

/** Seconds in a day. */
export const SECS_PER_DAY = 86400;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Non-negative remainder, the result of C `&` masks on two's complement.
 *
 * @param {number} value - An integer
 * @param {number} divisor - A power of two
 * @returns {number} `value mod divisor` in `0..divisor-1`
 */
function mask(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

/**
 * Whether a (continuous) year is a leap year, as libexslt `IS_LEAP`.
 *
 * @param {number} year - The year
 * @returns {boolean} True for a leap year
 */
export function isLeapYear(year) {
  return mask(year, 4) === 0 && (year % 25 !== 0 || mask(year, 16) === 0);
}

/**
 * Number of days of a month.
 *
 * @param {number} year - The year
 * @param {number} mon - The month, 1-12
 * @returns {number} Days in the month
 */
export function daysInMonth(year, mon) {
  return mon === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[mon - 1];
}

/**
 * Day of the year of a date, 1-366 (libexslt `DAY_IN_YEAR`).
 *
 * @param {number} day - Day of the month
 * @param {number} mon - Month, 1-12
 * @param {number} year - Year
 * @returns {number} The day in the year
 */
export function dayInYear(day, mon, year) {
  let days = day;
  for (let m = 1; m < mon; m++) days += daysInMonth(year, m);
  return days;
}

/**
 * Whether a date value has a valid time part (libexslt `VALID_TIME`).
 *
 * @param {object} dt - Date value
 * @returns {boolean} True when valid
 */
export function isValidTime(dt) {
  return (
    dt.hour <= 23 &&
    dt.min <= 59 &&
    dt.sec >= 0 &&
    dt.sec < 60 &&
    dt.tzo > -1440 &&
    dt.tzo < 1440
  );
}

/**
 * Whether a date value has a valid date part (libexslt `VALID_DATE`).
 *
 * @param {object} dt - Date value
 * @returns {boolean} True when valid
 */
export function isValidDate(dt) {
  return dt.mon >= 1 && dt.mon <= 12 && dt.day <= daysInMonth(dt.year, dt.mon);
}

/**
 * Create a date value with libexslt defaults (January 1st, midnight).
 *
 * @param {number} type - A {@link DateType}, 0 when unknown yet
 * @returns {object} The date value
 */
export function createDate(type) {
  return {
    type,
    year: 0,
    mon: 1,
    day: 1,
    hour: 0,
    min: 0,
    sec: 0,
    tzFlag: false,
    tzo: 0,
  };
}
