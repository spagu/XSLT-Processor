/**
 * General comparisons (=, !=, <, <=, >, >=) of XPath 3.1 section 3.7.2,
 * with the XPath 1.0 compatibility mode rules.
 *
 * @module @tradik/xslt3/xdm/generalCompare
 */

import { XPathError } from "../errors.js";
import { AtomicValue } from "./atomic.js";
import { cast } from "./cast.js";
import { valueCompare } from "./compare.js";
import { atomize, effectiveBooleanValue } from "./nodes.js";
import { derivesFrom, isNumericType, types } from "./types.js";

const valueOperators = {
  "=": "eq",
  "!=": "ne",
  "<": "lt",
  "<=": "le",
  ">": "gt",
  ">=": "ge",
};

const isUntyped = (item) => item.type === types.untypedAtomic;
const isString = (item) => derivesFrom(item.type, types.string);

/**
 * fn:number of an atomic value: its xs:double value, or NaN when it cannot
 * be cast.
 * @param {AtomicValue} item
 * @returns {AtomicValue} an xs:double
 */
export function toNumber(item) {
  try {
    return cast(item, types.double);
  } catch (error) {
    if (!(error instanceof XPathError)) throw error;
    return new AtomicValue(types.double, NaN);
  }
}

/**
 * Converts an untyped operand for comparison with a typed one (XPath 3.1).
 * @param {AtomicValue} untyped
 * @param {AtomicValue} other
 * @returns {AtomicValue}
 */
function castUntyped(untyped, other) {
  if (isNumericType(other.type)) return cast(untyped, types.double);
  for (const duration of [types.dayTimeDuration, types.yearMonthDuration]) {
    if (derivesFrom(other.type, duration)) return cast(untyped, duration);
  }
  return cast(untyped, other.type.primitive);
}

/**
 * Prepares a pair of atomic values (XPath 3.1 mode).
 * @returns {[AtomicValue, AtomicValue]}
 */
function convertPair(a, b) {
  if (isUntyped(a) && isUntyped(b)) {
    return [cast(a, types.string), cast(b, types.string)];
  }
  if (isUntyped(a)) return [castUntyped(a, b), b];
  if (isUntyped(b)) return [a, castUntyped(b, a)];
  return [a, b];
}

/**
 * Prepares a pair of atomic values (XPath 1.0 compatibility mode).
 * @returns {[AtomicValue, AtomicValue]}
 */
function convertPairCompatible(a, b) {
  if (isNumericType(a.type) || isNumericType(b.type)) {
    return [toNumber(a), toNumber(b)];
  }
  if (isString(a) || isString(b) || (isUntyped(a) && isUntyped(b))) {
    return [cast(a, types.string), cast(b, types.string)];
  }
  if (isUntyped(a)) return [cast(a, b.type), b];
  if (isUntyped(b)) return [a, cast(b, a.type)];
  return [a, b];
}

/**
 * Whether an operand is a single xs:boolean atomic value.
 * @param {Array} sequence
 * @returns {boolean}
 */
function isSingleBoolean(sequence) {
  return (
    sequence.length === 1 &&
    sequence[0] instanceof AtomicValue &&
    sequence[0].type.primitive === types.boolean
  );
}

/**
 * Evaluates a general comparison of two sequences: true when some pair of
 * atomized items has the relationship.
 * @param {Array} left - Sequence of items (atomized here)
 * @param {"="|"!="|"<"|"<="|">"|">="} op
 * @param {Array} right
 * @param {import("./compare.js").CompareOptions & {backwardsCompatible?: boolean}} [options]
 *   - `backwardsCompatible` enables the XPath 1.0 compatibility mode
 * @returns {boolean}
 * @throws {XPathError} XPTY0004 for incomparable types, FORG0001 when an
 *   untyped value cannot be cast
 */
export function generalCompare(left, op, right, options = {}) {
  const valueOp = valueOperators[op];
  if (!valueOp) {
    throw new TypeError(`Unknown general comparison operator ${op}`);
  }
  let a = left;
  let b = right;
  let convert = convertPair;
  if (options.backwardsCompatible) {
    convert = convertPairCompatible;
    if (isSingleBoolean(a) || isSingleBoolean(b)) {
      const toBoolean = (s) => [
        new AtomicValue(types.boolean, effectiveBooleanValue(s)),
      ];
      a = isSingleBoolean(a) ? a : toBoolean(a);
      b = isSingleBoolean(b) ? b : toBoolean(b);
    }
  }
  a = atomize(a);
  b = atomize(b);
  if (options.backwardsCompatible && valueOp !== "eq" && valueOp !== "ne") {
    a = a.map(toNumber);
    b = b.map(toNumber);
  }
  return a.some((x) =>
    b.some((y) => {
      const [p, q] = convert(x, y);
      return valueCompare(p, valueOp, q, options);
    }),
  );
}
