/**
 * The JSON functions of F&O 3.1 section 17.5: fn:parse-json, fn:json-doc,
 * fn:json-to-xml and fn:xml-to-json.
 *
 * @module @tradik/xslt3/functions/json
 */

import { jsonToXmlFunctions } from "./jsonToXml.js";
import { parseJsonFunctions } from "./parseJson.js";
import { xmlToJsonFunctions } from "./xmlToJson.js";

/** Function definitions. */
export const jsonFunctions = [
  ...parseJsonFunctions,
  ...jsonToXmlFunctions,
  ...xmlToJsonFunctions,
];
