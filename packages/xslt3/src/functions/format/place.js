/**
 * The $place argument of the format-dateTime family (F&O 3.1 section
 * 9.8.4.8) given as an IANA timezone name: the value is adjusted to the
 * offset of that timezone at that instant (daylight saving included), and
 * the timezone gets its conventional abbreviation for [ZN]. Uses the
 * timezone database of `Intl.DateTimeFormat`. Country codes are ignored.
 *
 * @module @tradik/xslt3/functions/format/place
 */

import { AtomicValue } from "../../xdm/atomic.js";
import { types } from "../../xdm/types.js";
import { adjustToTimezone } from "../datetime.js";

/**
 * The name of the timezone of an instant in a locale's style.
 * @param {string} timeZone
 * @param {number} instant - Milliseconds since the epoch
 * @param {string} locale
 * @param {string} style - "longOffset" or "short"
 * @returns {string}
 */
function zoneName(timeZone, instant, locale, style) {
  return new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: style })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName").value;
}

/**
 * Adjusts a date or dateTime with a timezone to the timezone of a place.
 * @param {string} kind - "dateTime", "date" or "time"
 * @param {import("../../xdm/datetime.js").DateTimeValue} value
 * @param {string|null|undefined} place
 * @returns {{value: import("../../xdm/datetime.js").DateTimeValue,
 *   zone: string|null}} the value to format and the timezone abbreviation
 *   (null when the place is not a known IANA name or does not apply)
 */
export function applyPlace(kind, value, place) {
  const timeZone = place?.trim() ?? "";
  if (!timeZone.includes("/") || kind === "time" || value.timezone === null) {
    return { value, zone: null };
  }
  const instant =
    Date.UTC(
      value.year,
      value.month - 1,
      value.day,
      value.hour ?? 0,
      value.minute ?? 0,
    ) -
    value.timezone * 60000;
  let offsetName;
  let zone;
  try {
    offsetName = zoneName(timeZone, instant, "en-US", "longOffset");
    // American names (EST) first, then British ones (CET, BST)
    zone = ["en-US", "en-GB"]
      .map((locale) => zoneName(timeZone, instant, locale, "short"))
      .find((name) => !/^GMT[+-]/.test(name));
  } catch {
    return { value, zone: null };
  }
  const [, sign, hours, minutes] = /^GMT(?:([+-])(\d\d):(\d\d))?$/.exec(
    offsetName,
  );
  const offset = sign
    ? (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes))
    : 0;
  const adjusted = adjustToTimezone(
    new AtomicValue(types[kind], value),
    offset,
  );
  return { value: adjusted.value, zone: zone ?? null };
}
