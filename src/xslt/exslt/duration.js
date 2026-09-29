/**
 * xs:duration values of the EXSLT dates-and-times module, ported from
 * libexslt `date.c`: parsing, formatting and addition.
 *
 * A duration is `{mon, day, sec}`: years are folded into months, hours and
 * minutes into seconds, and `0 <= sec < 86400`. A negative duration has
 * negative months/days and borrows one day for a non-zero `sec`.
 */

"use strict";

import { SECS_PER_DAY } from "./calendar.js";

/** Designators in the order they may appear; "T" precedes index 3. */
const DESIGNATORS = "YMDHMS";

/** Index of the first time designator. */
const TIME_PART = 3;

/** Index of the seconds designator, the only one allowing a fraction. */
const SECONDS_PART = 5;

/** Seconds per unit of the time designators, by index. */
const UNIT_SECONDS = [0, 0, 0, 3600, 60, 1];

/**
 * Create a zero duration.
 *
 * @returns {{mon: number, day: number, sec: number}} The duration
 */
export function createDuration() {
  return { mon: 0, day: 0, sec: 0 };
}

/**
 * Read the number before a designator: digits and an optional fraction.
 *
 * @param {string} text - The duration text
 * @param {number} at - Start index
 * @returns {{num: number, fraction: number, hasDigits: boolean, hasFraction: boolean, end: number}} The number
 */
function readNumber(text, at) {
  const [whole, digits, dot, fractionDigits] = /^(\d*)(\.?)(\d*)/.exec(
    text.substring(at),
  );
  let fraction = 0;
  let scale = 1;
  for (const digit of dot ? fractionDigits : "") {
    scale /= 10;
    fraction += Number(digit) * scale;
  }
  return {
    num: Number(digits || "0"),
    fraction,
    hasDigits: digits !== "" || (dot !== "" && fractionDigits !== ""),
    hasFraction: dot !== "",
    end: at + whole.length,
  };
}

/**
 * Parse an xs:duration such as "-P1Y2M3DT4H5M6.5S"
 * (libexslt `exsltDateParseDuration`).
 *
 * @param {string} text - The lexical form
 * @returns {{mon: number, day: number, sec: number}|null} The duration, null when invalid
 */
export function parseDuration(text) {
  const negative = text.startsWith("-");
  let at = negative ? 1 : 0;
  if (text.charAt(at) !== "P" || at + 1 === text.length) return null;
  at++;

  const dur = createDuration();
  let seq = 0;
  let secs = 0;
  let fraction = 0;
  while (at < text.length) {
    if (seq >= DESIGNATORS.length) return null;
    if (text.charAt(at) === "T") {
      if (seq > TIME_PART) return null;
      at++;
      seq = TIME_PART;
    } else if (seq === TIME_PART) {
      return null;
    }

    const number = readNumber(text, at);
    at = number.end;
    while (text.charAt(at) !== DESIGNATORS[seq]) {
      seq++;
      if (seq === TIME_PART || seq === DESIGNATORS.length) return null;
    }
    at++;
    if (!number.hasDigits || (number.hasFraction && seq !== SECONDS_PART)) {
      return null;
    }
    if (!Number.isSafeInteger(number.num)) return null;
    fraction += number.fraction;

    if (seq === 0) dur.mon = number.num * 12;
    else if (seq === 1) dur.mon += number.num;
    else if (seq === 2) dur.day = number.num;
    else {
      const seconds = number.num * UNIT_SECONDS[seq];
      dur.day += Math.floor(seconds / SECS_PER_DAY);
      secs += seconds % SECS_PER_DAY;
    }
    seq++;
  }

  dur.day += Math.floor(secs / SECS_PER_DAY);
  dur.sec = (secs % SECS_PER_DAY) + fraction;
  if (negative) {
    // 0 - x rather than -x: integers in C have no negative zero
    dur.mon = 0 - dur.mon;
    dur.day = 0 - dur.day;
    if (dur.sec !== 0) {
      dur.sec = SECS_PER_DAY - dur.sec;
      dur.day -= 1;
    }
  }
  return dur;
}

/**
 * Decimal digits of a fraction of a second, without trailing zeros
 * (libexslt `exsltFormatNanoseconds`).
 *
 * @param {number} nanoseconds - Nanoseconds, 0-999999999
 * @returns {string} "" for zero, else "." and up to nine digits
 */
export function formatNanoseconds(nanoseconds) {
  if (nanoseconds <= 0) return "";
  return `.${String(nanoseconds).padStart(9, "0").replace(/0+$/, "")}`;
}

/**
 * Format a duration (libexslt `exsltDateFormatDuration`), e.g. "P1Y2MT3S".
 *
 * @param {{mon: number, day: number, sec: number}} dur - The duration
 * @returns {string} The lexical form, "P0D" for a zero duration
 */
export function formatDuration(dur) {
  if (dur.sec === 0 && dur.day === 0 && dur.mon === 0) return "P0D";

  let { sec: secs, day: days, mon: months } = dur;
  let sign = "";
  if (days < 0) {
    if (secs !== 0) {
      secs = SECS_PER_DAY - secs;
      days += 1;
    }
    days = -days;
    sign = "-";
  }
  if (months < 0) {
    months = -months;
    sign = "-";
  }

  let result = `${sign}P`;
  const years = Math.trunc(months / 12);
  months -= years * 12;
  if (years > 0) result += `${years}Y`;
  if (months !== 0) result += `${months}M`;
  if (days !== 0) result += `${days}D`;

  let intSecs = Math.floor(secs);
  let nanoseconds = Math.floor((secs - intSecs) * 1e9 + 0.5);
  if (nanoseconds >= 1e9) {
    nanoseconds -= 1e9;
    intSecs += 1;
  }
  if (intSecs === 0 && nanoseconds === 0) return result;

  result += "T";
  const hours = Math.floor(intSecs / 3600);
  const minutes = Math.floor((intSecs % 3600) / 60);
  intSecs %= 60;
  if (hours > 0) result += `${hours}H`;
  if (minutes > 0) result += `${minutes}M`;
  if (intSecs > 0 || nanoseconds > 0) {
    result += `${intSecs}${formatNanoseconds(nanoseconds)}S`;
  }
  return result;
}

/**
 * Add two durations (libexslt `_exsltDateAddDurCalc`).
 *
 * @param {{mon: number, day: number, sec: number}} x - First duration
 * @param {{mon: number, day: number, sec: number}} y - Second duration
 * @returns {{mon: number, day: number, sec: number}|null} The sum, null when
 *   months and days would have opposite signs (an indeterminate result)
 */
export function addDurations(x, y) {
  const sum = { mon: x.mon + y.mon, day: x.day + y.day, sec: x.sec + y.sec };
  if (sum.sec >= SECS_PER_DAY) {
    sum.sec -= SECS_PER_DAY;
    sum.day += 1;
  }
  if (sum.day >= 0) {
    return (sum.day > 0 || sum.sec > 0) && sum.mon < 0 ? null : sum;
  }
  return sum.mon > 0 ? null : sum;
}
