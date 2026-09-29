/**
 * Formatting of date values for the EXSLT dates-and-times module, ported
 * from libexslt `date.c` (`exsltDateFormat*`).
 *
 * Quirks kept from libexslt: an xs:dateTime always ends with a time zone
 * ("Z" for a zero offset), while the other types show one only for an
 * explicit "Z" or a non-zero offset.
 */

"use strict";

import { DateType, isValidDate, isValidTime } from "./calendar.js";
import { formatNanoseconds } from "./duration.js";

/**
 * Two-digit form of a number.
 *
 * @param {number} num - 0-99
 * @returns {string} The digits
 */
function twoDigits(num) {
  return String(num).padStart(2, "0");
}

/**
 * Format a continuous year: at least four digits, "-" before BCE years.
 *
 * @param {number} year - The year (0 is 1 BCE)
 * @returns {string} The year
 */
export function formatYear(year) {
  const sign = year <= 0 ? "-" : "";
  return sign + String(year <= 0 ? 1 - year : year).padStart(4, "0");
}

/**
 * Format a time zone offset.
 *
 * @param {number} tzo - Offset in minutes
 * @returns {string} "Z" or "±hh:mm"
 */
export function formatTimeZone(tzo) {
  if (tzo === 0) return "Z";
  const offset = Math.abs(tzo);
  const sign = tzo < 0 ? "-" : "+";
  return `${sign}${twoDigits(Math.floor(offset / 60))}:${twoDigits(offset % 60)}`;
}

/**
 * Format "hh:mm:ss" with the fraction of a second, rounded to nanoseconds
 * without carrying into the minute.
 *
 * @param {object} dt - Date value
 * @returns {string} The time
 */
function formatClock(dt) {
  const intSecs = Math.floor(dt.sec);
  const nanoseconds = Math.min(
    Math.floor((dt.sec - intSecs) * 1e9 + 0.5),
    999999999,
  );
  return `${twoDigits(dt.hour)}:${twoDigits(dt.min)}:${twoDigits(intSecs)}${formatNanoseconds(nanoseconds)}`;
}

/**
 * The time zone suffix of the types other than xs:dateTime.
 *
 * @param {object} dt - Date value
 * @returns {string} The suffix, possibly empty
 */
function optionalTimeZone(dt) {
  return dt.tzFlag || dt.tzo !== 0 ? formatTimeZone(dt.tzo) : "";
}

/**
 * "CCYY-MM-DD" of a date value.
 *
 * @param {object} dt - Date value
 * @returns {string} The date
 */
function formatYearMonthDay(dt) {
  return `${formatYear(dt.year)}-${twoDigits(dt.mon)}-${twoDigits(dt.day)}`;
}

/**
 * Whether both the date and time parts of a value are valid.
 *
 * @param {object} dt - Date value
 * @returns {boolean} True when valid
 */
function isValidDateTime(dt) {
  return isValidDate(dt) && isValidTime(dt);
}

/**
 * Format as xs:dateTime, always with a time zone.
 *
 * @param {object} dt - Date value
 * @returns {string|null} The dateTime, null when invalid
 */
export function formatDateTime(dt) {
  if (!isValidDateTime(dt)) return null;
  return `${formatYearMonthDay(dt)}T${formatClock(dt)}${formatTimeZone(dt.tzo)}`;
}

/**
 * Format as xs:date.
 *
 * @param {object} dt - Date value
 * @returns {string|null} The date, null when invalid
 */
export function formatDateOnly(dt) {
  if (!isValidDateTime(dt)) return null;
  return formatYearMonthDay(dt) + optionalTimeZone(dt);
}

/**
 * Format as xs:time.
 *
 * @param {object} dt - Date value
 * @returns {string|null} The time, null when invalid
 */
export function formatTimeOnly(dt) {
  if (!isValidTime(dt)) return null;
  return formatClock(dt) + optionalTimeZone(dt);
}

/**
 * Format a value in the lexical form of its own type
 * (xs:dateTime, xs:date, xs:time, xs:gYearMonth or xs:gYear).
 *
 * @param {object} dt - Date value
 * @returns {string|null} The lexical form, null for other types
 */
export function formatByType(dt) {
  switch (dt.type) {
    case DateType.DATETIME:
      return formatDateTime(dt);
    case DateType.DATE:
      return formatDateOnly(dt);
    case DateType.TIME:
      return formatTimeOnly(dt);
    case DateType.GYEAR:
      return formatYear(dt.year) + optionalTimeZone(dt);
    case DateType.GYEARMONTH:
      return `${formatYear(dt.year)}-${twoDigits(dt.mon)}${optionalTimeZone(dt)}`;
    default:
      return null;
  }
}
