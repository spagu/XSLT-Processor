/**
 * EXSLT dates-and-times module (http://exslt.org/dates-and-times): the
 * functions libexslt `date.c` implements. `format-date()`, `parse-date()`
 * and the `date:date-format` element are not implemented by libexslt either.
 *
 * Invalid input yields the empty string for string results and NaN for
 * numbers (and for `leap-year()`, as in libexslt). Without an argument the
 * functions use the current local date and time, read from the clock.
 */

"use strict";

import { expandedFunctionName } from "../../xpath/evaluator.js";
import { EXSLT_DATES, checkArity, toNodeSet } from "./arguments.js";
import {
  DateType,
  SECS_PER_DAY,
  createDate,
  dayInYear,
  isLeapYear,
} from "./calendar.js";
import { parseDate } from "./dateParse.js";
import {
  addDuration,
  dateDifference,
  dayOfWeek,
  hasYear,
  secondsOf,
  weekInMonth,
  weekInYear,
} from "./dateCalc.js";
import {
  formatByType,
  formatDateOnly,
  formatDateTime,
  formatTimeOnly,
} from "./dateFormat.js";
import {
  addDurations,
  createDuration,
  formatDuration,
  parseDuration,
} from "./duration.js";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const { DATETIME, DATE, TIME, GYEAR, GYEARMONTH, GMONTH, GMONTHDAY, GDAY } =
  DateType;

/**
 * The default clock: now, or `SOURCE_DATE_EPOCH` (seconds, read as UTC)
 * when set, as libexslt does for reproducible builds.
 *
 * @returns {{getTime: () => number, getTimezoneOffset: () => number}} A Date-like instant
 */
export function systemClock() {
  const epoch = Number.parseInt(
    globalThis.process?.env?.SOURCE_DATE_EPOCH ?? "",
    10,
  );
  if (Number.isNaN(epoch)) return new Date();
  return { getTime: () => epoch * 1000, getTimezoneOffset: () => 0 };
}

/**
 * The local date and time of an instant as a dateTime value, with the local
 * offset but no explicit time zone (libexslt `exsltDateCurrent`).
 *
 * @param {{getTime: () => number, getTimezoneOffset: () => number}} now - A Date-like instant
 * @returns {object} The date value
 */
export function currentDate(now) {
  const tzo = -now.getTimezoneOffset();
  const local = new Date(now.getTime() + tzo * 60000);
  const dt = createDate(DATETIME);
  dt.year = local.getUTCFullYear();
  dt.mon = local.getUTCMonth() + 1;
  dt.day = local.getUTCDate();
  dt.hour = local.getUTCHours();
  dt.min = local.getUTCMinutes();
  dt.sec = local.getUTCSeconds();
  dt.tzo = tzo;
  return dt;
}

/**
 * Build the EXSLT dates-and-times functions.
 *
 * @param {import('../../xpath/evaluator.js').XPathEvaluator} evaluator - Evaluates the arguments
 * @param {() => {getTime: () => number, getTimezoneOffset: () => number}} [clock] - Current instant
 * @returns {Object<string, Function>} Functions keyed by expanded name
 */
export function createDatesFunctions(evaluator, clock = systemClock) {
  const string = (arg, ctx) => evaluator.toString(evaluator.evaluate(arg, ctx));
  const key = (local) => expandedFunctionName(EXSLT_DATES, local);
  const functions = {};

  /**
   * Register a function of an optional date argument.
   *
   * @param {string} local - Local name
   * @param {number[]} types - Types accepted from the argument
   * @param {(dt: object) => *} compute - Result from the date value
   * @param {*} invalid - Result for an invalid or unaccepted argument
   */
  const define = (local, types, compute, invalid) => {
    functions[key(local)] = (args, ctx) => {
      checkArity(`date:${local}`, args, 0, 1);
      const dt =
        args.length === 0
          ? currentDate(clock())
          : parseDate(string(args[0], ctx));
      if (dt === null || !types.includes(dt.type)) return invalid;
      return compute(dt) ?? invalid;
    };
  };

  const yearTypes = [DATETIME, DATE, GYEARMONTH, GYEAR];
  const dayTypes = [DATETIME, DATE];
  const timeTypes = [DATETIME, TIME];
  const monthTypes = [DATETIME, DATE, GYEARMONTH, GMONTH, GMONTHDAY];
  const weekday = (dt) =>
    dayOfWeek(dayInYear(dt.day, dt.mon, dt.year), dt.year);

  define("date", dayTypes, formatDateOnly, "");
  define("time", timeTypes, formatTimeOnly, "");
  define(
    "year",
    yearTypes,
    (dt) => (dt.year <= 0 ? dt.year - 1 : dt.year),
    Number.NaN,
  );
  define("leap-year", yearTypes, (dt) => isLeapYear(dt.year), Number.NaN);
  define("month-in-year", monthTypes, (dt) => dt.mon, Number.NaN);
  define("month-name", monthTypes, (dt) => MONTH_NAMES[dt.mon - 1], "");
  define(
    "month-abbreviation",
    monthTypes,
    (dt) => MONTH_NAMES[dt.mon - 1].substring(0, 3),
    "",
  );
  define("week-in-year", dayTypes, weekInYear, Number.NaN);
  define("week-in-month", dayTypes, weekInMonth, Number.NaN);
  define(
    "day-in-year",
    dayTypes,
    (dt) => dayInYear(dt.day, dt.mon, dt.year),
    Number.NaN,
  );
  define(
    "day-in-month",
    [DATETIME, DATE, GMONTHDAY, GDAY],
    (dt) => dt.day,
    Number.NaN,
  );
  define(
    "day-of-week-in-month",
    dayTypes,
    (dt) => Math.trunc((dt.day - 1) / 7) + 1,
    Number.NaN,
  );
  define("day-in-week", dayTypes, (dt) => weekday(dt) + 1, Number.NaN);
  define("day-name", dayTypes, (dt) => DAY_NAMES[weekday(dt)], "");
  define(
    "day-abbreviation",
    dayTypes,
    (dt) => DAY_NAMES[weekday(dt)].substring(0, 3),
    "",
  );
  define("hour-in-day", timeTypes, (dt) => dt.hour, Number.NaN);
  define("minute-in-hour", timeTypes, (dt) => dt.min, Number.NaN);
  define("second-in-minute", timeTypes, (dt) => dt.sec, Number.NaN);

  functions[key("date-time")] = (args) => {
    checkArity("date:date-time", args, 0);
    return formatDateTime(currentDate(clock())) ?? "";
  };

  functions[key("seconds")] = (args, ctx) => {
    checkArity("date:seconds", args, 0, 1);
    return secondsOf(
      args.length === 0 ? currentDate(clock()) : string(args[0], ctx),
    );
  };

  functions[key("duration")] = (args, ctx) => {
    checkArity("date:duration", args, 0, 1);
    const secs =
      args.length === 0
        ? secondsOf(currentDate(clock()))
        : evaluator.toNumber(string(args[0], ctx));
    if (!Number.isFinite(secs)) return "";
    const dur = createDuration();
    dur.day = Math.floor(secs / SECS_PER_DAY);
    dur.sec = secs - dur.day * SECS_PER_DAY;
    return formatDuration(dur);
  };

  functions[key("add")] = (args, ctx) => {
    checkArity("date:add", args, 2);
    const dt = parseDate(string(args[0], ctx));
    const dur = parseDuration(string(args[1], ctx));
    if (dt === null || !hasYear(dt) || dur === null) return "";
    return formatByType(addDuration(dt, dur)) ?? "";
  };

  functions[key("add-duration")] = (args, ctx) => {
    checkArity("date:add-duration", args, 2);
    const x = parseDuration(string(args[0], ctx));
    const y = parseDuration(string(args[1], ctx));
    const sum = x === null || y === null ? null : addDurations(x, y);
    return sum === null ? "" : formatDuration(sum);
  };

  functions[key("difference")] = (args, ctx) => {
    checkArity("date:difference", args, 2);
    const x = parseDate(string(args[0], ctx));
    const y = parseDate(string(args[1], ctx));
    const dur = x === null || y === null ? null : dateDifference(x, y, false);
    return dur === null ? "" : formatDuration(dur);
  };

  functions[key("sum")] = (args, ctx) => {
    checkArity("date:sum", args, 1);
    const nodes = toNodeSet("date:sum", evaluator.evaluate(args[0], ctx));
    if (nodes.length === 0) return "";
    let total = createDuration();
    for (const node of nodes) {
      const dur = parseDuration(evaluator.getStringValue(node));
      total = dur === null ? null : addDurations(total, dur);
      if (total === null) return "";
    }
    return formatDuration(total);
  };

  return functions;
}
