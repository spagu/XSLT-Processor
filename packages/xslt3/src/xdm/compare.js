/**
 * Value comparisons of atomic values (XPath 3.1 section 3.7.1, operator
 * mapping of appendix B.2, F&O 3.1 comparison operators) and the
 * atomic-value equality of fn:deep-equal.
 *
 * @module @tradik/xslt3/xdm/compare
 */

import { XPathError } from "../errors.js";
import { compareBytes } from "./binary.js";
import { timelineSeconds } from "./timeline.js";
import { Decimal } from "./decimal.js";
import { compareCodepoints } from "./strings.js";
import { derivesFrom } from "./types.js";

/**
 * Options of the comparison functions.
 * @typedef {object} CompareOptions
 * @property {number} [implicitTimezone=0] - Offset in minutes applied to
 *   dates and times without a timezone
 * @property {(a: string, b: string) => number} [collation] - String
 *   comparison; defaults to the Unicode codepoint collation
 */

const numericRank = { decimal: 0, float: 1, double: 2 };
const stringLike = new Set(["string", "anyURI", "untypedAtomic"]);
const orderedTimes = new Set(["dateTime", "date", "time"]);
const unorderedTimes = new Set([
  "gYearMonth",
  "gYear",
  "gMonthDay",
  "gDay",
  "gMonth",
]);

/** @param {number} n @returns {number} sign of a difference, NaN kept */
const sign = (n) => (Number.isNaN(n) ? NaN : Math.sign(n));

/**
 * Numeric value of an operand at a promotion level.
 * @param {import("./atomic.js").AtomicValue} item
 * @param {string} level - "decimal", "float" or "double"
 * @returns {number|Decimal}
 */
function promote(item, level) {
  const { value } = item;
  if (level === "decimal") {
    return typeof value === "bigint" ? Decimal.of(value) : value;
  }
  const number = typeof value === "number" ? value : Number(value.toString());
  return level === "float" ? Math.fround(number) : number;
}

/**
 * Compares two numeric values with type promotion (decimal → float →
 * double).
 * @returns {number} -1, 0, 1 or NaN when unordered
 */
function compareNumeric(a, b, pa, pb) {
  if (typeof a.value === "bigint" && typeof b.value === "bigint") {
    return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
  }
  const level = numericRank[pa] > numericRank[pb] ? pa : pb;
  const x = promote(a, level);
  const y = promote(b, level);
  if (level === "decimal") return x.compare(y);
  // Equal infinities: INF - INF is NaN, which would make them unordered
  return x === y ? 0 : sign(x - y);
}

/**
 * Compares two durations; ordering is only defined within
 * xs:yearMonthDuration or within xs:dayTimeDuration.
 * @returns {{order: number, ordered: boolean}}
 */
function compareDurations(a, b) {
  const yearMonth =
    derivesFrom(a.type, "yearMonthDuration") &&
    derivesFrom(b.type, "yearMonthDuration");
  const dayTime =
    derivesFrom(a.type, "dayTimeDuration") &&
    derivesFrom(b.type, "dayTimeDuration");
  const months = Math.sign(a.value.months - b.value.months);
  const seconds = a.value.seconds.compare(b.value.seconds);
  if (yearMonth) return { order: months, ordered: true };
  if (dayTime) return { order: seconds, ordered: true };
  return { order: months === 0 && seconds === 0 ? 0 : NaN, ordered: false };
}

/**
 * Compares two atomic values per the operator mapping.
 * @param {import("./atomic.js").AtomicValue} a
 * @param {import("./atomic.js").AtomicValue} b
 * @param {CompareOptions} [options]
 * @returns {{order: number, ordered: boolean}} `order` is -1, 0, 1, or NaN
 *   when the values are unequal and unordered (NaN operands, mixed
 *   durations); `ordered` tells whether lt/gt are defined for the pair
 * @throws {XPathError} XPTY0004 when the types are not comparable
 */
export function compareAtomic(a, b, options = {}) {
  const pa = a.type.primitive.localName;
  const pb = b.type.primitive.localName;
  if (pa in numericRank && pb in numericRank) {
    return { order: compareNumeric(a, b, pa, pb), ordered: true };
  }
  if (stringLike.has(pa) && stringLike.has(pb)) {
    const order = (options.collation ?? compareCodepoints)(a.value, b.value);
    return { order: Math.sign(order), ordered: true };
  }
  if (pa !== pb) {
    throw new XPathError(
      "XPTY0004",
      `Cannot compare ${a.type.prefixedName} with ${b.type.prefixedName}`,
    );
  }
  if (pa === "boolean") {
    return { order: Number(a.value) - Number(b.value), ordered: true };
  }
  if (pa === "duration") return compareDurations(a, b);
  if (orderedTimes.has(pa) || unorderedTimes.has(pa)) {
    const timezone = options.implicitTimezone ?? 0;
    const order = timelineSeconds(a.value, timezone).compare(
      timelineSeconds(b.value, timezone),
    );
    return { order, ordered: orderedTimes.has(pa) };
  }
  if (pa === "hexBinary" || pa === "base64Binary") {
    return { order: compareBytes(a.value, b.value), ordered: true };
  }
  // xs:QName and xs:NOTATION: equality of namespace URI and local name
  const equal =
    a.value.namespaceURI === b.value.namespaceURI &&
    a.value.localName === b.value.localName;
  return { order: equal ? 0 : NaN, ordered: false };
}

/** Value comparison operators applied to an order (-1, 0, 1, NaN). */
export const orderTests = {
  eq: (order) => order === 0,
  ne: (order) => order !== 0,
  lt: (order) => order < 0,
  le: (order) => order <= 0,
  gt: (order) => order > 0,
  ge: (order) => order >= 0,
};

/**
 * Value comparison `a op b` of two atomic values (xs:untypedAtomic is
 * compared as xs:string). Empty and multi-item operands are the
 * evaluator's concern.
 * @param {import("./atomic.js").AtomicValue} a
 * @param {"eq"|"ne"|"lt"|"le"|"gt"|"ge"} op
 * @param {import("./atomic.js").AtomicValue} b
 * @param {CompareOptions} [options]
 * @returns {boolean}
 * @throws {XPathError} XPTY0004 when the types are not comparable with op
 */
export function valueCompare(a, op, b, options = {}) {
  const { order, ordered } = compareAtomic(a, b, options);
  if (!ordered && op !== "eq" && op !== "ne") {
    throw new XPathError(
      "XPTY0004",
      `${op} is not defined for ${a.type.prefixedName}`,
    );
  }
  return orderTests[op](order);
}

/**
 * Equality of two atomic values as in fn:deep-equal and
 * fn:distinct-values: incomparable types are unequal (no error) and NaN
 * equals NaN.
 * @param {import("./atomic.js").AtomicValue} a
 * @param {import("./atomic.js").AtomicValue} b
 * @param {CompareOptions} [options]
 * @returns {boolean}
 */
export function deepEqualAtomic(a, b, options = {}) {
  let order;
  try {
    ({ order } = compareAtomic(a, b, options));
  } catch (error) {
    if (!(error instanceof XPathError)) throw error;
    return false;
  }
  return order === 0 || (Number.isNaN(order) && isNaNValue(a) && isNaNValue(b));
}

/** @param {import("./atomic.js").AtomicValue} item @returns {boolean} */
function isNaNValue(item) {
  return typeof item.value === "number" && Number.isNaN(item.value);
}
