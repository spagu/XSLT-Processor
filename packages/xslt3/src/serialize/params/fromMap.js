/**
 * Serialization parameters given as a map (F&O 3.1 section 14.6.3): the
 * keys are parameter names (xs:string), the values are converted to the
 * type of each parameter with the function conversion rules (XPTY0004
 * when they do not fit). Entries with other keys (QNames, unknown names)
 * are ignored.
 *
 * | Kind         | Type                       |
 * |--------------|----------------------------|
 * | boolean      | xs:boolean?                |
 * | string       | xs:string?                 |
 * | decimal      | xs:decimal?                |
 * | qnames       | xs:QName*                  |
 * | method       | (xs:string \| xs:QName)?   |
 * | standalone   | xs:boolean? (empty: omit)  |
 * | characterMap | map(xs:string, xs:string)? |
 *
 * @module @tradik/xslt3/serialize/params/fromMap
 */

import { XPathError } from "../../errors.js";
import { atomize, cast, derivesFrom, isMap } from "../../xdm/index.js";
import { PARAMETER_KINDS } from "./names.js";

/**
 * @param {string} name
 * @returns {XPathError} XPTY0004
 */
const wrongType = (name) =>
  new XPathError("XPTY0004", `Wrong type for serialization parameter ${name}`);

/**
 * @param {import("../../xdm/atomic.js").AtomicValue} item
 * @param {string} type - Local name of an xs: type
 * @returns {boolean} whether the item is an instance of the type
 */
const isA = (item, type) => derivesFrom(item.type, type);

/**
 * Converts one atomic value to a type: instances are kept, untyped values
 * are cast, xs:anyURI is promoted to xs:string.
 * @param {string} name - Parameter name
 * @param {import("../../xdm/atomic.js").AtomicValue} item
 * @param {string} type
 * @returns {*} the value
 */
function convertAtomic(name, item, type) {
  if (isA(item, type)) return item.value;
  if (type === "string" && isA(item, "anyURI")) return item.value;
  if (isA(item, "untypedAtomic") && type !== "QName") {
    try {
      return cast(item, type).value;
    } catch {
      throw wrongType(name);
    }
  }
  throw wrongType(name);
}

/**
 * @param {string} name
 * @param {Array} value
 * @returns {Map<string, string>} the character map
 */
function characterMapValue(name, value) {
  if (value.length !== 1 || !isMap(value[0])) throw wrongType(name);
  const map = new Map();
  for (const { key, value: replacement } of value[0].entries.values()) {
    const [item] = replacement;
    if (
      !isA(key, "string") ||
      replacement.length !== 1 ||
      !isA(item, "string")
    ) {
      throw wrongType(name);
    }
    map.set(key.value, item.value);
  }
  return map;
}

/**
 * Converts the value of one parameter.
 * @param {string} name - Parameter name
 * @param {Array} value - Entry value
 * @returns {*} the value for the API, undefined when absent
 */
function parameterValue(name, value) {
  const kind = PARAMETER_KINDS[name];
  if (kind === "characterMap") {
    return value.length ? characterMapValue(name, value) : undefined;
  }
  const items = atomize(value);
  if (kind === "qnames") {
    return items.map((item) => convertAtomic(name, item, "QName"));
  }
  if (items.length > 1) throw wrongType(name);
  if (!items.length) return kind === "standalone" ? null : undefined;
  const [item] = items;
  switch (kind) {
    case "boolean":
    case "standalone":
      return convertAtomic(name, item, "boolean");
    case "decimal":
      return convertAtomic(name, item, "decimal");
    case "method":
      return isA(item, "QName")
        ? item.value
        : convertAtomic(name, item, "string");
    default:
      return convertAtomic(name, item, "string");
  }
}

/**
 * Reads serialization parameters from a map.
 * @param {import("../../items/map.js").XdmMap} map
 * @returns {Record<string, *>} parameters by hyphenated name
 */
export function parametersFromMap(map) {
  const params = {};
  for (const { key, value } of map.entries.values()) {
    if (!isA(key, "string") || !PARAMETER_KINDS[key.value]) continue;
    const converted = parameterValue(key.value, value);
    if (converted !== undefined) params[key.value] = converted;
  }
  return params;
}
