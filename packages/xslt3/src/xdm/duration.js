/**
 * The duration types (xs:duration, xs:yearMonthDuration,
 * xs:dayTimeDuration): lexical parsing per XSD 1.1 Part 2 and canonical
 * strings per F&O 3.1 19.1.2.
 *
 * A value is a frozen {@link DurationValue} `{ months, seconds }` with an
 * integer number of months and a {@link Decimal} number of seconds of the
 * same sign (XSD 1.1 value space).
 *
 * @module @tradik/xslt3/xdm/duration
 */

import { XPathError } from "../errors.js";
import { Decimal } from "./decimal.js";

/** A duration value. */
export class DurationValue {
  /**
   * @param {number} months - Safe integer
   * @param {Decimal} seconds
   * @throws {XPathError} FODT0002 when the months exceed the safe range
   */
  constructor(months, seconds) {
    if (!Number.isSafeInteger(months)) {
      throw new XPathError(
        "FODT0002",
        "Duration is out of the supported range",
      );
    }
    this.months = months + 0; // no negative zero
    this.seconds = seconds;
    Object.freeze(this);
  }
}

/** The zero duration. */
export const ZERO_DURATION = new DurationValue(0, Decimal.ZERO);

const pattern =
  /^(-)?P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d*)?|\.\d+)S)?)?$/;

/** Components allowed per primitive type (indexes into the pattern groups). */
const allowed = {
  duration: [2, 3, 4, 5, 6, 7],
  yearMonthDuration: [2, 3],
  dayTimeDuration: [4, 5, 6, 7],
};

/**
 * Parses a duration lexical form (whitespace already collapsed).
 * @param {string} kind - "duration", "yearMonthDuration" or "dayTimeDuration"
 * @param {string} text
 * @returns {DurationValue|null} null when invalid
 * @throws {XPathError} FODT0002 when out of the supported range
 */
export function parseDuration(kind, text) {
  const match = pattern.exec(text);
  if (!match || text.endsWith("T")) return null;
  const present = [2, 3, 4, 5, 6, 7].filter((i) => match[i] !== undefined);
  if (present.length === 0 || present.some((i) => !allowed[kind].includes(i))) {
    return null;
  }
  const [
    ,
    sign,
    years = "0",
    months = "0",
    days = "0",
    hours = "0",
    minutes = "0",
  ] = match;
  const totalMonths = BigInt(years) * 12n + BigInt(months);
  const whole =
    (BigInt(days) * 24n + BigInt(hours)) * 60n * 60n + BigInt(minutes) * 60n;
  let seconds = Decimal.of(whole).add(Decimal.parse(match[7] ?? "0"));
  let monthCount = Number(totalMonths);
  if (totalMonths > BigInt(Number.MAX_SAFE_INTEGER)) monthCount = Infinity;
  if (sign) {
    seconds = seconds.neg();
    monthCount = -monthCount;
  }
  return new DurationValue(monthCount, seconds);
}

/**
 * @param {number} months
 * @returns {string} "nYnM" part without sign, "" for zero
 */
function yearMonthPart(months) {
  const abs = Math.abs(months);
  const years = Math.floor(abs / 12);
  return (years ? `${years}Y` : "") + (abs % 12 ? `${abs % 12}M` : "");
}

/**
 * @param {Decimal} seconds
 * @returns {string} "nDTnHnMnS" part without sign, "" for zero
 */
function dayTimePart(seconds) {
  const abs = seconds.sign() < 0 ? seconds.neg() : seconds;
  const whole = abs.trunc();
  const days = whole / 86400n;
  const hours = (whole / 3600n) % 24n;
  const minutes = (whole / 60n) % 60n;
  const secs = abs.sub(Decimal.of(whole - (whole % 60n)));
  const time =
    (hours ? `${hours}H` : "") +
    (minutes ? `${minutes}M` : "") +
    (secs.sign() ? `${secs}S` : "");
  return (days ? `${days}D` : "") + (time ? `T${time}` : "");
}

/**
 * Canonical string of a duration: "P2Y", "P1DT12H", "-PT1.5S"; the zero
 * duration is "P0M" for xs:yearMonthDuration and "PT0S" otherwise.
 * @param {string} kind - "duration", "yearMonthDuration" or "dayTimeDuration"
 * @param {DurationValue} value
 * @returns {string}
 */
export function formatDuration(kind, value) {
  const months = kind === "dayTimeDuration" ? 0 : value.months;
  const seconds = kind === "yearMonthDuration" ? Decimal.ZERO : value.seconds;
  const body = yearMonthPart(months) + dayTimePart(seconds);
  if (body === "") return kind === "yearMonthDuration" ? "P0M" : "PT0S";
  return `${months < 0 || seconds.sign() < 0 ? "-" : ""}P${body}`;
}
