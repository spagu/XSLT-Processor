/**
 * Decimal digit patterns of format-integer and format-date/time pictures
 * (F&O 3.1 section 4.6.1): mandatory digits of one digit family, optional
 * "#" digits and grouping separators, regular or not.
 *
 * @module @tradik/xslt3/functions/format/digitPattern
 */

import { XPathError } from "../../errors.js";

const isDigitChar = (c) => /^\p{Nd}$/u.test(c);
const isAlphanumeric = (c) => /^[\p{L}\p{N}]$/u.test(c);

/**
 * @param {string} message
 * @returns {never}
 * @throws {XPathError} FODF1310
 */
export function pictureError(message) {
  throw new XPathError("FODF1310", `Invalid picture string: ${message}`);
}

/**
 * The zero digit of the family of a decimal digit: Unicode digit runs are
 * contiguous blocks of ten starting at their zero.
 * @param {string} digit - A character of category Nd
 * @returns {number} codepoint of the zero
 */
export function zeroOf(digit) {
  const cp = digit.codePointAt(0);
  let start = cp;
  while (isDigitChar(String.fromCodePoint(start - 1))) start--;
  return cp - ((cp - start) % 10);
}

/**
 * @typedef {object} DigitPattern
 * @property {number} zero - Codepoint of the zero digit
 * @property {number} mandatory - Number of mandatory digits
 * @property {number} digits - Number of digit signs, "#" included
 * @property {Map<number, string>} separators - Separator by number of
 *   digit signs to its right
 * @property {number} grouping - Regular grouping size, 0 when irregular
 */

/**
 * Whether a format token is a decimal digit pattern: it has a decimal
 * digit ("#" alone falls back to the default format, see W3C bug 19004).
 * @param {string} token
 * @returns {boolean}
 */
export const isDigitPattern = (token) => Array.from(token).some(isDigitChar);

/**
 * Parses a decimal digit pattern.
 * @param {string} token
 * @returns {DigitPattern}
 * @throws {XPathError} FODF1310 when invalid
 */
export function parseDigitPattern(token) {
  const chars = Array.from(token);
  let zero = null;
  let mandatory = 0;
  const marks = [];
  chars.forEach((c, i) => {
    if (c === "#") {
      if (mandatory > 0) pictureError(`"#" after a digit in ${token}`);
      marks.push(null);
    } else if (isDigitChar(c)) {
      if (zero !== null && zeroOf(c) !== zero) {
        pictureError(`digits of different families in ${token}`);
      }
      zero = zeroOf(c);
      mandatory++;
      marks.push(null);
    } else if (isAlphanumeric(c)) {
      pictureError(`letter ${c} in ${token}`);
    } else {
      if (i === 0 || i === chars.length - 1 || marks.at(-1) !== null) {
        pictureError(`misplaced grouping separator in ${token}`);
      }
      marks.push(c);
    }
  });
  if (zero === null) pictureError(`no mandatory digit in ${token}`);
  const digits = marks.filter((m) => m === null).length;
  const separators = new Map();
  let right = 0;
  for (let i = marks.length - 1; i >= 0; i--) {
    if (marks[i] === null) right++;
    else separators.set(right, marks[i]);
  }
  return {
    zero,
    mandatory,
    digits,
    separators,
    grouping: regularGrouping(separators, digits),
  };
}

/**
 * The grouping size when the separators are regular (one character, at
 * every multiple of the first position), else 0.
 * @param {Map<number, string>} separators
 * @param {number} digits
 * @returns {number}
 */
export function regularGrouping(separators, digits) {
  if (separators.size === 0) return 0;
  const size = Math.min(...separators.keys());
  const chars = new Set(separators.values());
  for (const position of separators.keys()) {
    if (position % size !== 0) return 0;
  }
  for (let position = size; position < digits; position += size) {
    if (!separators.has(position)) return 0;
  }
  return chars.size === 1 ? size : 0;
}

/**
 * Formats a non-negative integer with a digit pattern.
 * @param {bigint|string} value - Non-negative integer, or its ASCII digits
 * @param {DigitPattern} pattern
 * @param {number} [minDigits] - Overrides the mandatory digit count
 * @returns {string}
 */
export function formatDigits(value, pattern, minDigits = pattern.mandatory) {
  const ascii = String(value).padStart(minDigits, "0");
  const { zero, separators, grouping } = pattern;
  const separator = grouping ? separators.get(grouping) : null;
  let result = "";
  for (let i = ascii.length - 1, count = 0; i >= 0; i--) {
    if (count > 0) {
      const mark = grouping
        ? count % grouping === 0 && separator
        : separators.get(count);
      if (mark) result = mark + result;
    }
    result = String.fromCodePoint(zero + Number(ascii[i])) + result;
    count++;
  }
  return result;
}
