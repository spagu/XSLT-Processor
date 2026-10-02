/**
 * Functions on numeric values (F&O 3.1 section 4.4): abs, ceiling, floor,
 * round and round-half-to-even. Results have the primitive numeric type of
 * the argument (xs:integer for integer subtypes). Decimal and integer
 * rounding is exact; doubles (and floats, widened to doubles) are rounded
 * through the shortest decimal that reads back as the double, so
 * round(0.49999999999999994) is 0.
 *
 * @module @tradik/xslt3/functions/numeric
 */

import { AtomicValue } from "../xdm/atomic.js";
import { Decimal } from "../xdm/decimal.js";
import { numberToDecimal } from "../xdm/numeric.js";
import { types } from "../xdm/types.js";
import { define } from "./support.js";

/**
 * Rounds a decimal to `precision` fraction digits (negative: to a power of
 * ten).
 * @param {Decimal} value
 * @param {number} precision
 * @param {boolean} halfEven - Ties to even; otherwise toward +INF
 * @returns {Decimal}
 */
export function roundDecimal(value, precision, halfEven) {
  if (value.scale <= precision) return value;
  const divisor = 10n ** BigInt(value.scale - precision);
  let quotient = value.unscaled / divisor;
  let remainder = value.unscaled % divisor;
  if (remainder < 0n) {
    quotient -= 1n;
    remainder += divisor;
  }
  const twice = 2n * remainder;
  const up =
    twice > divisor ||
    (twice === divisor && (!halfEven || quotient % 2n !== 0n));
  return Decimal.of(up ? quotient + 1n : quotient, precision);
}

/**
 * @param {AtomicValue} item
 * @param {*} value
 * @returns {AtomicValue} the value with the item's primitive numeric type
 */
function sameType(item, value) {
  const type = typeof value === "bigint" ? types.integer : item.type.primitive;
  return new AtomicValue(type, value);
}

/**
 * Rounds a numeric item.
 * @param {AtomicValue} item
 * @param {number} precision - Already clamped to a safe range
 * @param {boolean} halfEven
 * @returns {AtomicValue}
 */
function roundItem(item, precision, halfEven) {
  const { value } = item;
  if (typeof value === "bigint") {
    if (precision >= 0) return sameType(item, value);
    return sameType(
      item,
      roundDecimal(Decimal.of(value), precision, halfEven).unscaled,
    );
  }
  if (value instanceof Decimal) {
    return sameType(item, roundDecimal(value, precision, halfEven));
  }
  if (!Number.isFinite(value) || value === 0) return sameType(item, value);
  const isFloat = item.type.primitive === types.float;
  // floats through their double value: xs:float("0.05") is above 0.05
  const exact = numberToDecimal(value);
  let rounded = Number(roundDecimal(exact, precision, halfEven).toString());
  if (rounded === 0 && value < 0) rounded = -0;
  return sameType(item, isFloat ? Math.fround(rounded) : rounded);
}

/** Largest precision that can change a double or decimal in practice. */
const PRECISION_LIMIT = 10000;

/**
 * @param {Array<*>[]} args - [$arg, $precision?]
 * @param {boolean} halfEven
 * @returns {Array<*>}
 */
function roundFunction([arg, precision], halfEven) {
  if (arg.length === 0) return [];
  const p = precision === undefined ? 0n : precision[0].value;
  const clamped =
    p > BigInt(PRECISION_LIMIT)
      ? PRECISION_LIMIT
      : p < BigInt(-PRECISION_LIMIT)
        ? -PRECISION_LIMIT
        : Number(p);
  return [roundItem(arg[0], clamped, halfEven)];
}

/**
 * Declares a one-argument numeric function.
 * @param {string} local
 * @param {(value: *, item: AtomicValue) => *} apply - On the value
 * @returns {import("./support.js").FunctionDefinition}
 */
const unary = (local, apply) =>
  define(local, ["xs:numeric?"], "xs:numeric?", ([arg]) =>
    arg.length === 0 ? [] : [sameType(arg[0], apply(arg[0].value))],
  );

/** @param {*} v @returns {*} the largest integer not above v */
const floor = (v) =>
  typeof v === "bigint"
    ? v
    : v instanceof Decimal
      ? Decimal.of(v.floor())
      : Math.floor(v);

const N = "xs:numeric?";

/** @type {import("./support.js").FunctionDefinition[]} */
export const numericFunctions = [
  unary("abs", (v) =>
    typeof v === "bigint"
      ? v < 0n
        ? -v
        : v
      : v instanceof Decimal
        ? v.sign() < 0
          ? v.neg()
          : v
        : Math.abs(v),
  ),
  unary("floor", floor),
  unary("ceiling", (v) =>
    typeof v === "bigint"
      ? v
      : v instanceof Decimal
        ? floor(v.neg()).neg()
        : Math.ceil(v),
  ),
  define("round", [N], N, (args) => roundFunction(args, false)),
  define("round", [N, "xs:integer"], N, (args) => roundFunction(args, false)),
  define("round-half-to-even", [N], N, (args) => roundFunction(args, true)),
  define("round-half-to-even", [N, "xs:integer"], N, (args) =>
    roundFunction(args, true),
  ),
];
