/**
 * `xsl:number` number-to-string conversion.
 *
 * Renders the number sequence produced by {@link countXsltNumber} using the
 * `format` attribute of `xsl:number`: numeric tokens (`1`, `01`, and the
 * same in any Unicode digit family, e.g. `٠١`), alphabetic tokens (`a`, `A`)
 * and Roman numerals (`i`, `I`), together with the prefix, separators and
 * suffix taken from the format string itself.
 *
 * Extreme values follow libxslt: a negative number is formatted as 0, NaN
 * and Infinity as by `string()`, alphabetic and Roman tokens use decimals
 * below 1 (and Roman ones above 5000), and every conversion takes O(log n)
 * steps, so a huge value cannot stall the transformation.
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

/** Largest number written with Roman numerals, as in libxslt. */
const MAX_ROMAN = 5000;

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
    result += numeral.repeat(Math.floor(remaining / amount));
    remaining %= amount;
  }

  return result;
}

/**
 * Insert a grouping separator every `size` digits, counting from the right.
 *
 * @param {string} digits - The decimal digits
 * @param {{separator?: string, size?: number}} grouping - The grouping settings
 * @returns {string} The grouped digits
 */
function groupDigits(digits, { separator, size }) {
  if (!separator || Number.isNaN(size) || size <= 0) return digits;

  let result = "";
  for (let end = digits.length; end > 0; end -= size) {
    const group = digits.slice(Math.max(0, end - size), end);
    result = result ? `${group}${separator}${result}` : group;
  }
  return result;
}

/** A Unicode decimal digit (general category Nd). */
const DECIMAL_DIGIT = /^\p{Nd}$/u;

/**
 * Whether a code point is a Unicode decimal digit.
 *
 * @param {number} codePoint - Any code point
 * @returns {boolean} True for characters of category Nd
 */
function isDecimalDigit(codePoint) {
  return DECIMAL_DIGIT.test(String.fromCodePoint(codePoint));
}

/**
 * The zero of the digit family of a decimal format token: a token whose
 * last character has the digit value 1 and whose other characters are the
 * zero of that family (XSLT 1.0 section 7.7.1), e.g. `1`, `01`, `٠١`.
 * Digit families are runs of ten code points, which may follow each other
 * (the mathematical digits), so the value is counted from the run start.
 *
 * @param {string} token - A format token
 * @returns {number|null} The code point of the family's zero, or null
 */
function decimalTokenZero(token) {
  const digits = Array.from(token, (char) => char.codePointAt(0));
  const one = digits.at(-1);
  if (!isDecimalDigit(one)) return null;
  let start = one;
  while (isDecimalDigit(start - 1)) start--;
  const zero = one - 1;
  if ((one - start) % 10 !== 1) return null;
  return digits.slice(0, -1).every((digit) => digit === zero) ? zero : null;
}

/**
 * The decimal digits of a non-negative integer, without exponent notation.
 *
 * @param {number} value - A finite, non-negative integer
 * @returns {string} Its ASCII decimal digits
 */
function decimalDigits(value) {
  return Number.isSafeInteger(value) ? String(value) : BigInt(value).toString();
}

/**
 * Write a number with decimal digits of a family, padded with zeros to a
 * minimum width and grouped.
 *
 * @param {number} value - A finite, non-negative integer
 * @param {number} zero - Code point of the family's zero
 * @param {number} width - Minimum number of digits
 * @param {{separator?: string, size?: number}} grouping - Digit grouping
 * @returns {string} The rendered number
 */
function formatDecimal(value, zero, width, grouping) {
  const ascii = decimalDigits(value).padStart(width, "0");
  const digits =
    zero === 0x30
      ? ascii
      : Array.from(ascii, (digit) =>
          String.fromCodePoint(zero + Number(digit)),
        ).join("");
  return groupDigits(digits, grouping);
}

/**
 * Render one number with a single `xsl:number` format token.
 *
 * @param {number} value - The number to render
 * @param {string} token - The format token, e.g. `1`, `01`, `a`, `I`
 * @param {{separator?: string, size?: number}} grouping - Digit grouping
 * @returns {string} The rendered number
 */
function formatToken(value, token, grouping) {
  if (Number.isNaN(value) || value === Infinity) return String(value);
  // Negative numbers are an error that libxslt recovers from with 0
  const number = value < 0 ? 0 : Math.round(value);

  if (/^\d+$/.test(token)) {
    return formatDecimal(number, 0x30, token.length, grouping);
  }
  const zero = decimalTokenZero(token);
  if (zero !== null) {
    return formatDecimal(number, zero, Array.from(token).length, grouping);
  }

  const alphabetic = token === "a" || token === "A";
  const roman = token === "i" || token === "I";
  if (number < 1 || (roman && number > MAX_ROMAN) || (!alphabetic && !roman)) {
    return decimalDigits(number);
  }
  if (alphabetic) return toAlphabetic(number, token === "A");
  return token === "I" ? toRoman(number) : toRoman(number).toLowerCase();
}

/**
 * Split an `xsl:number` format string into prefix, tokens, separators, suffix.
 *
 * @param {string} format - The format attribute value
 * @returns {{prefix: string, suffix: string, tokens: string[], separators: string[]}} The parsed format
 */
function parseFormat(format) {
  const parts = format.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu) || [];
  const isToken = (part) => /^[\p{L}\p{N}]+$/u.test(part);

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
 * Decimal tokens are grouped when both `grouping.separator` and a positive
 * `grouping.size` are given (the `grouping-separator` and `grouping-size`
 * attributes).
 *
 * @param {number[]} numbers - The numbers, outermost first
 * @param {string} [format] - The `format` attribute value
 * @param {{separator?: string, size?: number}} [grouping] - Digit grouping
 * @returns {string} The formatted string, empty when there is nothing to number
 *
 * @example
 * formatXsltNumber([2, 3], '1.1'); // '2.3'
 * formatXsltNumber([1234567], '1', { separator: ',', size: 3 }); // '1,234,567'
 */
export function formatXsltNumber(numbers, format = "1", grouping = {}) {
  if (numbers.length === 0) return "";

  const { prefix, suffix, tokens, separators } = parseFormat(format);
  let result = prefix;

  numbers.forEach((value, index) => {
    if (index > 0) {
      const separator = separators[index - 1] ?? separators.at(-1) ?? ".";
      result += separator;
    }
    result += formatToken(value, tokens[index] ?? tokens.at(-1), grouping);
  });

  return result + suffix;
}
