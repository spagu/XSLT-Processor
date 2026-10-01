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
 * Builds the element of a JSON value.
 * @param {Document} document
 * @param {import("./jsonParser.js").JsonValue} value
 * @param {object} options - escape, duplicates and the string decoder
 * @returns {Element}
 */
function build(document, value, options) {
  const name = value.kind === "object" ? "map" : value.kind;
  const element = document.createElementNS(FN_NAMESPACE, name);
  const text = (content) =>
    element.appendChild(document.createTextNode(content));
  switch (value.kind) {
    case "object": {
      const seen = new Set();
      for (const [keyChars, member] of value.entries) {
        const key = options.decode(keyChars);
        if (seen.has(key) && options.duplicates !== "retain") {
          if (options.duplicates === "reject") {
            throw new XPathError("FOJS0003", `Duplicate key "${key}"`);
          }
          continue;
        }
        seen.add(key);
        const child = build(document, member, options);
        child.setAttribute("key", key);
        if (options.escape && key.includes("\\")) {
          child.setAttribute("escaped-key", "true");
        }
        element.appendChild(child);
      }
      break;
    }
    case "array":
      for (const member of value.members) {
        element.appendChild(build(document, member, options));
      }
      break;
    case "string": {
      const content = options.decode(value.chars);
      if (options.escape && content.includes("\\")) {
        element.setAttribute("escaped", "true");
      }
      if (content) text(content);
      break;
    }
    case "number":
      text(value.text);
      break;
    case "boolean":
      text(String(value.value));
      break;
  }
  return element;
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
  const value = parseJsonText(json);
  const document = context.createDocument();
  document.appendChild(
    build(document, value, { ...options, decode: stringDecoder(options) }),
  );
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
