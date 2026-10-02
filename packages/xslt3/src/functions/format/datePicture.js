/**
 * Picture strings of format-dateTime, format-date and format-time (F&O
 * 3.1 sections 9.8.4.1 and 9.8.4.2): literal text, variable markers with
 * their component, presentation modifiers and width modifier.
 *
 * @module @tradik/xslt3/functions/format/datePicture
 */

import { XPathError } from "../../errors.js";

/**
 * @typedef {object} Marker
 * @property {string} component - One of YMDdFWwHhPmsfZzCE
 * @property {string|null} first - First presentation modifier, null for
 *   the component's default
 * @property {string|null} second - "a", "t", "c" or "o"
 * @property {number|null} minWidth - null when absent or "*"
 * @property {number|null} maxWidth - null when absent or "*"
 */

/**
 * @param {string} message
 * @returns {never}
 * @throws {XPathError} FOFD1340
 */
export function dateFormatError(message) {
  throw new XPathError("FOFD1340", `Invalid date/time picture: ${message}`);
}

const COMPONENTS = "YMDdFWwHhPmsfZzCE";
const widthPattern = /^(\*|\d+)(?:-(\*|\d+))?$/;

/**
 * Parses the width modifier ("min" or "min-max", "*" for no limit).
 * @param {string} text
 * @returns {{minWidth: number|null, maxWidth: number|null}}
 */
function parseWidth(text) {
  const match = widthPattern.exec(text);
  if (!match) dateFormatError(`width modifier ,${text}`);
  const [, min, max = "*"] = match;
  const minWidth = min === "*" ? null : Number(min);
  const maxWidth = max === "*" ? null : Number(max);
  if (
    minWidth === 0 ||
    maxWidth === 0 ||
    (maxWidth !== null && maxWidth < (minWidth ?? 0))
  ) {
    dateFormatError(`width modifier ,${text}`);
  }
  return { minWidth, maxWidth };
}

/**
 * Parses the inside of a variable marker.
 * @param {string} text - Between the brackets
 * @returns {Marker}
 */
export function parseMarker(text) {
  const marker = text.replace(/[ \t\n\r]+/g, "");
  const component = marker[0];
  if (component === undefined || !COMPONENTS.includes(component)) {
    dateFormatError(`unknown component in [${text}]`);
  }
  const comma = marker.lastIndexOf(",");
  const modifiers = comma < 0 ? marker.slice(1) : marker.slice(1, comma);
  const width =
    comma < 0
      ? { minWidth: null, maxWidth: null }
      : parseWidth(marker.slice(comma + 1));
  const chars = Array.from(modifiers);
  const hasSecond = chars.length > 1 && "atco".includes(chars.at(-1));
  return {
    component,
    first:
      modifiers === ""
        ? null
        : hasSecond
          ? chars.slice(0, -1).join("")
          : modifiers,
    second: hasSecond ? chars.at(-1) : null,
    ...width,
  };
}

/**
 * Splits a picture into literal strings and markers.
 * @param {string} picture
 * @returns {Array<string|Marker>}
 * @throws {XPathError} FOFD1340 for unbalanced brackets or invalid markers
 */
export function parseDatePicture(picture) {
  const parts = [];
  let literal = "";
  for (let i = 0; i < picture.length; i++) {
    const c = picture[i];
    if ((c === "[" || c === "]") && picture[i + 1] === c) {
      literal += c;
      i++;
    } else if (c === "[") {
      const end = picture.indexOf("]", i);
      if (end < 0) dateFormatError("unterminated [");
      if (literal) parts.push(literal);
      literal = "";
      parts.push(parseMarker(picture.slice(i + 1, end)));
      i = end;
    } else if (c === "]") {
      dateFormatError("unescaped ]");
    } else {
      literal += c;
    }
  }
  if (literal) parts.push(literal);
  return parts;
}
