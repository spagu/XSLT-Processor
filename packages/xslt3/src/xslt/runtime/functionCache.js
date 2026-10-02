/**
 * Memoized stylesheet functions (XSLT 3.0 section 10.3.2, cache="yes" and
 * new-each-time="no"): a call with the same arguments as an earlier one
 * of the transformation returns the earlier result. Atomic values are
 * compared by type and value, nodes and other items by identity.
 *
 * @module @tradik/xslt3/xslt/runtime/functionCache
 */

import { isAtomic } from "../../xdm/atomic.js";
import { canonicalString } from "../../xdm/lexical.js";

/**
 * The value of an atomic item as a string: canonical, except for QNames
 * (their namespace, not their prefix).
 * @param {import("../../xdm/atomic.js").AtomicValue} item
 * @returns {string}
 */
function valueKey(item) {
  const { namespaceURI, localName } = item.value ?? {};
  return localName === undefined
    ? canonicalString(item)
    : `{${namespaceURI}}${localName}`;
}

/**
 * The key of a list of arguments.
 * @param {Array<Array>} args - Converted argument values
 * @param {object} tx - The transformation (numbers the other items)
 * @returns {string}
 */
function argumentsKey(args, tx) {
  tx.itemIds ??= { ids: new WeakMap(), next: 0 };
  const { ids } = tx.itemIds;
  const idOf = (item) => {
    if (!ids.has(item)) ids.set(item, tx.itemIds.next++);
    return ids.get(item);
  };
  return JSON.stringify(
    args.map((value) =>
      value.map((item) =>
        isAtomic(item) ? [item.type.name, valueKey(item)] : idOf(item),
      ),
    ),
  );
}

/**
 * Calls a function through its cache.
 * @param {object} compiled - The compiled function (its cache key)
 * @param {Array<Array>} args - Converted argument values
 * @param {object} tx - The transformation
 * @param {() => Array} call - Computes the result
 * @returns {Array}
 */
export function cachedCall(compiled, args, tx, call) {
  tx.functionCaches ??= new Map();
  let cache = tx.functionCaches.get(compiled);
  if (!cache) tx.functionCaches.set(compiled, (cache = new Map()));
  const key = argumentsKey(args, tx);
  if (cache.has(key)) return cache.get(key);
  const result = call();
  cache.set(key, result);
  return result;
}
