/**
 * fn:json-to-xml (F&O 3.1 section 17.5.3): JSON to the XML representation
 * of JSON, elements map, array, string, number, boolean and null in the
 * fn namespace, built in a new document (dynamic context hook
 * `createDocument`). A basic processor does not validate (validate=true
 * raises FOJS0004).
 *
 * @module @tradik/xslt3/functions/json/jsonToXml
 */

import { XPathError } from "../../errors.js";
import { setBaseUri } from "../baseUris.js";
import { define, FN_NAMESPACE } from "../support.js";
import { parseJsonText } from "./jsonParser.js";
import { stringDecoder } from "./jsonStrings.js";
import { jsonOptions } from "./parseJson.js";

const SPECS = {
  duplicates: {
    type: "xs:string",
    default: "retain",
    values: ["reject", "use-first", "retain"],
  },
  validate: { type: "xs:boolean", default: false },
};

/**
 * The JSON builder (see jsonParser.js) that makes the elements of the XML
 * representation while the text is parsed, with no intermediate tree.
 * @param {Document} document
 * @param {object} options - escape, duplicates and the string decoder
 * @returns {import("./jsonParser.js").JsonBuilder<Element>}
 */
function elementBuilder(document, options) {
  const element = (name, content) => {
    const result = document.createElementNS(FN_NAMESPACE, name);
    if (content) result.appendChild(document.createTextNode(content));
    return result;
  };
  return {
    object(entries) {
      const map = element("map");
      const seen = new Set();
      for (const [keyChars, child] of entries) {
        const key = options.decode(keyChars);
        if (seen.has(key) && options.duplicates !== "retain") {
          if (options.duplicates === "reject") {
            throw new XPathError("FOJS0003", `Duplicate key "${key}"`);
          }
          continue;
        }
        seen.add(key);
        child.setAttribute("key", key);
        if (options.escape && key.includes("\\")) {
          child.setAttribute("escaped-key", "true");
        }
        map.appendChild(child);
      }
      return map;
    },
    array(members) {
      const array = element("array");
      for (const member of members) array.appendChild(member);
      return array;
    },
    string(chars) {
      const content = options.decode(chars);
      const result = element("string", content);
      if (options.escape && content.includes("\\")) {
        result.setAttribute("escaped", "true");
      }
      return result;
    },
    number: (text) => element("number", text),
    boolean: (value) => element("boolean", String(value)),
    null: () => element("null"),
  };
}

/**
 * fn:json-to-xml of a string.
 * @param {string} json
 * @param {Array|undefined} optionsArg
 * @param {{createDocument: () => Document, staticBaseUri?: string}} context
 * @returns {Array} the document node, whose base URI is the static base URI
 */
function jsonToXml(json, optionsArg, context) {
  const options = jsonOptions(optionsArg, SPECS);
  if (options.validate) {
    throw new XPathError(
      "FOJS0004",
      "validate=true needs a schema-aware processor",
    );
  }
  const document = context.createDocument();
  const builder = elementBuilder(document, {
    ...options,
    decode: stringDecoder(options),
  });
  document.appendChild(parseJsonText(json, builder));
  return [setBaseUri(document, context.staticBaseUri)];
}

/** Function definitions. */
export const jsonToXmlFunctions = [
  define("json-to-xml", ["xs:string?"], "document-node()?", ([json], c) =>
    json.length ? jsonToXml(json[0].value, undefined, c) : [],
  ),
  define(
    "json-to-xml",
    ["xs:string?", "map(*)"],
    "document-node()?",
    ([json, options], c) =>
      json.length ? jsonToXml(json[0].value, options, c) : [],
  ),
];
