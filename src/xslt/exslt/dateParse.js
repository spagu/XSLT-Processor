/**
 * Parsing of the XML Schema date/time lexical forms used by the EXSLT
 * dates-and-times module, ported from libexslt `date.c` (`exsltDateParse`).
 * Date values are described in `./calendar.js`.
 */

"use strict";

import { DateType, createDate, isValidDate, isValidTime } from "./calendar.js";

/** Largest integer the parsers accept, the analogue of C `LONG_MAX`. */
const MAX_NUMBER = Number.MAX_SAFE_INTEGER;

/**
 * A cursor over the text being parsed, mirroring libexslt's `cur` pointer.
 */
class Cursor {
  /** @param {string} text - The text */
  constructor(text) {
    this.text = text;
    this.at = 0;
  }

  /** @returns {string} The current character, "" at the end */
  get char() {
    return this.text.charAt(this.at);
  }

  /** @returns {boolean} Whether the current character is a digit */
  get isDigit() {
    const char = this.char;
    return char >= "0" && char <= "9";
  }

  /**
   * Read two digits (libexslt `PARSE_2_DIGITS`), advancing past them.
   *
   * @param {(value: number) => boolean} valid - Range check
   * @returns {number|null} The value, null when invalid
   */
  twoDigits(valid) {
    const digits = this.text.substring(this.at, this.at + 2);
    this.at += 2;
    if (!/^\d\d$/.test(digits)) return null;
    const value = Number(digits);
    return valid(value) ? value : null;
  }
}

const inRange = (min, max) => (value) => value >= min && value <= max;

/**
 * Parse a time zone ("", "Z" or "±hh:mm"); updates `dt` and the cursor only
 * as far as libexslt does.
 *
 * @param {object} dt - Date value
 * @param {Cursor} cur - Cursor at the time zone
 * @returns {boolean} True when a time zone was parsed
 */
function parseTimeZone(dt, cur) {
  const sign = cur.char;
  if (sign === "") {
    dt.tzFlag = false;
    dt.tzo = 0;
    return true;
  }
  if (sign === "Z") {
    dt.tzFlag = true;
    dt.tzo = 0;
    cur.at++;
    return true;
  }
  if (sign !== "+" && sign !== "-") return false;

  const probe = new Cursor(cur.text);
  probe.at = cur.at + 1;
  const hours = probe.twoDigits(inRange(0, 23));
  if (hours === null || probe.char !== ":") return false;
  probe.at++;
  dt.tzo = hours * 60;
  const minutes = probe.twoDigits(inRange(0, 59));
  if (minutes === null) return false;
  dt.tzo = (dt.tzo + minutes) * (sign === "-" ? -1 : 1);
  cur.at = probe.at;
  return true;
}

/**
 * Parse "hh:mm:ss(.s+)?" into `dt` (libexslt `_exsltDateParseTime`).
 *
 * @param {object} dt - Date value
 * @param {Cursor} cur - Cursor at the time
 * @returns {boolean} True when a valid time was parsed
 */
function parseTime(dt, cur) {
  const hour = cur.twoDigits(inRange(0, 23));
  if (hour === null || cur.char !== ":") return false;
  cur.at++;
  dt.hour = hour;
  const min = cur.twoDigits(inRange(0, 59));
  if (min === null) return false;
  dt.min = min;
  if (cur.char !== ":") return false;
  cur.at++;

  const seconds = cur.twoDigits(() => true);
  if (seconds === null) return false;
  let sec = seconds;
  if (cur.char === ".") {
    cur.at++;
    if (!cur.isDigit) return false;
    let scale = 1;
    while (cur.isDigit) {
      scale /= 10;
      sec += Number(cur.char) * scale;
      cur.at++;
    }
  }
  dt.sec = sec;
  return isValidTime(dt);
}

/**
 * Parse a year of at least four digits (libexslt `_exsltDateParseGYear`).
 *
 * @param {object} dt - Date value
 * @param {Cursor} cur - Cursor at the year
 * @returns {boolean} True when a valid year was parsed
 */
function parseYear(dt, cur) {
  const match = /^(-?)(\d+)/.exec(cur.text.substring(cur.at));
  if (!match) return false;
  const digits = match[2];
  // At least four digits, and no leading zero beyond four
  const badLength =
    digits.length < 4 || (digits.length > 4 && digits[0] === "0");
  if (badLength) return false;
  const year = Number(digits);
  if (year === 0 || year >= MAX_NUMBER / 10) return false;
  dt.year = match[1] ? 1 - year : year;
  cur.at += match[0].length;
  return true;
}

/** Outcomes of {@link typedByTimeZone}. */
const Ending = Object.freeze({
  TYPED: "typed",
  NONE: "none",
  INVALID: "invalid",
});

/**
 * Parse a time zone that must end the text (libexslt `RETURN_TYPE_IF_VALID`).
 *
 * @param {object} dt - Date value, typed on success
 * @param {Cursor} cur - Cursor after the date fields
 * @param {number} type - Type of the value on success
 * @returns {string} TYPED when the rest is a time zone, INVALID when a time
 *   zone is followed by more text, NONE when parsing may go on
 */
function typedByTimeZone(dt, cur, type) {
  if (!["", "Z", "+", "-"].includes(cur.char)) return Ending.NONE;
  if (!parseTimeZone(dt, cur)) return Ending.NONE;
  if (cur.at !== cur.text.length) return Ending.INVALID;
  dt.type = type;
  return Ending.TYPED;
}

/**
 * Finish a form that must end with a time zone.
 *
 * @param {object} dt - Date value
 * @param {Cursor} cur - Cursor after the date fields
 * @param {number} type - Type of the value on success
 * @returns {object|null} The typed value, null when invalid
 */
function endWithTimeZone(dt, cur, type) {
  return typedByTimeZone(dt, cur, type) === Ending.TYPED ? dt : null;
}

/**
 * Parse "--MM-DD", "--MM--" or "---DD", each followed by a time zone.
 *
 * @param {object} dt - Date value
 * @param {Cursor} cur - Cursor after the leading "--"
 * @returns {object|null} The date value, null when invalid
 */
function parseTruncatedDate(dt, cur) {
  if (cur.char === "-") {
    cur.at++;
    dt.day = cur.twoDigits(inRange(1, 31));
    return dt.day === null ? null : endWithTimeZone(dt, cur, DateType.GDAY);
  }
  dt.mon = cur.twoDigits(inRange(1, 12));
  if (dt.mon === null || cur.char !== "-") return null;
  cur.at++;
  if (cur.char === "-") {
    cur.at++;
    return endWithTimeZone(dt, cur, DateType.GMONTH);
  }
  dt.day = cur.twoDigits(inRange(1, 31));
  return dt.day === null ? null : endWithTimeZone(dt, cur, DateType.GMONTHDAY);
}

/**
 * Fields after the year, each preceded by "-": the type a time zone after
 * the previous field gives, and the parser of the field.
 */
const DATE_FIELDS = [
  [
    DateType.GYEAR,
    (dt, cur) => {
      dt.mon = cur.twoDigits(inRange(1, 12));
      return dt.mon !== null;
    },
  ],
  [
    DateType.GYEARMONTH,
    (dt, cur) => {
      dt.day = cur.twoDigits(inRange(1, 31));
      return dt.day !== null && isValidDate(dt);
    },
  ],
];

/**
 * Parse any date/time form libexslt accepts (`exsltDateParse`): xs:dateTime,
 * xs:date, xs:time, xs:gYearMonth, xs:gYear, xs:gMonthDay, xs:gMonth
 * ("--MM--") and xs:gDay.
 *
 * @param {string} text - The lexical form
 * @returns {object|null} The date value, null when invalid
 */
export function parseDate(text) {
  const dt = createDate(0);
  const cur = new Cursor(text);

  if (text.startsWith("--")) {
    cur.at = 2;
    return parseTruncatedDate(dt, cur);
  }

  if (cur.isDigit && parseTime(dt, cur)) {
    const ending = typedByTimeZone(dt, cur, DateType.TIME);
    if (ending !== Ending.NONE) return ending === Ending.TYPED ? dt : null;
  }

  cur.at = 0;
  if (!parseYear(dt, cur)) return null;
  for (const [type, parseField] of DATE_FIELDS) {
    const ending = typedByTimeZone(dt, cur, type);
    if (ending !== Ending.NONE) return ending === Ending.TYPED ? dt : null;
    if (cur.char !== "-") return null;
    cur.at++;
    if (!parseField(dt, cur)) return null;
  }
  const ending = typedByTimeZone(dt, cur, DateType.DATE);
  if (ending !== Ending.NONE) return ending === Ending.TYPED ? dt : null;
  if (cur.char !== "T") return null;
  cur.at++;
  if (!parseTime(dt, cur) || !parseTimeZone(dt, cur)) return null;
  if (cur.at !== text.length || !isValidTime(dt)) return null;
  dt.type = DateType.DATETIME;
  return dt;
}
