/**
 * Values and English names of the date/time components used by the
 * format-dateTime family (F&O 3.1 section 9.8.4.1): day of year, ISO day
 * of week and week numbers, 12-hour clock, names of months, days, am/pm
 * and eras.
 *
 * @module @tradik/xslt3/functions/format/dateComponents
 */

import { civilFromDays, daysFromCivil } from "../../xdm/calendar.js";

const MONTHS = (
  "January February March April May June July August September October " +
  "November December"
).split(" ");
const DAYS = "Monday Tuesday Wednesday Thursday Friday Saturday Sunday".split(
  " ",
);

/**
 * Conventional English abbreviations longer than three letters, by name;
 * every name of more than three letters also abbreviates to its first
 * three.
 */
const ABBREVIATIONS = {
  Tuesday: ["Tues"],
  Wednesday: ["Weds"],
  Thursday: ["Thur", "Thurs"],
  September: ["Sept"],
};

/**
 * The longest abbreviation of a name that fits a maximum width, else the
 * name truncated to it.
 * @param {string} name - Capitalized English name
 * @param {number} maxWidth
 * @returns {string}
 */
function abbreviate(name, maxWidth) {
  const chars = Array.from(name);
  if (chars.length <= maxWidth) return name;
  const candidates = [name.slice(0, 3), ...(ABBREVIATIONS[name] ?? [])];
  const fitting = candidates.filter(
    (c) => c.length <= maxWidth && c.length < chars.length,
  );
  return fitting.length
    ? fitting[fitting.length - 1]
    : chars.slice(0, maxWidth).join("");
}

/** Components available per value kind. */
const AVAILABLE = {
  dateTime: "YMDdFWwHhPmsfZzCE",
  date: "YMDdFWwZzCE",
  time: "HhPmsfZzC",
};

/**
 * @param {string} kind - "dateTime", "date" or "time"
 * @param {string} component
 * @returns {boolean} whether the component exists in values of the kind
 */
export const isAvailable = (kind, component) =>
  AVAILABLE[kind].includes(component);

/**
 * ISO day of the week, 1 (Monday) to 7 (Sunday), of a day number.
 * @param {number} days - Days since 1970-01-01 (a Thursday)
 * @returns {number}
 */
const isoDayOfWeek = (days) => ((((days + 3) % 7) + 7) % 7) + 1;

/**
 * Week numbers of a date: ISO week in year, and week in month where a
 * Monday-to-Sunday week belongs to the month of its Thursday, except that
 * the last days of a month whose Thursday is in the next month continue
 * the count of their own month (as Saxon and the W3C tests do).
 * @param {import("../../xdm/datetime.js").DateTimeValue} value
 * @returns {{week: number, weekInMonth: number}}
 */
function weeks(value) {
  const days = daysFromCivil(value.year, value.month, value.day);
  const thursday = days - isoDayOfWeek(days) + 4;
  const [year, , day] = civilFromDays(thursday);
  const dayOfYear = thursday - daysFromCivil(year, 1, 1);
  const monthStart = daysFromCivil(value.year, value.month, 1);
  const dayInMonth = thursday >= monthStart ? thursday - monthStart + 1 : day;
  return {
    week: Math.floor(dayOfYear / 7) + 1,
    weekInMonth: Math.floor((dayInMonth - 1) / 7) + 1,
  };
}

/**
 * The numeric value of a component (Y is the absolute year; s the whole
 * seconds).
 * @param {import("../../xdm/datetime.js").DateTimeValue} value
 * @param {string} component - One of YMDdFWwHhms
 * @returns {number}
 */
export function componentValue(value, component) {
  switch (component) {
    case "Y":
      return Math.abs(value.year);
    case "M":
      return value.month;
    case "D":
      return value.day;
    case "d":
      return (
        daysFromCivil(value.year, value.month, value.day) -
        daysFromCivil(value.year, 1, 1) +
        1
      );
    case "F":
      return isoDayOfWeek(daysFromCivil(value.year, value.month, value.day));
    case "W":
      return weeks(value).week;
    case "w":
      return weeks(value).weekInMonth;
    case "H":
      return value.hour;
    case "h":
      return value.hour % 12 || 12;
    case "m":
      return value.minute;
    default:
      return Number(value.second.trunc());
  }
}

/**
 * The English name of a component, or null when it has none.
 * @param {import("../../xdm/datetime.js").DateTimeValue} value
 * @param {string} component
 * @param {string} calendar - Calendar used, e.g. "AD"
 * @returns {string|null}
 */
export function componentName(value, component, calendar) {
  switch (component) {
    case "M":
      return MONTHS[value.month - 1];
    case "F":
      return DAYS[componentValue(value, "F") - 1];
    case "P":
      return value.hour < 12 ? "am" : "pm";
    case "C":
      return calendar;
    case "E":
      if (calendar === "ISO") return value.year < 0 ? "-" : "";
      return value.year > 0 ? "AD" : "BC";
    default:
      return null;
  }
}

/**
 * Applies a name presentation modifier and the width modifier to a name.
 * @param {string} name
 * @param {string} token - "n", "N" or "Nn"
 * @param {number|null} minWidth
 * @param {number|null} maxWidth
 * @returns {string}
 */
export function presentName(name, token, minWidth, maxWidth) {
  const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
  const short =
    maxWidth === null ? capitalized : abbreviate(capitalized, maxWidth);
  const text =
    token === "N"
      ? short.toUpperCase()
      : token === "n"
        ? short.toLowerCase()
        : short;
  return minWidth === null ? text : text.padEnd(minWidth, " ");
}
