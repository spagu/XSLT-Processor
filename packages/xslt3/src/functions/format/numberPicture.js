/**
 * Analysis of fn:format-number picture strings (F&O 3.1 sections 4.7.3
 * and 4.7.4): syntax checks (FODF1310) and the variables of each
 * sub-picture.
 *
 * @module @tradik/xslt3/functions/format/numberPicture
 */

import { pictureError, regularGrouping } from "./digitPattern.js";

/**
 * Variables of one sub-picture.
 * @typedef {object} SubPicture
 * @property {string} prefix
 * @property {string} suffix
 * @property {number[]} integerGroups - Grouping positions, from the
 *   decimal separator leftwards
 * @property {number} grouping - Regular grouping size, 0 when irregular
 * @property {number[]} fractionGroups
 * @property {number} minInteger
 * @property {number} scaling
 * @property {number} minFraction
 * @property {number} maxFraction
 * @property {number} minExponent - 0 without exponent
 * @property {boolean} hasDecimal - Whether the decimal separator occurs
 * @property {number} multiplier - 1, 100 (percent) or 1000 (per-mille)
 */

/**
 * Classifies the characters of a sub-picture.
 * @param {string[]} chars
 * @param {import("./decimalFormat.js").DecimalFormat} format
 * @returns {string[]} "digit", "optional", "decimal", "grouping",
 *   "exponent" (candidate) or "passive" per character
 */
function classify(chars, format) {
  const zero = format.zeroDigit.codePointAt(0);
  return chars.map((c) => {
    const cp = c.codePointAt(0);
    if (cp >= zero && cp <= zero + 9) return "digit";
    if (c === format.digit) return "optional";
    if (c === format.decimalSeparator) return "decimal";
    if (c === format.groupingSeparator) return "grouping";
    if (c === format.exponentSeparator) return "exponent";
    return "passive";
  });
}

const count = (kinds, ...wanted) =>
  kinds.filter((k) => wanted.includes(k)).length;

/**
 * Grouping positions of a part, counted from its decimal-separator side.
 * @param {string[]} kinds - The part, ordered away from the separator
 * @returns {number[]}
 */
function groupPositions(kinds) {
  const positions = [];
  let digits = 0;
  for (const kind of kinds) {
    if (kind === "grouping") positions.push(digits);
    else digits++;
  }
  return positions;
}

/**
 * Checks the syntax rules on the mantissa part.
 * @param {string[]} integer - Kinds of the integer part
 * @param {string[]} fraction - Kinds of the fractional part
 * @param {boolean} hasDecimal
 */
function checkMantissa(integer, fraction, hasDecimal) {
  const mantissa = [...integer, ...fraction];
  if (count(mantissa, "digit", "optional") === 0) pictureError("no digit");
  if (
    integer.at(-1) === "grouping" ||
    (hasDecimal && fraction[0] === "grouping") ||
    mantissa.some((k, i) => k === "grouping" && mantissa[i + 1] === "grouping")
  ) {
    pictureError("misplaced grouping separator");
  }
  const firstDigit = integer.indexOf("digit");
  if (firstDigit >= 0 && integer.indexOf("optional", firstDigit) >= 0) {
    pictureError("optional digit after a mandatory digit");
  }
  const firstOptional = fraction.indexOf("optional");
  if (firstOptional >= 0 && fraction.indexOf("digit", firstOptional) >= 0) {
    pictureError("mandatory digit after an optional digit");
  }
}

/**
 * Analyzes one sub-picture.
 * @param {string} picture
 * @param {import("./decimalFormat.js").DecimalFormat} format
 * @returns {SubPicture}
 */
export function analyzeSubPicture(picture, format) {
  const chars = Array.from(picture);
  const kinds = classify(chars, format);
  const isActive = (k) => k !== "passive" && k !== "exponent";
  const first = kinds.findIndex(isActive);
  const last = kinds.findLastIndex(isActive);
  const exponents = kinds
    .map((k, i) => (k === "exponent" && i > first && i < last ? i : -1))
    .filter((i) => i >= 0);
  const marks = chars.filter(
    (c) => c === format.percent || c === format.perMille,
  );
  if (first < 0) pictureError("no digit");
  if (count(kinds, "decimal") > 1) pictureError("several decimal separators");
  if (
    marks.length > 1 ||
    exponents.length > 1 ||
    (marks.length && exponents.length)
  ) {
    pictureError("several percent, per-mille or exponent signs");
  }
  const exponent = exponents[0] ?? -1;
  kinds.forEach((k, i) => {
    if (!isActive(k) && i > first && i < last && i !== exponent) {
      pictureError("passive character between active characters");
    }
  });
  const mantissaEnd = exponent < 0 ? last + 1 : exponent;
  const mantissa = kinds.slice(first, mantissaEnd);
  const exponentPart = exponent < 0 ? [] : kinds.slice(exponent + 1, last + 1);
  if (exponentPart.some((k) => k !== "digit")) {
    pictureError("non-digit in the exponent");
  }
  const decimal = mantissa.indexOf("decimal");
  const hasDecimal = decimal >= 0;
  const integer = hasDecimal ? mantissa.slice(0, decimal) : mantissa;
  const fraction = hasDecimal ? mantissa.slice(decimal + 1) : [];
  checkMantissa(integer, fraction, hasDecimal);
  return variables({
    integer,
    fraction,
    hasDecimal,
    minExponent: exponentPart.length,
    prefix: chars.slice(0, first).join(""),
    suffix: chars.slice(last + 1).join(""),
    multiplier: marks[0] === format.percent ? 100 : marks.length ? 1000 : 1,
  });
}

/**
 * Computes the variables of section 4.7.4 from the parts.
 * @param {object} parts
 * @returns {SubPicture}
 */
function variables({ integer, fraction, hasDecimal, minExponent, ...rest }) {
  const integerGroups = groupPositions([...integer].reverse());
  const integerDigits = count(integer, "digit", "optional");
  const separators = new Map(integerGroups.map((p) => [p, ","]));
  let minInteger = count(integer, "digit");
  let minFraction = count(fraction, "digit");
  let maxFraction = count(fraction, "digit", "optional");
  if (minInteger === 0 && maxFraction === 0) {
    if (minExponent > 0) {
      minFraction = 1;
      maxFraction = 1;
    } else {
      minInteger = 1;
    }
  }
  if (minExponent > 0 && minInteger === 0 && integer.includes("optional")) {
    minInteger = 1;
  }
  if (minInteger === 0 && minFraction === 0) minFraction = 1;
  return {
    ...rest,
    integerGroups,
    grouping: regularGrouping(separators, integerDigits),
    fractionGroups: groupPositions(fraction),
    minInteger,
    scaling: count(integer, "digit"),
    minFraction,
    maxFraction,
    minExponent,
    hasDecimal,
  };
}

/**
 * Analyzes a picture string into its positive and negative sub-pictures.
 * @param {string} picture
 * @param {import("./decimalFormat.js").DecimalFormat} format
 * @returns {{positive: SubPicture, negative: SubPicture}}
 * @throws {XPathError} FODF1310 for an invalid picture
 */
export function analyzePicture(picture, format) {
  const parts = picture.split(format.patternSeparator);
  if (parts.length > 2) pictureError("several pattern separators");
  const positive = analyzeSubPicture(parts[0], format);
  const negative =
    parts.length === 2
      ? analyzeSubPicture(parts[1], format)
      : { ...positive, prefix: format.minusSign + positive.prefix };
  return { positive, negative };
}
