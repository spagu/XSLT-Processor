/**
 * Option maps (F&O 3.1 section 1.5, "Options"): the `$options` argument
 * of fn:parse-json, fn:json-to-xml, fn:xml-to-json... Each known option
 * is converted to its declared type with the function conversion rules
 * (XPTY0004 when it cannot be), checked against its allowed values, and
 * defaulted when absent; unknown options are ignored.
 *
 * @module @tradik/xslt3/functions/options
 */

import { XPathError } from "../errors.js";
import { stringItem } from "../xpath/eval/atomics.js";
import { coerce } from "../xpath/eval/coercion.js";
import { sequenceTypeOf } from "../xpath/eval/functionItems.js";

/**
 * Declaration of one option.
 * @typedef {object} OptionSpec
 * @property {string} type - Sequence type of the value, e.g. "xs:boolean"
 * @property {*} [default] - Value when the option is absent
 * @property {string[]} [values] - Allowed values of a string option
 */

/**
 * Reads an option map.
 * @param {import("../items/map.js").XdmMap|undefined} map - The options
 *   argument, undefined for the arity without it
 * @param {Record<string, OptionSpec>} specs - Known options by key
 * @param {string} invalidCode - Error code of a value outside `values`
 *   (FOJS0005 for the JSON functions)
 * @returns {Record<string, *>} option values by key: the JS value of
 *   single atomic values (boolean, string), the item itself for functions,
 *   `undefined` for absent options without default
 * @throws {XPathError} XPTY0004 for a value of the wrong type,
 *   `invalidCode` for a value that is not allowed
 */
export function readOptions(map, specs, invalidCode) {
  const result = {};
  for (const [key, spec] of Object.entries(specs)) {
    const value = map?.get(stringItem(key));
    if (value === undefined) {
      result[key] = spec.default;
      continue;
    }
    const [item] = coerce(value, sequenceTypeOf(spec.type), {
      what: `option "${key}"`,
    });
    const plain = item?.value === undefined ? item : item.value;
    if (spec.values && !spec.values.includes(plain)) {
      throw new XPathError(
        invalidCode,
        `Invalid value "${plain}" of option "${key}"`,
      );
    }
    result[key] = plain;
  }
  return result;
}
