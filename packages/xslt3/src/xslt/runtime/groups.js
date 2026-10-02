/**
 * The groups of xsl:for-each-group (XSLT 3.0 section 14): by grouping
 * keys (group-by, group-adjacent, single or composite keys) and by
 * patterns (group-starting-with, group-ending-with).
 *
 * @module @tradik/xslt3/xslt/runtime/groups
 */

import { atomize } from "../../xdm/nodes.js";
import { xsltError } from "../names.js";
import { patternMatches } from "../patterns/compile.js";
import { comparisonKey } from "./atomicKeys.js";
import { withFocus } from "./context.js";

/**
 * A group in the making.
 * @typedef {object} Group
 * @property {Array} items - Its population, in order
 * @property {Array|undefined} key - Its grouping key
 * @property {string} [keyString] - The key compared
 */

/**
 * The grouping keys of an item, each with the string it is compared by:
 * one per value, or one for the whole sequence of a composite key.
 * @param {Array} values - Atomized key values
 * @param {object} collation
 * @param {boolean} composite
 * @returns {Array<{key: Array, keyString: string}>}
 */
function keysOf(values, collation, composite) {
  const strings = values.map((value) => comparisonKey(value, collation));
  if (composite) return [{ key: values, keyString: JSON.stringify(strings) }];
  return values.map((value, i) => ({ key: [value], keyString: strings[i] }));
}

/**
 * Groups by keys (group-by, group-adjacent).
 * @param {Array} items
 * @param {(xc: object) => Array} evaluateKey - Evaluates the key expression
 * @param {object} xc
 * @param {{adjacent: boolean, collation: object, composite: boolean}} how
 * @returns {Group[]}
 * @throws {import("../../errors.js").XPathError} XTTE1100 for an
 *   adjacent key that is not a single value
 */
export function groupByKeys(items, evaluateKey, xc, how) {
  const { adjacent, collation, composite } = how;
  const groups = [];
  const byKey = new Map();
  items.forEach((item, i) => {
    const values = atomize(
      evaluateKey(withFocus(xc, item, i + 1, items.length)),
    );
    if (adjacent && !composite && values.length !== 1) {
      throw xsltError("XTTE1100", "A grouping key must be a single value");
    }
    const keys = keysOf(values, collation, composite);
    if (adjacent) {
      const [{ key, keyString }] = keys;
      const last = groups.at(-1);
      if (last && last.keyString === keyString) last.items.push(item);
      else groups.push({ items: [item], key, keyString });
      return;
    }
    const seen = new Set();
    for (const { key, keyString } of keys) {
      if (seen.has(keyString)) continue;
      seen.add(keyString);
      let group = byKey.get(keyString);
      if (!group) {
        group = { items: [], key };
        byKey.set(keyString, group);
        groups.push(group);
      }
      group.items.push(item);
    }
  });
  return groups;
}

/**
 * Groups by patterns (group-starting-with, group-ending-with); in XSLT 3.0
 * the population may hold any items.
 * @param {Array} items
 * @param {object} pattern - Compiled pattern
 * @param {object} xc
 * @param {boolean} starting - group-starting-with
 * @returns {Group[]}
 */
export function groupByPattern(items, pattern, xc, starting) {
  const groups = [];
  let current = null;
  items.forEach((item, i) => {
    const matches = patternMatches(
      pattern,
      item,
      withFocus(xc, item, i + 1, items.length),
    );
    if (!current || (starting && matches && current.items.length > 0)) {
      current = { items: [], key: undefined };
      groups.push(current);
    }
    current.items.push(item);
    if (!starting && matches) current = null;
  });
  return groups;
}
