/**
 * fn:sort (F&O 3.1 section 16.2.4): a stable sort on sort keys, which are
 * compared item by item (NaN first, a prefix before a longer key).
 *
 * @module @tradik/xslt3/functions/sort
 */

import { XPathError } from "../errors.js";
import { cast } from "../xdm/cast.js";
import { compareAtomic } from "../xdm/compare.js";
import { atomize } from "../xdm/nodes.js";
import { types } from "../xdm/types.js";
import { collationArg } from "./collations.js";

/** @param {*} value @returns {boolean} whether an atomic value is NaN */
const isNaNValue = (value) =>
  typeof value.value === "number" && Number.isNaN(value.value);

/**
 * Compares two atomic values for sorting.
 * @returns {number}
 */
function compareItems(a, b, options) {
  if (isNaNValue(a) || isNaNValue(b)) {
    return Number(isNaNValue(b)) - Number(isNaNValue(a));
  }
  const { order, ordered } = compareAtomic(a, b, options);
  if (!ordered && order !== 0) {
    throw new XPathError("XPTY0004", "Sort keys are not ordered");
  }
  return order;
}

/**
 * Compares two sort keys (sequences of atomic values).
 * @returns {number}
 */
export function compareKeys(a, b, options) {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const order = compareItems(a[i], b[i], options);
    if (order !== 0) return order;
  }
  return a.length - b.length;
}

/**
 * Sort key of an item: atomized, untyped values as strings.
 * @param {Array} sequence
 * @returns {Array}
 */
const sortKey = (sequence) =>
  atomize(sequence).map((v) =>
    v.type === types.untypedAtomic ? cast(v, types.string) : v,
  );

/**
 * Sorts values by their sort keys (stable).
 * @param {Array} values - Items (fn:sort) or members (array:sort)
 * @param {Array|undefined} collation - Collation argument
 * @param {*} f - Key function item, undefined for the values themselves
 * @param {object} context
 * @param {(value: *) => Array} asArgument - The argument of the key
 *   function for a value
 * @returns {Array} the values in order
 */
export function sortByKeys(values, collation, f, context, asArgument) {
  const options = {
    ...context.compareOptions,
    collation: collationArg(collation, context).compare,
  };
  const keyed = values.map((value) => ({
    value,
    key: sortKey(f ? f.invoke([asArgument(value)]) : asArgument(value)),
  }));
  keyed.sort((x, y) => compareKeys(x.key, y.key, options));
  return keyed.map(({ value }) => value);
}

/**
 * fn:sort.
 * @returns {Array}
 */
const sort = ([input, collation, key], context) =>
  sortByKeys(input, collation, key?.[0], context, (item) => [item]);

/** Function definitions. */
export const sortFunctions = [
  { local: "sort", params: ["item()*"], returns: "item()*", impl: sort },
  {
    local: "sort",
    params: ["item()*", "xs:string?"],
    returns: "item()*",
    impl: sort,
  },
  {
    local: "sort",
    params: ["item()*", "xs:string?", "function(item()) as xs:anyAtomicType*"],
    returns: "item()*",
    impl: sort,
  },
];
