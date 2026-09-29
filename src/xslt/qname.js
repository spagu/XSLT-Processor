/**
 * XML names (XML 1.0 fifth edition, section 2.3) and qualified names
 * (Namespaces in XML 1.0, section 4).
 *
 * Used to validate names computed at run time by `xsl:element` and
 * `xsl:attribute` (XSLT 1.0 sections 7.1.2 and 7.1.3) before they reach the
 * DOM, so an invalid name is reported instead of producing malformed output.
 *
 * @module xslt/qname
 */

"use strict";

/** NameStartChar code point ranges, without ":" (production [4]). */
const NAME_START_RANGES = [
  [0x41, 0x5a], // A-Z
  [0x5f, 0x5f], // _
  [0x61, 0x7a], // a-z
  [0xc0, 0xd6],
  [0xd8, 0xf6],
  [0xf8, 0x2ff],
  [0x370, 0x37d],
  [0x37f, 0x1fff],
  [0x200c, 0x200d],
  [0x2070, 0x218f],
  [0x2c00, 0x2fef],
  [0x3001, 0xd7ff],
  [0xf900, 0xfdcf],
  [0xfdf0, 0xfffd],
  [0x10000, 0xeffff],
];

/** Extra NameChar code point ranges (production [4a]). */
const NAME_CHAR_RANGES = [
  [0x2d, 0x2e], // - .
  [0x30, 0x39], // 0-9
  [0xb7, 0xb7],
  [0x300, 0x36f],
  [0x203f, 0x2040],
];

/**
 * Whether a code point lies in one of the ranges.
 *
 * @param {number} code - A Unicode code point
 * @param {number[][]} ranges - Inclusive `[first, last]` ranges
 * @returns {boolean} True when the code point is in a range
 */
function inRanges(code, ranges) {
  return ranges.some(([first, last]) => code >= first && code <= last);
}

/**
 * Whether a string is an NCName (a name without a colon).
 *
 * @param {string} name - The candidate name
 * @returns {boolean} True for a valid NCName
 *
 * @example
 * isNcName("item-1"); // true
 * isNcName("1item");  // false
 */
export function isNcName(name) {
  let first = true;
  for (const char of name) {
    const code = char.codePointAt(0);
    const valid =
      inRanges(code, NAME_START_RANGES) ||
      (!first && inRanges(code, NAME_CHAR_RANGES));
    if (!valid) return false;
    first = false;
  }
  return !first;
}

/**
 * Whether a string is a QName: an NCName, optionally prefixed by another
 * NCName and a single colon.
 *
 * @param {string} name - The candidate name
 * @returns {boolean} True for a valid QName
 *
 * @example
 * isQName("xl:href"); // true
 * isQName("a:b:c");   // false
 */
export function isQName(name) {
  const parts = name.split(":");
  return parts.length <= 2 && parts.every(isNcName);
}
