/**
 * Functions on maps (F&O 3.1 section 17.1), in the namespace
 * http://www.w3.org/2005/xpath-functions/map.
 *
 * @module @tradik/xslt3/functions/maps
 */

import { XPathError } from "../errors.js";
import { XdmArray } from "../items/array.js";
import { XdmMap } from "../items/map.js";
import { isArray, isMap } from "../xdm/atomic.js";
import { booleanItem, integerItem, stringItem } from "../xpath/eval/atomics.js";
import { NS } from "./signatures.js";

const DUPLICATES = new Set([
  "use-first",
  "use-last",
  "use-any",
  "combine",
  "reject",
]);

/**
 * map:merge.
 * @param {XdmMap[]} maps
 * @param {XdmMap} [options]
 * @returns {XdmMap}
 */
function merge(maps, options) {
  const duplicates = options?.get(stringItem("duplicates"));
  let policy = "use-first";
  if (duplicates !== undefined) {
    const value = duplicates[0]?.value;
    if (duplicates.length !== 1 || typeof value !== "string") {
      throw new XPathError("XPTY0004", "duplicates must be an xs:string");
    }
    if (!DUPLICATES.has(value)) {
      throw new XPathError("FOJS0005", `Invalid duplicates option ${value}`);
    }
    policy = value;
  }
  const entries = new Map();
  for (const map of maps) {
    for (const [k, entry] of map.entries) {
      const existing = entries.get(k);
      if (!existing || policy === "use-last") entries.set(k, entry);
      else if (policy === "reject") {
        throw new XPathError("FOJS0003", "Duplicate key in map:merge");
      } else if (policy === "combine") {
        entries.set(k, {
          key: existing.key,
          value: [...existing.value, ...entry.value],
        });
      }
    }
  }
  return new XdmMap(entries);
}

/**
 * map:find: values of a key in maps nested in a sequence.
 * @param {Array} sequence
 * @param {*} key
 * @param {Array[]} found - Values are appended
 */
function find(sequence, key, found) {
  for (const item of sequence) {
    if (isMap(item)) {
      const value = item.get(key);
      if (value !== undefined) found.push(value);
      for (const entry of item.entries.values()) find(entry.value, key, found);
    } else if (isArray(item)) {
      for (const member of item.members) find(member, key, found);
    }
  }
}

/**
 * @param {string} local
 * @param {string[]} params
 * @param {string} returns
 * @param {Function} impl
 * @returns {object} a definition in the map namespace
 */
const mapFunction = (local, params, returns, impl) => ({
  namespace: NS.map,
  local,
  params,
  returns,
  impl,
});

/** Function definitions. */
export const mapFunctions = [
  mapFunction("size", ["map(*)"], "xs:integer", ([[map]]) => [
    integerItem(map.size),
  ]),
  mapFunction("keys", ["map(*)"], "xs:anyAtomicType*", ([[map]]) => map.keys()),
  mapFunction(
    "contains",
    ["map(*)", "xs:anyAtomicType"],
    "xs:boolean",
    ([[map], [key]]) => [booleanItem(map.has(key))],
  ),
  mapFunction(
    "get",
    ["map(*)", "xs:anyAtomicType"],
    "item()*",
    ([[map], [key]]) => map.get(key) ?? [],
  ),
  mapFunction(
    "put",
    ["map(*)", "xs:anyAtomicType", "item()*"],
    "map(*)",
    ([[map], [key], value]) => [map.put(key, value)],
  ),
  mapFunction(
    "remove",
    ["map(*)", "xs:anyAtomicType*"],
    "map(*)",
    ([[map], keys]) => [map.remove(keys)],
  ),
  mapFunction(
    "entry",
    ["xs:anyAtomicType", "item()*"],
    "map(*)",
    ([[key], value]) => [XdmMap.from([[key, value]])],
  ),
  mapFunction("merge", ["map(*)*"], "map(*)", ([maps]) => [merge(maps)]),
  mapFunction("merge", ["map(*)*", "map(*)"], "map(*)", ([maps, [options]]) => [
    merge(maps, options),
  ]),
  mapFunction(
    "for-each",
    ["map(*)", "function(xs:anyAtomicType, item()*) as item()*"],
    "item()*",
    ([[map], [f]]) =>
      [...map.entries.values()].flatMap(({ key, value }) =>
        f.invoke([[key], value]),
      ),
  ),
  mapFunction(
    "find",
    ["item()*", "xs:anyAtomicType"],
    "array(*)",
    ([sequence, [key]]) => {
      const found = [];
      find(sequence, key, found);
      return [new XdmArray(found)];
    },
  ),
];
