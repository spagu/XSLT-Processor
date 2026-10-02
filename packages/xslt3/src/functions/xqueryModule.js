/**
 * fn:load-xquery-module (F&O 3.1, "Dynamic loading"): there is no XQuery
 * processor, so every call raises FOQM0006 once its arguments are checked
 * against the signature.
 *
 * @module @tradik/xslt3/functions/xqueryModule
 */

import { XPathError } from "../errors.js";
import { define } from "./support.js";

/**
 * @returns {never}
 * @throws {XPathError} FOQM0006
 */
function noXQuery() {
  throw new XPathError("FOQM0006", "No XQuery processor is available");
}

/** Function definitions. */
export const xqueryModuleFunctions = [
  define("load-xquery-module", ["xs:string"], "map(*)", noXQuery),
  define("load-xquery-module", ["xs:string", "map(*)"], "map(*)", noXQuery),
];
