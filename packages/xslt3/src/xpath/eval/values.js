/**
 * Conversion of JavaScript values to XDM sequences, for variable values
 * and the context item given to the public API.
 *
 * | JavaScript | XDM |
 * |---|---|
 * | null, undefined | empty sequence |
 * | string | xs:string |
 * | number | xs:double |
 * | bigint | xs:integer |
 * | boolean | xs:boolean |
 * | Date | xs:dateTime (UTC) |
 * | Array | sequence of the converted elements (flattened) |
 * | Map, plain object | map with xs:string keys (Map keys converted) |
 * | DOM node, XDM item | itself |
 *
 * @module @tradik/xslt3/xpath/eval/values
 */

import { XdmMap } from "../../items/map.js";
import { AtomicValue, ITEM_KIND } from "../../xdm/atomic.js";
import { types } from "../../xdm/types.js";
import { dateTimeOf } from "./dynamicContext.js";

/**
 * Converts a JS value used as a single atomic map key.
 * @param {*} key
 * @returns {AtomicValue}
 */
function keyOf(key) {
  const [value] = toSequence(key);
  return value instanceof AtomicValue
    ? value
    : new AtomicValue(types.string, String(key));
}

/**
 * Converts a JS value to an XDM sequence.
 * @param {*} value
 * @returns {Array} the sequence
 */
export function toSequence(value) {
  if (value === null || value === undefined) return [];
  switch (typeof value) {
    case "string":
      return [new AtomicValue(types.string, value)];
    case "number":
      return [new AtomicValue(types.double, value)];
    case "bigint":
      return [new AtomicValue(types.integer, value)];
    case "boolean":
      return [new AtomicValue(types.boolean, value)];
    default:
      break;
  }
  if (Array.isArray(value)) return value.flatMap(toSequence);
  if (value instanceof AtomicValue || value[ITEM_KIND]) return [value];
  if (typeof value.nodeType === "number") return [value];
  if (value instanceof Date) {
    return [new AtomicValue(types.dateTime, dateTimeOf(value, 0))];
  }
  const entries = value instanceof Map ? [...value] : Object.entries(value);
  return [XdmMap.from(entries.map(([k, v]) => [keyOf(k), toSequence(v)]))];
}
