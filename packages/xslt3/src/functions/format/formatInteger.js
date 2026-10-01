/**
 * fn:format-integer (F&O 3.1 section 4.6.1). Supported primary format
 * tokens: decimal digit patterns in any Unicode digit family with
 * grouping separators, "a", "A", "i", "I", "w", "W" and "Ww"; other tokens
 * fall back to "1". The format modifier "o" gives English ordinals
 * ("1st", "first"); every language is formatted as English.
 *
 * @module @tradik/xslt3/functions/format/formatInteger
 */

import { define, stringItem } from "../support.js";
import {
  formatDigits,
  isDigitPattern,
  parseDigitPattern,
  pictureError,
} from "./digitPattern.js";
import {
  alphabetic,
  cardinalWords,
  caseWords,
  MAX_ROMAN,
  ordinalSuffix,
  ordinalWords,
  roman,
} from "./numberWords.js";

const DEFAULT_PATTERN = parseDigitPattern("1");

/**
 * Formats a non-negative integer with a primary format token.
 * @param {bigint} n - Non-negative
 * @param {string} token - Primary format token
 * @param {boolean} ordinal - Whether the "o" modifier is present
 * @returns {string}
 */
export function formatToken(n, token, ordinal) {
  if (isDigitPattern(token)) {
    const digits = formatDigits(n, parseDigitPattern(token));
    return ordinal ? digits + ordinalSuffix(n) : digits;
  }
  if ((token === "a" || token === "A") && n > 0n) return alphabetic(n, token);
  if ((token === "i" || token === "I") && n > 0n && n <= MAX_ROMAN) {
    const numerals = roman(n);
    return token === "I" ? numerals.toUpperCase() : numerals;
  }
  if (token === "w" || token === "W" || token === "Ww") {
    return caseWords(ordinal ? ordinalWords(n) : cardinalWords(n), token);
  }
  const digits = formatDigits(n, DEFAULT_PATTERN);
  return ordinal ? digits + ordinalSuffix(n) : digits;
}

/**
 * Splits a picture into its primary format token and whether the format
 * modifier asks for ordinal numbering.
 * @param {string} picture
 * @returns {{token: string, ordinal: boolean}}
 * @throws {XPathError} FODF1310 for an empty token or invalid modifier
 */
export function parseIntegerPicture(picture) {
  const semicolon = picture.lastIndexOf(";");
  const token = semicolon < 0 ? picture : picture.slice(0, semicolon);
  const modifier = semicolon < 0 ? "" : picture.slice(semicolon + 1);
  if (token === "") pictureError("empty primary format token");
  if (!/^([co](\(.+\))?)?[at]?$/su.test(modifier)) {
    pictureError(`invalid format modifier ${modifier}`);
  }
  return { token, ordinal: modifier.startsWith("o") };
}

/**
 * fn:format-integer on JS values.
 * @param {bigint} value
 * @param {string} picture
 * @returns {string}
 */
export function formatInteger(value, picture) {
  const { token, ordinal } = parseIntegerPicture(picture);
  const negative = value < 0n;
  const body = formatToken(negative ? -value : value, token, ordinal);
  return negative ? `-${body}` : body;
}

/**
 * @param {Array<*>[]} args - [$value, $picture, $lang?]
 * @returns {Array<*>}
 */
const impl = ([value, [picture]]) => [
  stringItem(
    value.length === 0 ? "" : formatInteger(value[0].value, picture.value),
  ),
];

/** @type {import("../support.js").FunctionDefinition[]} */
export const formatIntegerFunctions = [
  define("format-integer", ["xs:integer?", "xs:string"], "xs:string", impl),
  define(
    "format-integer",
    ["xs:integer?", "xs:string", "xs:string?"],
    "xs:string",
    impl,
  ),
];
