/**
 * fn:serialize (F&O 3.1 section 14.6.3): the serialization of a sequence
 * as a string, with parameters given as an output:serialization-parameters
 * element or as a map. The defaults are those of the F&O table: the xml
 * method, no indentation, and no XML declaration.
 *
 * @module @tradik/xslt3/functions/serializeFunction
 */

import { XPathError } from "../errors.js";
import { serialize } from "../serialize/index.js";
import { parametersFromElement } from "../serialize/params/fromElement.js";
import { parametersFromMap } from "../serialize/params/fromMap.js";
import { isMap, isNode } from "../xdm/index.js";
import { define, stringItem } from "./support.js";

/** Defaults of fn:serialize that differ from the serializer's. */
const FN_DEFAULTS = Object.freeze({ "omit-xml-declaration": true });

/**
 * The parameters of the optional second argument.
 * @param {*} [options] - Element, map or undefined
 * @returns {Record<string, *>}
 * @throws {XPathError} XPTY0004 for other items
 */
function parametersOf(options) {
  if (options === undefined) return {};
  if (isMap(options)) return parametersFromMap(options);
  if (isNode(options)) return parametersFromElement(options);
  throw new XPathError(
    "XPTY0004",
    "The parameters of fn:serialize must be an element or a map",
  );
}

/**
 * @param {Array} sequence
 * @param {*} [options]
 * @returns {Array} the serialization as an xs:string
 */
const serializeSequence = (sequence, options) => [
  stringItem(serialize(sequence, { ...FN_DEFAULTS, ...parametersOf(options) })),
];

/** fn:serialize#1 and fn:serialize#2. */
export const serializeFunctions = [
  define("serialize", ["item()*"], "xs:string", ([arg]) =>
    serializeSequence(arg),
  ),
  define("serialize", ["item()*", "item()?"], "xs:string", ([arg, options]) =>
    serializeSequence(arg, options[0]),
  ),
];
