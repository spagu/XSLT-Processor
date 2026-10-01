/**
 * Strings between JSON and XDM (F&O 3.1 section 17.5): the `escape` and
 * `fallback` options of fn:parse-json and fn:json-to-xml, and the escaping
 * of strings written by fn:xml-to-json.
 *
 * @module @tradik/xslt3/functions/json/jsonStrings
 */

import { isXmlChar, stringItem } from "../support.js";

const SHORT_ESCAPES = new Map([
  [0x08, "\\b"],
  [0x09, "\\t"],
  [0x0a, "\\n"],
  [0x0c, "\\f"],
  [0x0d, "\\r"],
  [0x22, '\\"'],
  [0x5c, "\\\\"],
  [0x2f, "\\/"],
]);

/**
 * The escape sequence of a character: a two-character one where JSON has
 * it, else \uXXXX (upper-case hex, a surrogate pair beyond the BMP).
 * @param {number} cp
 * @returns {string}
 */
export function escapeChar(cp) {
  const short = SHORT_ESCAPES.get(cp);
  if (short) return short;
  const hex = (unit) =>
    `\\u${unit.toString(16).toUpperCase().padStart(4, "0")}`;
  if (cp < 0x10000) return hex(cp);
  const offset = cp - 0x10000;
  return hex(0xd800 + (offset >> 10)) + hex(0xdc00 + (offset & 0x3ff));
}

/**
 * Whether a character is "special" for the escape option: a control
 * character (x00-x1F, x7F-x9F), a codepoint that is not an XML character
 * (lone surrogates included) or the backslash.
 * @param {number} cp
 * @returns {boolean}
 */
export const isSpecial = (cp) =>
  cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f) || cp === 0x5c || !isXmlChar(cp);

/**
 * The function that turns parsed JSON characters into a string under the
 * escape and fallback options.
 * @param {{escape: boolean, fallback?: import("../../items/function.js").FunctionItem}} options
 * @returns {(chars: import("./jsonChars.js").JsonChar[]) => string}
 */
export function stringDecoder({ escape, fallback }) {
  const replace = fallback
    ? (sequence) => fallback.invoke([[stringItem(sequence)]])[0].value
    : () => "\uFFFD";
  return (chars) => {
    let result = "";
    for (const { cp, escape: written } of chars) {
      if (escape) {
        result += isSpecial(cp) ? escapeChar(cp) : String.fromCodePoint(cp);
      } else if (isXmlChar(cp)) {
        result += String.fromCodePoint(cp);
      } else {
        result += replace(written ?? escapeChar(cp));
      }
    }
    return result;
  };
}

/**
 * Escapes a string for JSON output (fn:xml-to-json): quotes, backslashes,
 * solidus and control characters (x00-x1F, x7F-x9F).
 * @param {string} text
 * @returns {string}
 */
export function escapeJsonString(text) {
  let result = "";
  for (const char of text) {
    const cp = char.codePointAt(0);
    result += needsEscape(cp) ? escapeChar(cp) : char;
  }
  return result;
}

/**
 * @param {number} cp
 * @returns {boolean} whether xml-to-json writes the character escaped
 */
export const needsEscape = (cp) =>
  cp <= 0x1f ||
  (cp >= 0x7f && cp <= 0x9f) ||
  cp === 0x22 ||
  cp === 0x5c ||
  cp === 0x2f;
