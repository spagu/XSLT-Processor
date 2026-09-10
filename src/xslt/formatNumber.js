/**
 * XSLT 1.0 `format-number()` picture string formatting.
 *
 * Implements the subset of the JDK `DecimalFormat` picture syntax that XSLT 1.0
 * requires: grouping separator, decimal separator, minimum/maximum fraction
 * digits, minimum integer digits, percent and per-mille scaling and an optional
 * negative subpattern. All symbols are taken from an `xsl:decimal-format`
 * declaration so alternative digits and separators are honoured.
 */

"use strict";

/** Symbols of the unnamed, default `xsl:decimal-format`. */
export const DEFAULT_DECIMAL_FORMAT = Object.freeze({
  decimalSeparator: ".",
  groupingSeparator: ",",
  percent: "%",
  perMille: "‰",
  zeroDigit: "0",
  digit: "#",
  patternSeparator: ";",
  infinity: "Infinity",
  nan: "NaN",
  minusSign: "-",
});

/**
 * Split a picture string into its positive and optional negative subpattern.
 *
 * @param {string} pattern - The picture string
 * @param {Object} format - Decimal format symbols
 * @returns {{positive: string, negative: (string|null)}} The subpatterns
 */
function splitSubPatterns(pattern, format) {
  const index = pattern.indexOf(format.patternSeparator);
  if (index === -1) return { positive: pattern, negative: null };
  return {
    positive: pattern.substring(0, index),
    negative: pattern.substring(index + format.patternSeparator.length),
  };
}

/**
 * Parse a single subpattern into a formatting description.
 *
 * @param {string} subPattern - One subpattern of a picture string
 * @param {Object} format - Decimal format symbols
 * @returns {Object} Prefix, suffix, digit counts, grouping size and multiplier
 */
function parseSubPattern(subPattern, format) {
  const special = new Set([
    format.digit,
    format.zeroDigit,
    format.groupingSeparator,
    format.decimalSeparator,
  ]);

  let start = 0;
  while (start < subPattern.length && !special.has(subPattern[start])) start++;

  let end = start;
  while (end < subPattern.length && special.has(subPattern[end])) end++;

  const prefix = subPattern.substring(0, start);
  const numeric = subPattern.substring(start, end);
  const suffix = subPattern.substring(end);

  const decimalIndex = numeric.indexOf(format.decimalSeparator);
  const integerPart =
    decimalIndex === -1 ? numeric : numeric.substring(0, decimalIndex);
  const fractionPart =
    decimalIndex === -1 ? "" : numeric.substring(decimalIndex + 1);

  const groupingIndex = integerPart.lastIndexOf(format.groupingSeparator);
  const affixes = prefix + suffix;

  let multiplier = 1;
  if (affixes.includes(format.percent)) multiplier = 100;
  else if (affixes.includes(format.perMille)) multiplier = 1000;

  return {
    prefix,
    suffix,
    multiplier,
    minInteger: countOccurrences(integerPart, format.zeroDigit),
    minFraction: countOccurrences(fractionPart, format.zeroDigit),
    maxFraction: Math.min(fractionPart.length, 100),
    groupingSize:
      groupingIndex === -1 ? 0 : integerPart.length - groupingIndex - 1,
  };
}

/**
 * Count occurrences of a character inside a string.
 *
 * @param {string} text - The text to scan
 * @param {string} char - The character to count
 * @returns {number} Number of occurrences
 */
function countOccurrences(text, char) {
  let total = 0;
  for (const current of text) {
    if (current === char) total++;
  }
  return total;
}

/**
 * Insert grouping separators into a run of integer digits.
 *
 * @param {string} digits - Integer digits, most significant first
 * @param {number} size - Grouping size, 0 disables grouping
 * @param {string} separator - The grouping separator
 * @returns {string} The grouped digits
 */
function applyGrouping(digits, size, separator) {
  if (size <= 0 || digits.length <= size) return digits;

  let result = "";
  for (let i = 0; i < digits.length; i++) {
    const fromEnd = digits.length - i;
    if (i > 0 && fromEnd % size === 0) result += separator;
    result += digits[i];
  }
  return result;
}

/**
 * Translate ASCII digits to the digits of the decimal format.
 *
 * @param {string} text - Text containing ASCII digits
 * @param {string} zeroDigit - The format's zero digit
 * @returns {string} Text using the format's digit family
 */
function translateDigits(text, zeroDigit) {
  const offset = zeroDigit.codePointAt(0) - 48;
  if (offset === 0) return text;
  return text.replaceAll(/\d/g, (digit) =>
    String.fromCodePoint(digit.codePointAt(0) + offset),
  );
}

/**
 * Format the magnitude of a finite number according to a parsed subpattern.
 *
 * @param {number} magnitude - Absolute, already scaled value
 * @param {Object} spec - Parsed subpattern
 * @param {Object} format - Decimal format symbols
 * @returns {string} The formatted number without prefix or suffix
 */
function formatMagnitude(magnitude, spec, format) {
  const fixed = magnitude.toFixed(spec.maxFraction);
  const [rawInteger, rawFraction = ""] = fixed.split(".");

  let fraction = rawFraction;
  while (fraction.length > spec.minFraction && fraction.endsWith("0")) {
    fraction = fraction.slice(0, -1);
  }

  let integer = rawInteger.padStart(spec.minInteger, "0");
  if (spec.minInteger === 0 && integer === "0" && fraction.length > 0) {
    integer = "";
  }

  integer = applyGrouping(integer, spec.groupingSize, format.groupingSeparator);

  const body =
    fraction.length > 0
      ? integer + format.decimalSeparator + fraction
      : integer;

  return translateDigits(body, format.zeroDigit);
}

/**
 * Format a number using an XSLT 1.0 picture string.
 *
 * @param {number} value - The number to format
 * @param {string} pattern - The picture string, e.g. `#,##0.00`
 * @param {Object} [decimalFormat] - `xsl:decimal-format` symbols
 * @returns {string} The formatted number
 *
 * @example
 * formatNumber(1234.5, '#,##0.00'); // '1,234.50'
 * formatNumber(-1234, '#,##0;(#,##0)'); // '(1,234)'
 */
export function formatNumber(
  value,
  pattern,
  decimalFormat = DEFAULT_DECIMAL_FORMAT,
) {
  const format = { ...DEFAULT_DECIMAL_FORMAT, ...decimalFormat };

  if (typeof value !== "number" || Number.isNaN(value)) return format.nan;

  const subPatterns = splitSubPatterns(pattern, format);
  const positive = parseSubPattern(subPatterns.positive, format);
  const isNegative = value < 0;

  let spec = positive;
  let prefix = positive.prefix;
  let suffix = positive.suffix;

  if (isNegative) {
    if (subPatterns.negative !== null) {
      spec = parseSubPattern(subPatterns.negative, format);
      prefix = spec.prefix;
      suffix = spec.suffix;
    } else {
      prefix = format.minusSign + positive.prefix;
    }
  }

  const magnitude = Math.abs(value) * spec.multiplier;
  const body = Number.isFinite(magnitude)
    ? formatMagnitude(magnitude, spec, format)
    : format.infinity;

  return prefix + body + suffix;
}
