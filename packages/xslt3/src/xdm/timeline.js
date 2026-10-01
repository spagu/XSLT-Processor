/**
 * Positions of date/time values on the time line, in seconds, for
 * comparison and arithmetic (F&O 3.1 sections 10.4 and 10.8).
 *
 * @module @tradik/xslt3/xdm/timeline
 */

import { civilFromDays, daysFromCivil } from "./calendar.js";
import { checkYear, DateTimeValue } from "./datetime.js";
import { Decimal } from "./decimal.js";

/**
 * Seconds of the local value (ignoring the timezone) since
 * 1970-01-01T00:00:00, with the reference date 1972-01-01 for absent date
 * components (F&O 3.1 section 10.4 uses 1972 as reference year; the
 * reference month and day do not change comparisons within one type).
 * @param {DateTimeValue} value
 * @returns {Decimal}
 */
export function localSeconds(value) {
  const days = daysFromCivil(
    value.year ?? 1972,
    value.month ?? 1,
    value.day ?? 1,
  );
  const whole =
    BigInt(days) * 86400n +
    BigInt((value.hour ?? 0) * 3600 + (value.minute ?? 0) * 60);
  return Decimal.of(whole).add(value.second ?? Decimal.ZERO);
}

/**
 * Position on the time line in seconds (UTC), using the implicit timezone
 * when the value has none.
 * @param {DateTimeValue} value
 * @param {number} implicitTimezone - Minutes
 * @returns {Decimal}
 */
export function timelineSeconds(value, implicitTimezone) {
  const offset = value.timezone ?? implicitTimezone;
  return localSeconds(value).sub(Decimal.of(BigInt(offset * 60)));
}

/**
 * Date and time components of a local-seconds value (inverse of
 * {@link localSeconds} for full date-times).
 * @param {Decimal} seconds
 * @param {number|null} timezone - Kept as the timezone of the result
 * @returns {DateTimeValue}
 * @throws {XPathError} FODT0001 when the year is out of range
 */
export function fromLocalSeconds(seconds, timezone) {
  const wholeSeconds = seconds.floor();
  const days = wholeSeconds / 86400n - (wholeSeconds % 86400n < 0n ? 1n : 0n);
  const inDay = Number(wholeSeconds - days * 86400n);
  const [year, month, day] = civilFromDays(Number(days));
  return new DateTimeValue({
    year: checkYear(year),
    month,
    day,
    hour: Math.floor(inDay / 3600),
    minute: Math.floor(inDay / 60) % 60,
    second: Decimal.of(BigInt(inDay % 60)).add(
      seconds.sub(Decimal.of(wholeSeconds)),
    ),
    timezone,
  });
}
