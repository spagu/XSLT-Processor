/**
 * EXSLT common module (http://exslt.org/common), following libexslt
 * `common.c`. `exsl:node-set()` lives in `../functions.js` next to its
 * `msxsl:node-set()` alias; this module adds `exsl:object-type()`.
 */

"use strict";

import { expandedFunctionName } from "../../xpath/evaluator.js";
import { EXSLT_COMMON, checkArity } from "./arguments.js";

/** Node type of a DocumentFragment, how this engine holds a result tree fragment. */
const DOCUMENT_FRAGMENT_NODE = 11;

/**
 * The EXSLT type name of an evaluated value.
 *
 * @param {*} value - An evaluated XPath value
 * @returns {string} "string", "number", "boolean", "node-set" or "RTF"
 * @throws {TypeError} For a value that is not an XPath object
 */
export function objectType(value) {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (value?.nodeType === DOCUMENT_FRAGMENT_NODE) return "RTF";
  if (Array.isArray(value) || value?.nodeType) return "node-set";
  throw new TypeError("exsl:object-type() invalid argument");
}

/**
 * Build the EXSLT common functions implemented here.
 *
 * @param {import('../../xpath/evaluator.js').XPathEvaluator} evaluator - Evaluates the arguments
 * @returns {Object<string, Function>} Functions keyed by expanded name
 */
export function createCommonFunctions(evaluator) {
  return {
    [expandedFunctionName(EXSLT_COMMON, "object-type")]: (args, ctx) => {
      checkArity("exsl:object-type", args, 1);
      return objectType(evaluator.evaluate(args[0], ctx));
    },
  };
}
