/**
 * fn:format-dateTime, fn:format-date and fn:format-time (F&O 3.1 section
 * 9.8). Output is English with the Gregorian ("AD") or ISO calendar;
 * other languages produce English prefixed with "[Language: en]", other
 * calendars the Gregorian form prefixed with "[Calendar: AD]". A place
 * that is an IANA timezone name adjusts the value (see place.js).
 *
 * @module @tradik/xslt3/functions/format/formatDateTime
 */

import { define, stringItem } from "../support.js";
import {
  componentName,
  componentValue,
  isAvailable,
  presentName,
} from "./dateComponents.js";
import { dateFormatError, parseDatePicture } from "./datePicture.js";
import {
  formatDigits,
  isDigitPattern,
  parseDigitPattern,
} from "./digitPattern.js";
import { formatToken } from "./formatInteger.js";
import { formatFraction } from "./fractionFormat.js";
import { applyPlace } from "./place.js";
import { formatTimezone } from "./timezoneFormat.js";
import { XPathError } from "../../errors.js";

const NAMED = new Set(["n", "N", "Nn"]);
/** Default presentation modifiers other than "1". */
/* calendar and era names keep their case ("AD") by default */
const DEFAULT_TOKENS = { m: "01", s: "01", F: "n", P: "n", C: "Nn", E: "Nn" };
const NUMBER_TOKENS = /^(a|A|i|I|w|W|Ww)$/;
const CALENDARS = new Set(
  (
    "AD AH AME AM AP AS BE CB CE CL CS EE FE ISO JE KE KY ME MS NS OS RS " +
    "SE SH SS TE VE VS"
  ).split(" "),
);

/**
 * Formats a numeric component with a digit pattern and width.
 * @param {number} n - Non-negative
 * @param {import("./datePicture.js").Marker} marker
 * @param {string} token - A decimal digit pattern
 * @returns {string}
 */
function formatNumeric(n, marker, token) {
  const pattern = parseDigitPattern(token);
  let value = BigInt(n);
  if (marker.component === "Y") {
    const width = marker.maxWidth ?? (pattern.digits >= 2 ? pattern.digits : 0);
    if (width) value %= 10n ** BigInt(width);
  }
  const digits = formatDigits(
    value,
    pattern,
    Math.max(pattern.mandatory, marker.minWidth ?? 0),
  );
  return marker.second === "o" ? formatToken(value, token, true) : digits;
}

/**
 * Formats one variable marker.
 * @param {import("./datePicture.js").Marker} marker
 * @param {import("../../xdm/datetime.js").DateTimeValue} value
 * @param {string} calendar
 * @param {string|null} zone - Timezone name from the place argument
 * @returns {string}
 */
function formatMarker(marker, value, calendar, zone) {
  const { component, minWidth, maxWidth } = marker;
  if (component === "Z" || component === "z") {
    return formatTimezone(value.timezone, marker, zone);
  }
  if (component === "f") return formatFraction(value.second, marker);
  const name = componentName(value, component, calendar);
  const fallback = DEFAULT_TOKENS[component] ?? "1";
  let token = marker.first ?? fallback;
  if (NAMED.has(token) && name === null) token = fallback;
  if (NAMED.has(token)) return presentName(name, token, minWidth, maxWidth);
  if ("PCE".includes(component)) {
    return presentName(name, fallback, minWidth, maxWidth);
  }
  const n = componentValue(value, component);
  if (isDigitPattern(token)) return formatNumeric(n, marker, token);
  if (NUMBER_TOKENS.test(token)) {
    // the year is shown modulo 10^max-width (F&O 3.1 section 9.8.4.4)
    const shown = component === "Y" && maxWidth ? n % 10 ** maxWidth : n;
    const text = formatToken(BigInt(shown), token, marker.second === "o");
    return text.padEnd(minWidth ?? 0, " ");
  }
  return fallback === "n"
    ? presentName(name, "n", minWidth, maxWidth)
    : formatNumeric(n, marker, fallback);
}

const EQNAME =
  /^(Q\{[^{}]*\}|[\p{L}_][\p{L}\p{N}._-]*:)[\p{L}_][\p{L}\p{N}._-]*$/u;

/**
 * The calendar used for a calendar argument: AD, ISO or CE are supported;
 * other known designators and calendars in a namespace fall back to AD
 * with a "[Calendar: AD]" prefix.
 * @param {string|null|undefined} calendar
 * @returns {{used: string, prefix: string}}
 * @throws {XPathError} FOFD1340 for an unknown calendar in no namespace
 */
function resolveCalendar(calendar) {
  const name = (calendar?.trim() ?? "").replace(/^Q\{\}/, "");
  if (name === "" || name === "AD" || name === "ISO" || name === "CE") {
    return { used: name || "AD", prefix: "" };
  }
  if (!CALENDARS.has(name) && !EQNAME.test(name)) {
    dateFormatError(`unknown calendar ${calendar}`);
  }
  return { used: "AD", prefix: "[Calendar: AD]" };
}

/**
 * Formats a date/time value with a picture string.
 * @param {string} kind - "dateTime", "date" or "time"
 * @param {import("../../xdm/datetime.js").DateTimeValue} value
 * @param {string} picture
 * @param {{language?: string|null, calendar?: string|null,
 *   place?: string|null}} [options]
 * @returns {string}
 * @throws {XPathError} FOFD1340 for an invalid picture or calendar,
 *   FOFD1350 for a component the value does not have
 */
export function formatDateTime(kind, value, picture, options = {}) {
  try {
    return formatParts(kind, value, picture, options);
  } catch (error) {
    // invalid digit patterns inside markers are picture errors here
    if (error.code !== "FODF1310") throw error;
    return dateFormatError(error.message);
  }
}

/**
 * {@link formatDateTime} without the error code mapping.
 * @param {string} kind
 * @param {import("../../xdm/datetime.js").DateTimeValue} original
 * @param {string} picture
 * @param {object} options
 * @returns {string}
 */
function formatParts(kind, original, picture, options) {
  const { value, zone } = applyPlace(kind, original, options.place);
  const { used, prefix } = resolveCalendar(options.calendar);
  const language = options.language?.trim();
  const fallback =
    language && !/^en(-|$)/i.test(language) ? "[Language: en]" : "";
  const parts = parseDatePicture(picture).map((part) => {
    if (typeof part === "string") return part;
    if (!isAvailable(kind, part.component)) {
      throw new XPathError(
        "FOFD1350",
        `[${part.component}] is not available in an xs:${kind}`,
      );
    }
    return formatMarker(part, value, used, zone);
  });
  return prefix + fallback + parts.join("");
}

/**
 * Declares the 2- and 5-argument forms of one function.
 * @param {string} kind
 * @returns {import("../support.js").FunctionDefinition[]}
 */
function definitions(kind) {
  const local = `format-${kind}`;
  const param = `xs:${kind}?`;
  const impl = ([value, [picture], language, calendar, place]) =>
    value.length === 0
      ? []
      : [
          stringItem(
            formatDateTime(kind, value[0].value, picture.value, {
              language: language?.[0]?.value,
              calendar: calendar?.[0]?.value,
              place: place?.[0]?.value,
            }),
          ),
        ];
  const S_OPT = "xs:string?";
  return [
    define(local, [param, "xs:string"], "xs:string?", impl),
    define(
      local,
      [param, "xs:string", S_OPT, S_OPT, S_OPT],
      "xs:string?",
      impl,
    ),
  ];
}

/** @type {import("../support.js").FunctionDefinition[]} */
export const formatDateTimeFunctions = ["dateTime", "date", "time"].flatMap(
  definitions,
);
