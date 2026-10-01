/**
 * Aggregate functions (F&O 3.1 section 14.4): avg, max, min and sum.
 * xs:untypedAtomic values are cast to xs:double; numbers are promoted to a
 * common type; durations must all be xs:yearMonthDuration or all
 * xs:dayTimeDuration for sum and avg.
 *
 * @module @tradik/xslt3/functions/aggregates
 */

import { XPathError } from "../errors.js";
import { arithmetic } from "../xdm/arithmetic.js";
import { cast } from "../xdm/cast.js";
import { compareAtomic } from "../xdm/compare.js";
import { derivesFrom, isNumericType, types } from "../xdm/types.js";
import { collationArg } from "./collations.js";
import { define, integerItem } from "./support.js";

/** @param {string} message @returns {never} */
const invalid = (message) => {
  throw new XPathError("FORG0006", message);
};

const numericLevels = ["decimal", "float", "double"];

/**
 * Casts xs:untypedAtomic to xs:double, numbers to their common type and
 * xs:anyURI to xs:string when mixed with strings.
 * @param {Array<import("../xdm/atomic.js").AtomicValue>} items
 * @returns {Array<import("../xdm/atomic.js").AtomicValue>}
 */
export function promoteAll(items) {
  const values = items.map((item) =>
    item.type === types.untypedAtomic ? cast(item, types.double) : item,
  );
  const primitives = new Set(values.map((v) => v.type.primitive.localName));
  if (values.every((v) => isNumericType(v.type))) {
    const level = Math.max(
      ...[...primitives].map((p) => numericLevels.indexOf(p)),
    );
    if (level === 0) return values;
    const target = types[numericLevels[level]];
    return values.map((v) => cast(v, target));
  }
  if (primitives.has("anyURI") && primitives.has("string")) {
    return values.map((v) => cast(v, types.string));
  }
  return values;
}

/**
 * The kind of total a sum adds up, checking that all items share it.
 * @param {Array<import("../xdm/atomic.js").AtomicValue>} values
 * @throws {XPathError} FORG0006 for mixed or non-additive types
 */
function checkAdditive(values) {
  const kinds = new Set(
    values.map(({ type }) => {
      if (isNumericType(type)) return "numeric";
      if (derivesFrom(type, types.yearMonthDuration)) return "yearMonth";
      if (derivesFrom(type, types.dayTimeDuration)) return "dayTime";
      return invalid(`Cannot sum or average ${type.prefixedName} values`);
    }),
  );
  if (kinds.size > 1) invalid("Cannot sum or average values of mixed types");
}

/**
 * The sum of a non-empty sequence.
 * @param {Array<import("../xdm/atomic.js").AtomicValue>} items
 * @returns {import("../xdm/atomic.js").AtomicValue}
 */
function total(items) {
  const values = promoteAll(items);
  checkAdditive(values);
  return values.reduce((sum, value) => arithmetic(sum, "+", value));
}

/**
 * fn:max or fn:min.
 * @param {Array<*>[]} args - [$arg, $collation?]
 * @param {object} context
 * @param {number} direction - 1 for max, -1 for min
 * @returns {Array<*>}
 */
function extreme([items, collation], context, direction) {
  const options = {
    collation: collationArg(collation, context).compare,
    implicitTimezone: context.implicitTimezone ?? 0,
  };
  if (items.length === 0) return [];
  const values = promoteAll(items);
  const nan = values.find(
    (v) => typeof v.value === "number" && Number.isNaN(v.value),
  );
  let best = values[0];
  for (const value of values) {
    let result;
    try {
      result = compareAtomic(value, best, options);
    } catch {
      invalid("max and min need mutually comparable values");
    }
    if (!result.ordered) invalid(`${value.type.prefixedName} is not ordered`);
    if (result.order * direction > 0) best = value;
  }
  return [nan ?? best];
}

/**
 * fn:sum.
 * @param {Array<*>[]} args - [$arg, $zero?]
 * @returns {Array<*>}
 */
function sum([items, zero]) {
  if (items.length === 0) return zero ?? [integerItem(0)];
  return [total(items)];
}

const ATOMS = "xs:anyAtomicType*";
const ATOM_OPT = "xs:anyAtomicType?";

/** @type {import("./support.js").FunctionDefinition[]} */
export const aggregateFunctions = [
  define("avg", [ATOMS], ATOM_OPT, ([items]) =>
    items.length === 0
      ? []
      : [arithmetic(total(items), "div", integerItem(items.length))],
  ),
  define("max", [ATOMS], ATOM_OPT, (args, c) => extreme(args, c, 1)),
  define("max", [ATOMS, "xs:string"], ATOM_OPT, (args, c) =>
    extreme(args, c, 1),
  ),
  define("min", [ATOMS], ATOM_OPT, (args, c) => extreme(args, c, -1)),
  define("min", [ATOMS, "xs:string"], ATOM_OPT, (args, c) =>
    extreme(args, c, -1),
  ),
  define("sum", [ATOMS], "xs:anyAtomicType", sum),
  define("sum", [ATOMS, ATOM_OPT], ATOM_OPT, sum),
];
