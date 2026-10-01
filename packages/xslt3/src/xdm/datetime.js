/**
 * The date and time types (xs:dateTime, xs:date, xs:time and the five
 * Gregorian "g" types): lexical parsing per XSD 1.1 Part 2, canonical
 * strings per F&O 3.1 19.1.2, and the position on the time line used for
 * comparison and arithmetic.
 *
 * A value is a frozen {@link DateTimeValue} whose absent components are
 * null; `second` is a {@link Decimal}; `timezone` is an offset in minutes
 * or null. Years follow XSD 1.1: year 0000 exists, negative years are
 * astronomical, and more than four digits are allowed up to
 * {@link MAX_YEAR}.
 *
 * @module @tradik/xslt3/xdm/datetime
 */

import { XPathError } from "../errors.js";
import { civilFromDays, daysFromCivil, daysInMonth } from "./calendar.js";
import { Decimal } from "./decimal.js";

/** Largest absolute year supported; beyond it FODT0001 is raised. */
export const MAX_YEAR = 999999999;

/** A date/time value; components that the type does not have are null. */
export class DateTimeValue {
  /**
   * @param {object} fields
   * @param {number|null} [fields.year]
   * @param {number|null} [fields.month]
   * @param {number|null} [fields.day]
   * @param {number|null} [fields.hour]
   * @param {number|null} [fields.minute]
   * @param {Decimal|null} [fields.second]
   * @param {number|null} [fields.timezone] - Offset in minutes
   */
  constructor({ year, month, day, hour, minute, second, timezone }) {
    this.year = year ?? null;
    this.month = month ?? null;
    this.day = day ?? null;
    this.hour = hour ?? null;
    this.minute = minute ?? null;
    this.second = second ?? null;
    this.timezone = timezone ?? null;
    Object.freeze(this);
  }
}

const Y = "(-?(?:[1-9]\\d{3,}|0\\d{3}))";
const T = "(\\d{2}):(\\d{2}):(\\d{2}(?:\\.\\d+)?)";
const Z = "(Z|[+-]\\d{2}:\\d{2})?";
const time = ["hour", "minute", "second"];
/** Lexical pattern and captured component names per primitive type. */
const formats = {
  dateTime: [`${Y}-(\\d{2})-(\\d{2})T${T}`, ["year", "month", "day", ...time]],
  date: [`${Y}-(\\d{2})-(\\d{2})`, ["year", "month", "day"]],
  time: [T, time],
  gYearMonth: [`${Y}-(\\d{2})`, ["year", "month"]],
  gYear: [Y, ["year"]],
  gMonthDay: ["--(\\d{2})-(\\d{2})", ["month", "day"]],
  gDay: ["---(\\d{2})", ["day"]],
  gMonth: ["--(\\d{2})", ["month"]],
};
const patterns = Object.fromEntries(
  Object.entries(formats).map(([kind, [body]]) => [
    kind,
    new RegExp(`^${body}${Z}$`),
  ]),
);

/**
 * Names of the components a date/time type has, in lexical order.
 * @param {string} kind - Primitive local name, e.g. "gYearMonth"
 * @returns {string[]} e.g. ["year", "month"]
 */
export function componentsOf(kind) {
  return formats[kind][1];
}

/**
 * @param {number} year
 * @returns {number} the year
 * @throws {XPathError} FODT0001 when outside ±MAX_YEAR
 */
export function checkYear(year) {
  if (Math.abs(year) > MAX_YEAR) {
    throw new XPathError(
      "FODT0001",
      `Year ${year} is out of the supported range`,
    );
  }
  return year;
}

/**
 * Parses a timezone lexical form.
 * @param {string|undefined} text - "Z", "+hh:mm", "-hh:mm" or undefined
 * @returns {number|null|undefined} minutes, null when absent, undefined when invalid
 */
function parseTimezone(text) {
  if (text === undefined) return null;
  if (text === "Z") return 0;
  const hours = Number(text.slice(1, 3));
  const minutes = Number(text.slice(4));
  if (minutes > 59 || hours > 14 || (hours === 14 && minutes > 0)) {
    return undefined;
  }
  return (text[0] === "-" ? -1 : 1) * (hours * 60 + minutes);
}

/**
 * Whether the parsed components are in range.
 * @param {object} f - Components
 * @returns {boolean}
 */
function isValid(f) {
  if (f.month !== undefined && (f.month < 1 || f.month > 12)) return false;
  if (f.day !== undefined) {
    if (f.day < 1 || f.day > daysInMonth(f.year ?? 2000, f.month ?? 1)) {
      return false;
    }
  }
  if (f.hour === undefined) return true;
  if (f.minute > 59 || f.second.compare(Decimal.of(60n)) >= 0) return false;
  return (
    f.hour < 24 || (f.hour === 24 && f.minute === 0 && f.second.sign() === 0)
  );
}

/**
 * Parses the lexical form of a date/time type (whitespace already collapsed).
 * @param {string} kind - Primitive local name, e.g. "dateTime", "gMonthDay"
 * @param {string} text
 * @returns {DateTimeValue|null} null when the text is not valid
 * @throws {XPathError} FODT0001 when the year is out of range
 */
export function parseDateTime(kind, text) {
  const match = patterns[kind].exec(text);
  if (!match) return null;
  const names = componentsOf(kind);
  const fields = {};
  names.forEach((name, i) => {
    const part = match[i + 1];
    // "|| 0" turns the year "-0000" into 0
    fields[name] = name === "second" ? Decimal.parse(part) : Number(part) || 0;
  });
  if (fields.year !== undefined) checkYear(fields.year);
  fields.timezone = parseTimezone(match[names.length + 1]);
  if (fields.timezone === undefined || !isValid(fields)) return null;
  if (fields.hour === 24) {
    fields.hour = 0;
    if (kind === "dateTime") {
      const [year, month, day] = civilFromDays(
        daysFromCivil(fields.year, fields.month, fields.day) + 1,
      );
      Object.assign(fields, { year: checkYear(year), month, day });
    }
  }
  return new DateTimeValue(fields);
}

const pad2 = (n) => String(n).padStart(2, "0");

/**
 * @param {number|null} timezone - Minutes
 * @returns {string} "", "Z" or "±hh:mm"
 */
export function formatTimezone(timezone) {
  if (timezone === null) return "";
  if (timezone === 0) return "Z";
  const abs = Math.abs(timezone);
  return `${timezone < 0 ? "-" : "+"}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/** Formatters of the components, by component name. */
const componentFormats = {
  year: (v) =>
    (v.year < 0 ? "-" : "") + String(Math.abs(v.year)).padStart(4, "0"),
  month: (v) => pad2(v.month),
  day: (v) => pad2(v.day),
  hour: (v) => pad2(v.hour),
  minute: (v) => pad2(v.minute),
  second: (v) => v.second.toString().replace(/^(\d)(?!\d)/, "0$1"),
};
const separators = {
  dateTime: ["", "-", "-", "T", ":", ":"],
  date: ["", "-", "-"],
  time: ["", ":", ":"],
  gYearMonth: ["", "-"],
  gYear: [""],
  gMonthDay: ["--", "-"],
  gDay: ["---"],
  gMonth: ["--"],
};

/**
 * Canonical string of a date/time value (the local value with its own
 * timezone, F&O 3.1 19.1.2).
 * @param {string} kind - Primitive local name
 * @param {DateTimeValue} value
 * @returns {string}
 */
export function formatDateTime(kind, value) {
  const parts = componentsOf(kind).map(
    (name, i) => separators[kind][i] + componentFormats[name](value),
  );
  return parts.join("") + formatTimezone(value.timezone);
}
