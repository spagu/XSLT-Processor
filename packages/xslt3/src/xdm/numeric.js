/**
 * Lexical forms of the numeric types (XSD 1.1 Part 2) and their canonical
 * string representations for casting to xs:string (F&O 3.1 section 19.1.2).
 *
 * Value representations: xs:decimal is a {@link Decimal}, xs:integer and
 * its subtypes are BigInts, xs:double and xs:float are JS numbers (floats
 * rounded with Math.fround; -0, NaN and the infinities are kept).
 *
 * @module @tradik/xslt3/xdm/numeric
 */

import { Decimal } from "./decimal.js";

const integerPattern = /^[+-]?\d+$/;
const doublePattern = /^[+-]?(\d+(\.\d*)?|\.\d+)([Ee][+-]?\d+)?$/;
const specialDoubles = new Map([
  ["INF", Infinity],
  ["+INF", Infinity],
  ["-INF", -Infinity],
  ["NaN", NaN],
]);

/**
 * Parses an xs:integer lexical form (already whitespace-collapsed).
 * @param {string} text
 * @returns {bigint|null} null when invalid
 */
export function parseInteger(text) {
  return integerPattern.test(text) ? BigInt(text) : null;
}

/**
 * Parses an xs:decimal lexical form.
 * @param {string} text
 * @returns {Decimal|null} null when invalid
 */
export function parseDecimal(text) {
  return Decimal.parse(text);
}

/**
 * Parses an xs:double lexical form, including "INF", "+INF", "-INF",
 * "NaN" and negative zero.
 * @param {string} text
 * @returns {number|null} null when invalid
 */
export function parseDouble(text) {
  if (specialDoubles.has(text)) return specialDoubles.get(text);
  return doublePattern.test(text) ? Number(text) : null;
}

/**
 * Parses an xs:float lexical form. The decimal text is rounded to a double
 * first and then to a float, which can differ from direct rounding in the
 * last bit for rare inputs.
 * @param {string} text
 * @returns {number|null} null when invalid
 */
export function parseFloat32(text) {
  const value = parseDouble(text);
  return value === null ? null : Math.fround(value);
}

/**
 * Shortest decimal digits that read back as the same double, or as the
 * same float when `isFloat` is set.
 * @param {number} n - Finite, non-zero
 * @param {boolean} isFloat
 * @returns {{digits: string, exponent: number}} significant digits
 *   d1d2d3… without trailing zeros; the value is d1.d2d3… × 10^exponent
 */
function shortestDigits(n, isFloat) {
  let text = n.toExponential();
  for (let precision = 0; isFloat && precision < 9; precision++) {
    const candidate = n.toExponential(precision);
    if (Math.fround(Number(candidate)) === n) {
      text = candidate;
      break;
    }
  }
  const [mantissa, exponent] = text.split("e");
  const digits = mantissa.replace(/^-/, "").replace(".", "").replace(/0+$/, "");
  return { digits, exponent: Number(exponent) };
}

/**
 * Canonical string of an xs:double or xs:float value (F&O 3.1 19.1.2):
 * plain decimal notation for magnitudes in [1e-6, 1e6), otherwise
 * scientific "1.0E10" / "1.5E-7"; "INF", "-INF", "NaN", "0", "-0".
 * @param {number} n
 * @param {boolean} [isFloat=false] - Use the shortest float digits
 * @returns {string}
 */
export function formatDouble(n, isFloat = false) {
  if (Number.isNaN(n)) return "NaN";
  if (n === Infinity) return "INF";
  if (n === -Infinity) return "-INF";
  if (n === 0) return Object.is(n, -0) ? "-0" : "0";
  const { digits, exponent } = shortestDigits(n, isFloat);
  const sign = n < 0 ? "-" : "";
  const magnitude = Math.abs(n);
  if (magnitude >= 1e-6 && magnitude < 1e6) {
    return (
      sign + Decimal.of(BigInt(digits), digits.length - 1 - exponent).toString()
    );
  }
  return `${sign}${digits[0]}.${digits.slice(1) || "0"}E${exponent}`;
}

/**
 * Converts a finite double or float to the decimal it prints as (the
 * shortest round-trip digits), as used for casting to xs:decimal.
 * @param {number} n - Finite number
 * @param {boolean} [isFloat=false]
 * @returns {Decimal}
 */
export function numberToDecimal(n, isFloat = false) {
  if (n === 0) return Decimal.ZERO;
  const { digits, exponent } = shortestDigits(n, isFloat);
  const unscaled = BigInt(digits);
  return Decimal.of(n < 0 ? -unscaled : unscaled, digits.length - 1 - exponent);
}
