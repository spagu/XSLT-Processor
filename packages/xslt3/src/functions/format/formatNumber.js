/**
 * fn:format-number (F&O 3.1 section 4.7): the formatting phase of
 * section 4.7.5 over the analysis of numberPicture.js, with decimal
 * formats from decimalFormat.js. Numbers are formatted exactly: doubles
 * and floats through the shortest decimal that reads back as them.
 *
 * @module @tradik/xslt3/functions/format/formatNumber
 */

import { Decimal } from "../../xdm/decimal.js";
import { numberToDecimal } from "../../xdm/numeric.js";
import { types } from "../../xdm/types.js";
import { roundDecimal } from "../numeric.js";
import { define, stringItem } from "../support.js";
import { getDecimalFormat } from "./decimalFormat.js";
import { analyzePicture } from "./numberPicture.js";

/**
 * Splits a decimal into mantissa and exponent with
 * 10^(scaling-1) <= |mantissa| < 10^scaling.
 * @param {Decimal} value - Non-negative
 * @param {number} scaling
 * @returns {{mantissa: Decimal, exponent: number}}
 */
function scale(value, scaling) {
  if (value.sign() === 0) return { mantissa: value, exponent: 0 };
  const length = value.unscaled.toString().length;
  const exponent = length - value.scale - scaling;
  return {
    mantissa: Decimal.of(value.unscaled, value.scale + exponent),
    exponent,
  };
}

/**
 * Inserts grouping separators into the digits of the integer part.
 * @param {string} digits
 * @param {import("./numberPicture.js").SubPicture} sub
 * @param {string} separator
 * @returns {string}
 */
function groupInteger(digits, sub, separator) {
  let result = "";
  for (let i = digits.length - 1, n = 0; i >= 0; i--, n++) {
    const grouped = sub.grouping
      ? n > 0 && n % sub.grouping === 0
      : sub.integerGroups.includes(n) && n > 0;
    result = digits[i] + (grouped ? separator : "") + result;
  }
  return result;
}

/**
 * Formats the absolute value of a finite number with a sub-picture.
 * @param {Decimal} value - Non-negative, already multiplied
 * @param {import("./numberPicture.js").SubPicture} sub
 * @param {import("./decimalFormat.js").DecimalFormat} format
 * @returns {string}
 */
function formatAbsolute(value, sub, format) {
  const { mantissa: unrounded, exponent } = sub.minExponent
    ? scale(value, sub.scaling)
    : { mantissa: value, exponent: 0 };
  const mantissa = roundDecimal(unrounded, sub.maxFraction, true);
  const [whole, fraction = ""] = mantissa.toString().split(".");
  const integer = (whole === "0" ? "" : whole).padStart(sub.minInteger, "0");
  let fractionDigits = fraction.padEnd(sub.minFraction, "0");
  for (const position of [...sub.fractionGroups].reverse()) {
    if (position < fractionDigits.length) {
      fractionDigits =
        fractionDigits.slice(0, position) +
        format.groupingSeparator +
        fractionDigits.slice(position);
    }
  }
  let text = groupInteger(integer, sub, format.groupingSeparator);
  // the separator also stays without one in the picture when the
  // adjustments of 4.7.4 asked for fraction digits ("#e0" gives "0.2e0")
  if (fractionDigits !== "") {
    text += format.decimalSeparator + fractionDigits;
  }
  if (sub.minExponent) {
    text +=
      format.exponentSeparator +
      (exponent < 0 ? format.minusSign : "") +
      String(Math.abs(exponent)).padStart(sub.minExponent, "0");
  }
  const zero = format.zeroDigit.codePointAt(0);
  return text.replace(/[0-9]/g, (d) => String.fromCodePoint(zero + Number(d)));
}

/**
 * fn:format-number on an atomic numeric value.
 * @param {import("../../xdm/atomic.js").AtomicValue|undefined} item -
 *   Undefined for the empty sequence (formatted as NaN)
 * @param {string} picture
 * @param {import("./decimalFormat.js").DecimalFormat} format
 * @returns {string}
 */
export function formatNumber(item, picture, format) {
  const { positive, negative } = analyzePicture(picture, format);
  const value = item?.value ?? NaN;
  if (typeof value === "number" && Number.isNaN(value)) return format.nan;
  const isNegative =
    typeof value === "number"
      ? value < 0 || Object.is(value, -0)
      : typeof value === "bigint"
        ? value < 0n
        : value.sign() < 0;
  const sub = isNegative ? negative : positive;
  return sub.prefix + adjusted(item, sub, format) + sub.suffix;
}

/**
 * The absolute value multiplied for percent or per-mille in the value's
 * own type (doubles may overflow to infinity), formatted.
 * @param {import("../../xdm/atomic.js").AtomicValue} item - Not NaN
 * @param {import("./numberPicture.js").SubPicture} sub
 * @param {import("./decimalFormat.js").DecimalFormat} format
 * @returns {string}
 */
function adjusted(item, sub, format) {
  const { value } = item;
  let exact;
  if (typeof value === "number") {
    const isFloat = item.type.primitive === types.float;
    const product = isFloat
      ? Math.fround(value * sub.multiplier)
      : value * sub.multiplier;
    if (!Number.isFinite(product)) return format.infinity;
    exact = numberToDecimal(Math.abs(product), isFloat);
  } else {
    exact = (value instanceof Decimal ? value : Decimal.of(value)).mul(
      Decimal.of(BigInt(sub.multiplier)),
    );
    if (exact.sign() < 0) exact = exact.neg();
  }
  return formatAbsolute(exact, sub, format);
}

/**
 * @param {Array<*>[]} args - [$value, $picture, $decimal-format-name?]
 * @param {object} context
 * @returns {Array<*>}
 */
const impl = ([value, [picture], name], context) => [
  stringItem(
    formatNumber(
      value[0],
      picture.value,
      getDecimalFormat(name?.[0]?.value, context),
    ),
  ),
];

/** @type {import("../support.js").FunctionDefinition[]} */
export const formatNumberFunctions = [
  define("format-number", ["xs:numeric?", "xs:string"], "xs:string", impl),
  define(
    "format-number",
    ["xs:numeric?", "xs:string", "xs:string?"],
    "xs:string",
    impl,
  ),
];
