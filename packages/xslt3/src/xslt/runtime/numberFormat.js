/**
 * The format string of xsl:number (XSLT 3.0 section 12.4): alphanumeric
 * format tokens separated by punctuation, with a prefix and a suffix,
 * applied to a list of numbers.
 *
 * @module @tradik/xslt3/xslt/runtime/numberFormat
 */

import { formatToken } from "../../functions/format/formatInteger.js";

const ALPHANUMERIC = /[\p{L}\p{N}]/u;

/**
 * Splits a format string into a prefix, tokens with their separators,
 * and a suffix.
 * @param {string} format
 * @returns {{prefix: string, tokens: string[], separators: string[], suffix: string}}
 */
export function parseFormat(format) {
  const parts = [];
  let current = "";
  let alnum = null;
  for (const c of format) {
    const isAlnum = ALPHANUMERIC.test(c);
    if (alnum !== null && isAlnum !== alnum) {
      parts.push({ text: current, alnum });
      current = "";
    }
    current += c;
    alnum = isAlnum;
  }
  if (current) parts.push({ text: current, alnum });
  let prefix = "";
  let suffix = "";
  if (parts[0] && !parts[0].alnum) prefix = parts.shift().text;
  if (parts.length && !parts.at(-1).alnum) suffix = parts.pop().text;
  const tokens = parts.filter((p) => p.alnum).map((p) => p.text);
  const separators = parts.filter((p) => !p.alnum).map((p) => p.text);
  if (tokens.length === 0) {
    // no format token: "1", with the punctuation as prefix and suffix
    return { prefix, tokens: ["1"], separators: [], suffix: prefix };
  }
  return { prefix, tokens, separators, suffix };
}

/**
 * Inserts a grouping separator every `size` digits.
 * @param {string} digits
 * @param {string} separator
 * @param {number} size
 * @returns {string}
 */
function group(digits, separator, size) {
  if (!separator || !(size > 0) || !/^\p{Nd}+$/u.test(digits)) return digits;
  const chars = [...digits];
  let result = "";
  chars.forEach((c, i) => {
    if (i > 0 && (chars.length - i) % size === 0) result += separator;
    result += c;
  });
  return result;
}

/**
 * Formats a list of numbers.
 * @param {bigint[]} numbers
 * @param {string} format
 * @param {{ordinal: boolean, separator: string, size: number}} options
 * @returns {string}
 */
export function formatNumbers(numbers, format, options) {
  const { prefix, tokens, separators, suffix } = parseFormat(format);
  let result = prefix;
  numbers.forEach((n, i) => {
    if (i > 0) {
      result += separators[Math.min(i, separators.length) - 1] ?? ".";
    }
    const token = tokens[Math.min(i, tokens.length - 1)];
    // a negative number (start-at below 1) gets a minus sign
    const text = formatToken(n < 0n ? -n : n, token, options.ordinal);
    result +=
      (n < 0n ? "-" : "") + group(text, options.separator, options.size);
  });
  return result + suffix;
}
