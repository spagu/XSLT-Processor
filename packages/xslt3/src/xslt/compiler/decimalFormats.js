/**
 * xsl:decimal-format declarations (XSLT 3.0 section 21.2.1): the
 * properties of each format merged by import precedence and checked,
 * as definitions for the XPath static context (see
 * xpath/eval/decimalFormats.js).
 *
 * @module @tradik/xslt3/xslt/compiler/decimalFormats
 */

import { clarkOf, xsltError } from "../names.js";

/** Properties holding one character. */
const CHARACTERS = [
  "decimal-separator",
  "grouping-separator",
  "minus-sign",
  "exponent-separator",
  "percent",
  "per-mille",
  "zero-digit",
  "digit",
  "pattern-separator",
];

/** Properties holding a string. */
const STRINGS = ["infinity", "NaN"];

/** Properties whose characters must differ (XTSE1300). */
const DISTINCT = [
  "decimal-separator",
  "grouping-separator",
  "exponent-separator",
  "percent",
  "per-mille",
  "digit",
  "pattern-separator",
];

/** Default values of the distinct properties. */
const DEFAULTS = {
  "decimal-separator": ".",
  "grouping-separator": ",",
  "exponent-separator": "e",
  percent: "%",
  "per-mille": "‰",
  digit: "#",
  "pattern-separator": ";",
  "zero-digit": "0",
};

/**
 * Whether a code point is a decimal digit with value zero: Unicode
 * decimal digits come in runs of ten, from zero to nine.
 * @param {number} codePoint
 * @returns {boolean}
 */
function isZeroDigit(codePoint) {
  const digit = (cp) => /^\p{Nd}$/u.test(String.fromCodePoint(cp));
  if (!digit(codePoint)) return false;
  let before = 0;
  while (codePoint - before - 1 >= 0 && digit(codePoint - before - 1)) {
    before++;
  }
  return before % 10 === 0;
}

/**
 * Checks a merged format: zero-digit is a digit with value 0, and the
 * picture characters are distinct (the ten digits included).
 * @param {object} format
 */
function checkFormat(format) {
  const zero = format["zero-digit"] ?? "0";
  const base = zero.codePointAt(0);
  if (!isZeroDigit(base)) {
    throw xsltError("XTSE1295", "zero-digit must be a digit with value zero");
  }
  const used = new Set();
  for (let i = 0; i < 10; i++) used.add(String.fromCodePoint(base + i));
  for (const property of DISTINCT) {
    const value = format[property] ?? DEFAULTS[property];
    if (used.has(value)) {
      throw xsltError("XTSE1300", `The decimal format uses ${value} twice`);
    }
    used.add(value);
  }
}

/**
 * Collects the decimal formats.
 * @param {object[]} declarations
 * @param {object} cx
 * @returns {object[]} definitions with a `name` (Q{uri}local, "" for the
 *   default format)
 */
export function collectDecimalFormats(declarations, cx) {
  const formats = new Map();
  for (const { element, precedence } of declarations) {
    const nameText = element.getAttribute("name");
    const name = nameText
      ? `Q${clarkOf(cx.exprs.qname(nameText, element))}`
      : "";
    const format = formats.get(name) ?? { name, from: {}, conflict: {} };
    for (const property of [...CHARACTERS, ...STRINGS]) {
      if (!element.hasAttribute(property)) continue;
      const value = element.getAttribute(property);
      if (CHARACTERS.includes(property) && [...value].length !== 1) {
        throw xsltError("XTSE0020", `${property} must be one character`);
      }
      if (format.from[property] === precedence && format[property] !== value) {
        format.conflict[property] = precedence;
      }
      if (
        format.from[property] === undefined ||
        format.from[property] <= precedence
      ) {
        format[property] = value;
        format.from[property] = precedence;
      }
    }
    formats.set(name, format);
  }
  for (const format of formats.values()) {
    for (const [property, precedence] of Object.entries(format.conflict)) {
      if (format.from[property] === precedence) {
        throw xsltError("XTSE1290", `Conflicting values of ${property}`);
      }
    }
    checkFormat(format);
  }
  return [...formats.values()];
}
