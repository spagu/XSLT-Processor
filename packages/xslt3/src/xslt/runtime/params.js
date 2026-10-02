/**
 * Names and values given to the API: parameters by name, template and
 * function names.
 *
 * @module @tradik/xslt3/xslt/runtime/params
 */

import { toSequence } from "../../xpath/eval/values.js";
import { AtomicValue } from "../../xdm/atomic.js";
import { types } from "../../xdm/types.js";

/**
 * The Clark name of a name given to the API: `local` (no namespace),
 * `Q{uri}local` or `{uri}local`.
 * @param {string} name
 * @returns {string} `{uri}local`
 */
export function clarkName(name) {
  if (name.startsWith("Q{")) return name.slice(1);
  return name.startsWith("{") ? name : `{}${name}`;
}

/**
 * An xs:untypedAtomic value, for parameters that should convert to the
 * declared type of the parameter (as a string from a command line does)
 * instead of being checked as an xs:string.
 * @param {*} value - Converted to a string
 * @returns {AtomicValue}
 */
export const untypedAtomic = (value) =>
  new AtomicValue(types.untypedAtomic, String(value));

/**
 * A parameter value whose JavaScript strings become xs:untypedAtomic.
 * @param {*} value
 * @returns {*}
 */
const untypedStrings = (value) => {
  if (typeof value === "string") return untypedAtomic(value);
  return Array.isArray(value) ? value.map(untypedStrings) : value;
};

/**
 * Normalizes parameters given by name to Clark names with XDM values
 * (JavaScript values are converted, see xpath/eval/values.js).
 * @param {object|Map|undefined} params
 * @param {boolean} [asUntyped] - JavaScript strings are xs:untypedAtomic
 * @returns {Map<string, Array>}
 */
export function normalizeParams(params, asUntyped = false) {
  const result = new Map();
  const entries =
    params instanceof Map ? [...params] : Object.entries(params ?? {});
  for (const [name, value] of entries) {
    const converted = asUntyped ? untypedStrings(value) : value;
    result.set(clarkName(name), toSequence(converted));
  }
  return result;
}
