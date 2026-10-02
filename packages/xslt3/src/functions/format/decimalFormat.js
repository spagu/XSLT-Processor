/**
 * Decimal formats of fn:format-number (XPath 3.1 static context, XSLT
 * `xsl:decimal-format`).
 *
 * The evaluator supplies the formats through the dynamic context hook
 * `context.decimalFormats`, an object with `get(name)`: it receives the
 * format name as written in the third argument with surrounding whitespace
 * removed (a lexical QName or `Q{uri}local`, so the hook resolves the
 * prefix), or "" for the unnamed format, and returns a partial
 * {@link DecimalFormat} (missing properties take the defaults) or
 * undefined when no such format is declared.
 *
 * @module @tradik/xslt3/functions/format/decimalFormat
 */

import { XPathError } from "../../errors.js";

/**
 * Properties of a decimal format; all but `infinity` and `nan` are single
 * characters.
 * @typedef {object} DecimalFormat
 * @property {string} decimalSeparator
 * @property {string} groupingSeparator
 * @property {string} exponentSeparator
 * @property {string} infinity
 * @property {string} minusSign
 * @property {string} nan
 * @property {string} percent
 * @property {string} perMille
 * @property {string} zeroDigit - First digit of the decimal digit family
 * @property {string} digit - The optional digit sign
 * @property {string} patternSeparator
 */

/** @type {Readonly<DecimalFormat>} the default (unnamed) decimal format */
export const DEFAULT_DECIMAL_FORMAT = Object.freeze({
  decimalSeparator: ".",
  groupingSeparator: ",",
  exponentSeparator: "e",
  infinity: "Infinity",
  minusSign: "-",
  nan: "NaN",
  percent: "%",
  perMille: "‰",
  zeroDigit: "0",
  digit: "#",
  patternSeparator: ";",
});

/**
 * Looks up a decimal format.
 * @param {string|undefined} name - The third argument of format-number,
 *   undefined when absent or empty
 * @param {{decimalFormats?: {get: (name: string) => (Partial<DecimalFormat>|undefined)}}} context
 * @returns {DecimalFormat}
 * @throws {XPathError} FODF1280 for an unknown format name
 */
export function getDecimalFormat(name, context) {
  const key = name?.trim() ?? "";
  const custom = context.decimalFormats?.get(key);
  if (custom === undefined && key !== "") {
    throw new XPathError("FODF1280", `Unknown decimal format ${key}`);
  }
  return { ...DEFAULT_DECIMAL_FORMAT, ...custom };
}
