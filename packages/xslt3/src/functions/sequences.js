/**
 * Functions on sequences (F&O 3.1 sections 14.1 to 14.2.6) that need no
 * node access: head, tail, insert-before, remove, reverse, subsequence,
 * unordered, index-of, distinct-values, the cardinality checks and
 * deep-equal. fn:empty, fn:exists and fn:count belong to the core library.
 *
 * @module @tradik/xslt3/functions/sequences
 */

import { XPathError } from "../errors.js";
import { compareAtomic, deepEqualAtomic } from "../xdm/compare.js";
import { DateTimeValue } from "../xdm/datetime.js";
import { timelineSeconds } from "../xdm/timeline.js";
import { isNumericType } from "../xdm/types.js";
import { collationArg } from "./collations.js";
import { deepEqualSequences } from "./deepEqual.js";
import { selectRange } from "./strings.js";
import { booleanItem, define, integerItem } from "./support.js";

/**
 * Comparison options for a collation argument and the context.
 * @param {Array<*>|undefined} collation
 * @param {object} context
 * @returns {{collation: Function, implicitTimezone: number, key: Function|null}}
 */
function compareOptions(collation, context) {
  const resolved = collationArg(collation, context);
  return {
    collation: resolved.compare,
    implicitTimezone: context.implicitTimezone ?? 0,
    key: resolved.key,
  };
}

/**
 * Bucket key of an atomic value for distinct-values: values that may be
 * equal share a key; equality is then checked with deepEqualAtomic.
 * @param {import("../xdm/atomic.js").AtomicValue} item
 * @param {object} options - From {@link compareOptions}
 * @returns {string}
 */
function bucketKey(item, options) {
  const { type, value } = item;
  const primitive = type.primitive.localName;
  // equal numbers of different types share the float nearest to them
  if (isNumericType(type)) return `n${Math.fround(Number(value.toString()))}`;
  if (["string", "anyURI", "untypedAtomic"].includes(primitive)) {
    return options.key ? `s${options.key(value)}` : "s";
  }
  if (primitive === "duration") return `d${value.seconds}`;
  if (value instanceof DateTimeValue) {
    return `${primitive}${timelineSeconds(value, options.implicitTimezone)}`;
  }
  return primitive;
}

/**
 * fn:distinct-values.
 * @param {Array<*>[]} args - [$arg, $collation?]
 * @param {object} context
 * @returns {Array<*>}
 */
function distinctValues([items, collation], context) {
  const options = compareOptions(collation, context);
  const buckets = new Map();
  const result = [];
  for (const item of items) {
    const key = bucketKey(item, options);
    const bucket = buckets.get(key) ?? [];
    if (!bucket.some((seen) => deepEqualAtomic(seen, item, options))) {
      bucket.push(item);
      buckets.set(key, bucket);
      result.push(item);
    }
  }
  return result;
}

/**
 * fn:index-of: positions of the items `eq` to the search value
 * (incomparable values and NaN are never equal).
 * @param {Array<*>[]} args - [$seq, $search, $collation?]
 * @param {object} context
 * @returns {Array<*>}
 */
function indexOf([items, [search], collation], context) {
  const options = compareOptions(collation, context);
  const positions = [];
  items.forEach((item, i) => {
    try {
      if (compareAtomic(item, search, options).order === 0) {
        positions.push(integerItem(i + 1));
      }
    } catch (error) {
      if (!(error instanceof XPathError)) throw error;
    }
  });
  return positions;
}

/**
 * Declares a cardinality check.
 * @param {string} local
 * @param {string} returns
 * @param {(n: number) => boolean} accept
 * @param {string} code - Error raised otherwise
 * @returns {import("./support.js").FunctionDefinition}
 */
const cardinality = (local, returns, accept, code) =>
  define(local, ["item()*"], returns, ([items]) => {
    if (!accept(items.length)) {
      throw new XPathError(code, `${local} called with ${items.length} items`);
    }
    return items;
  });

/** @param {Array<*>[]} args @returns {Array<*>} fn:subsequence */
const subsequence = ([items, [start], length]) =>
  items.slice(...selectRange(items.length, start.value, length?.[0].value));

/**
 * fn:deep-equal; nodes are compared by deepEqual.js, maps, arrays and
 * function items by the `context.deepEqualItem` hook.
 * @param {Array<*>[]} args - [$p1, $p2, $collation?]
 * @param {object} context
 * @returns {Array<*>}
 */
function deepEqual([a, b, collation], context) {
  const options = compareOptions(collation, context);
  options.deepEqualItem = context.deepEqualItem;
  return [booleanItem(deepEqualSequences(a, b, options))];
}

const ITEMS = "item()*";
const ATOMS = "xs:anyAtomicType*";

/** @type {import("./support.js").FunctionDefinition[]} */
export const sequenceFunctions = [
  define("head", [ITEMS], "item()?", ([items]) => items.slice(0, 1)),
  define("tail", [ITEMS], ITEMS, ([items]) => items.slice(1)),
  define(
    "insert-before",
    [ITEMS, "xs:integer", ITEMS],
    ITEMS,
    ([target, [position], inserts]) => {
      const p = position.value;
      const at =
        p < 1n ? 0 : p > BigInt(target.length) ? target.length : Number(p) - 1;
      return [...target.slice(0, at), ...inserts, ...target.slice(at)];
    },
  ),
  define("remove", [ITEMS, "xs:integer"], ITEMS, ([target, [position]]) =>
    target.filter((_item, i) => BigInt(i + 1) !== position.value),
  ),
  define("reverse", [ITEMS], ITEMS, ([items]) => [...items].reverse()),
  define("subsequence", [ITEMS, "xs:double"], ITEMS, subsequence),
  define("subsequence", [ITEMS, "xs:double", "xs:double"], ITEMS, subsequence),
  define("unordered", [ITEMS], ITEMS, ([items]) => items),
  define("index-of", [ATOMS, "xs:anyAtomicType"], "xs:integer*", indexOf),
  define(
    "index-of",
    [ATOMS, "xs:anyAtomicType", "xs:string"],
    "xs:integer*",
    indexOf,
  ),
  define("distinct-values", [ATOMS], ATOMS, distinctValues),
  define("distinct-values", [ATOMS, "xs:string"], ATOMS, distinctValues),
  cardinality("zero-or-one", "item()?", (n) => n <= 1, "FORG0003"),
  cardinality("one-or-more", "item()+", (n) => n >= 1, "FORG0004"),
  cardinality("exactly-one", "item()", (n) => n === 1, "FORG0005"),
  define("deep-equal", [ITEMS, ITEMS], "xs:boolean", deepEqual),
  define("deep-equal", [ITEMS, ITEMS, "xs:string"], "xs:boolean", deepEqual),
];
