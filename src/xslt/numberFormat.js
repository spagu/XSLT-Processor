/**
 * `xsl:number` number-to-string conversion.
 *
 * Renders the number sequence produced by {@link countXsltNumber} using the
 * `format` attribute of `xsl:number`: numeric tokens (`1`, `01`), alphabetic
 * tokens (`a`, `A`) and Roman numerals (`i`, `I`), together with the prefix,
 * separators and suffix taken from the format string itself.
 */

"use strict";

/**
 * Convert a positive integer to a bijective base-26 alphabetic sequence.
 *
 * @param {number} value - The number to convert
 * @param {boolean} upperCase - Whether to emit upper case letters
 * @returns {string} The alphabetic representation, e.g. `27` becomes `aa`
 */
function toAlphabetic(value, upperCase) {
  let remaining = value;
  let result = "";

  while (remaining > 0) {
    const index = (remaining - 1) % 26;
    result = String.fromCodePoint((upperCase ? 65 : 97) + index) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return result;
}

/** Roman numeral building blocks, largest first. */
const ROMAN_NUMERALS = Object.freeze([
  ["M", 1000],
  ["CM", 900],
  ["D", 500],
  ["CD", 400],
  ["C", 100],
  ["XC", 90],
  ["L", 50],
  ["XL", 40],
  ["X", 10],
  ["IX", 9],
  ["V", 5],
  ["IV", 4],
  ["I", 1],
]);

/**
 * Convert a positive integer to a Roman numeral.
 *
 * @param {number} value - The number to convert
 * @returns {string} The upper case Roman numeral
 *
 * @example
 * toRoman(2004); // 'MMIV'
 */
export function toRoman(value) {
  let remaining = value;
  let result = "";

  for (const [numeral, amount] of ROMAN_NUMERALS) {
    while (remaining >= amount) {
      result += numeral;
      remaining -= amount;
    }
  }

  return result;
}

/**
 * Render one number with a single `xsl:number` format token.
 *
 * @param {number} value - The number to render
 * @param {string} token - The format token, e.g. `1`, `01`, `a`, `I`
 * @returns {string} The rendered number
 */
function formatToken(value, token) {
  if (/^\d+$/.test(token)) {
    return String(value).padStart(token.length, "0");
  }

  if (value <= 0) return String(value);

  switch (token) {
    case "a":
      return toAlphabetic(value, false);
    case "A":
      return toAlphabetic(value, true);
    case "i":
      return toRoman(value).toLowerCase();
    case "I":
      return toRoman(value);
    default:
      return String(value);
  }
}

/**
 * Split an `xsl:number` format string into prefix, tokens, separators, suffix.
 *
 * @param {string} format - The format attribute value
 * @returns {{prefix: string, suffix: string, tokens: string[], separators: string[]}} The parsed format
 */
function parseFormat(format) {
  const parts = format.match(/[a-zA-Z0-9]+|[^a-zA-Z0-9]+/g) || [];
  const isToken = (part) => /^[a-zA-Z0-9]+$/.test(part);

  const tokens = [];
  const separators = [];
  let prefix = "";
  let suffix = "";

  for (const part of parts) {
    if (isToken(part)) tokens.push(part);
    else if (tokens.length === 0) prefix = part;
    else separators.push(part);
  }

  if (parts.length > 0 && tokens.length > 0 && !isToken(parts.at(-1))) {
    suffix = separators.pop();
  }

  if (tokens.length === 0) tokens.push("1");

  return { prefix, suffix, tokens, separators };
}

/**
 * Format a number sequence produced by {@link countXsltNumber}.
 *
 * @param {number[]} numbers - The numbers, outermost first
 * @param {string} [format] - The `format` attribute value
 * @returns {string} The formatted string, empty when there is nothing to number
 *
 * @example
 * formatXsltNumber([2, 3], '1.1'); // '2.3'
 */
export function formatXsltNumber(numbers, format = "1") {
  if (numbers.length === 0) return "";

  const { prefix, suffix, tokens, separators } = parseFormat(format);
  let result = prefix;

  numbers.forEach((value, index) => {
    if (index > 0) {
      const separator = separators[index - 1] ?? separators.at(-1) ?? ".";
      result += separator;
    }
    result += formatToken(value, tokens[index] ?? tokens.at(-1));
  });

  return result + suffix;
}
