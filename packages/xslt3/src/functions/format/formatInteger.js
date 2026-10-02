/**
 * fn:format-integer (F&O 3.1 section 4.6.1). Supported primary format
 * tokens: decimal digit patterns in any Unicode digit family with
 * grouping separators, "a", "A", "i", "I", "w", "W" and "Ww"; other tokens
 * fall back to "1". The format modifier "o" gives ordinals ("1st",
 * "first"). Words and ordinals follow the language argument where
 * numberLanguages.js knows it (English and German), else English.
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
import { numberLanguage } from "./numberLanguages.js";
import { alphabetic, caseWords, MAX_ROMAN, roman } from "./numberWords.js";

const DEFAULT_PATTERN = parseDigitPattern("1");

/**
 * Formats a non-negative integer with a primary format token.
 * @param {bigint} n - Non-negative
 * @param {string} token - Primary format token
 * @param {boolean|string} ordinal - Whether the "o" modifier is present,
 *   or its form (the text in parentheses, "" for none)
 * @param {import("./numberLanguages.js").NumberLanguage} [language]
 * @returns {string}
 */
export function formatToken(n, token, ordinal, language = numberLanguage()) {
  const form = ordinal === true ? "" : ordinal;
  if (isDigitPattern(token)) {
    const digits = formatDigits(n, parseDigitPattern(token));
    return form === false ? digits : digits + language.suffix(n);
  }
  if ((token === "a" || token === "A") && n > 0n) return alphabetic(n, token);
  if ((token === "i" || token === "I") && n > 0n && n <= MAX_ROMAN) {
    const numerals = roman(n);
    return token === "I" ? numerals.toUpperCase() : numerals;
  }
  if (token === "w" || token === "W" || token === "Ww") {
    const words =
      form === false ? language.cardinal(n) : language.ordinal(n, form);
    return caseWords(words, token);
  }
  const digits = formatDigits(n, DEFAULT_PATTERN);
  return form === false ? digits : digits + language.suffix(n);
}

/**
 * Splits a picture into its primary format token and whether the format
 * modifier asks for ordinal numbering.
 * @param {string} picture
 * @returns {{token: string, ordinal: boolean|string}} ordinal: false, or
 *   the text in parentheses after "o" ("" for none)
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
  const form = /^o(?:\((.+)\))?/su.exec(modifier);
  return { token, ordinal: form ? (form[1] ?? "") : false };
}

/**
 * fn:format-integer on JS values.
 * @param {bigint} value
 * @param {string} picture
 * @param {string|null} [lang] - Language tag
 * @returns {string}
 */
export function formatInteger(value, picture, lang = null) {
  const { token, ordinal } = parseIntegerPicture(picture);
  const negative = value < 0n;
  const language = numberLanguage(lang);
  const body = formatToken(negative ? -value : value, token, ordinal, language);
  return negative ? `-${body}` : body;
}

/**
 * @param {Array<*>[]} args - [$value, $picture, $lang?]
 * @returns {Array<*>}
 */
const impl = ([value, [picture], lang]) => [
  stringItem(
    value.length === 0
      ? ""
      : formatInteger(value[0].value, picture.value, lang?.[0]?.value),
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
