/**
 * Timezone components [Z] and [z] of the format-dateTime family (F&O 3.1
 * section 9.8.4.6): numeric offsets with one to four digits and optional
 * separator, "t" for Z at UTC, military letters ([ZZ]) and a few North
 * American and UTC names ([ZN]).
 *
 * @module @tradik/xslt3/functions/format/timezoneFormat
 */

import { zeroOf } from "./digitPattern.js";

const MILITARY = "YXWVUTSRQPONZABCDEFGHIKLM";
const NAMES = new Map([
  [0, "GMT"],
  [-300, "EST"],
  [-360, "CST"],
  [-420, "MST"],
  [-480, "PST"],
  [-600, "HST"],
]);

/**
 * Formats an offset with a numeric presentation modifier such as "01:01",
 * "0", "0000".
 * @param {number} offset - Minutes
 * @param {string} token
 * @param {boolean} zuluAtZero - The "t" modifier: Z for UTC
 * @returns {string}
 */
function numericOffset(offset, token, zuluAtZero) {
  if (zuluAtZero && offset === 0) return "Z";
  const chars = Array.from(token);
  const digitChars = chars.filter((c) => /\p{Nd}/u.test(c));
  const zero = digitChars.length ? zeroOf(digitChars[0]) : 0x30;
  const separator = chars.find((c) => !/[\p{Nd}#]/u.test(c));
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  const pad = (n, width) => String(n).padStart(width, "0");
  let text;
  if (separator !== undefined) {
    const hourDigits = chars.indexOf(separator);
    text = pad(hours, hourDigits) + separator + pad(minutes, 2);
  } else if (digitChars.length >= 3) {
    text = pad(hours, digitChars.length - 2) + pad(minutes, 2);
  } else {
    text =
      pad(hours, digitChars.length) + (minutes ? `:${pad(minutes, 2)}` : "");
  }
  const digits = text.replace(/[0-9]/g, (d) =>
    String.fromCodePoint(zero + Number(d)),
  );
  return (offset < 0 ? "-" : "+") + digits;
}

/**
 * The numeric format of an offset without presentation modifier: "01:01",
 * or only the hours (minutes when not zero) when a maximum width below
 * five leaves no room for "hh:mm", as XSLT 2.0 erratum E29 has it.
 * @param {import("./datePicture.js").Marker} marker
 * @returns {string}
 */
function defaultToken(marker) {
  if (marker.maxWidth === null || marker.maxWidth >= 5) {
    return "01:01";
  }
  return "0".repeat(Math.min(2, Math.max(1, marker.minWidth ?? 1)));
}

/**
 * Formats a timezone component.
 * @param {number|null} timezone - Minutes, null when absent
 * @param {import("./datePicture.js").Marker} marker - Component Z or z
 * @param {string|null} [zone] - Name of the timezone, from the place
 * @returns {string}
 */
export function formatTimezone(timezone, marker, zone = null) {
  const token = marker.first ?? defaultToken(marker);
  if (timezone === null) return token === "Z" ? "J" : "";
  const gmt = marker.component === "z" ? "GMT" : "";
  if (token === "Z" && timezone % 60 === 0 && Math.abs(timezone) <= 720) {
    return MILITARY[timezone / 60 + 12];
  }
  if (/^(N|n|Nn)$/.test(token) && (zone || NAMES.has(timezone))) {
    return zone ?? NAMES.get(timezone);
  }
  const numeric = /^[\p{Nd}#]/u.test(token) ? token : "01:01";
  const text = gmt + numericOffset(timezone, numeric, marker.second === "t");
  return marker.minWidth === null ? text : text.padEnd(marker.minWidth, " ");
}
