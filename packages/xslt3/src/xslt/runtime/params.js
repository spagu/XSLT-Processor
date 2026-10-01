/**
 * Names and values given to the API: parameters by name, template and
 * function names.
 *
 * @module @tradik/xslt3/xslt/runtime/params
 */

import { toSequence } from "../../xpath/eval/values.js";

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
 * Normalizes parameters given by name to Clark names with XDM values
 * (JavaScript values are converted, see xpath/eval/values.js).
 * @param {object|Map|undefined} params
 * @returns {Map<string, Array>}
 */
export function normalizeParams(params) {
  const result = new Map();
  const entries =
    params instanceof Map ? [...params] : Object.entries(params ?? {});
  for (const [name, value] of entries) {
    result.set(clarkName(name), toSequence(value));
  }
  return result;
}
