/**
 * The adapter of the @tradik/xslt3 engine: XPath compilation (parse stage:
 * syntax and static analysis), evaluation, source documents parsed with
 * @xmldom/xmldom, and a basic XML serialization of results.
 *
 * @module test-suites/lib/engineAdapter
 */

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DOMImplementation, DOMParser } from "@xmldom/xmldom";
import { confinePath } from "../../../../scripts/lib/fsSafety.mjs";
import { serializeXml } from "./serialize.mjs";
import { NotRunError } from "./assertions.mjs";
import { decodeXml } from "./xmlUtil.mjs";

/**
 * Parses an XML document and records its URI.
 *
 * @throws {Error} With the code FODC0002 when the text is not well-formed
 *
 * @param {string} text - Document text
 * @param {string} [uri] - Document URI
 * @returns {Document} The document
 */
export function parseXml(text, uri) {
  const errors = [];
  const parser = new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") errors.push(message);
    },
  });
  let document;
  try {
    document = parser.parseFromString(text, "text/xml");
  } catch (error) {
    errors.push(error.message);
  }
  if (errors.length) {
    throw Object.assign(new Error(`Invalid XML: ${errors[0]}`), {
      code: "FODC0002",
    });
  }
  // xmldom keeps the XML declaration as a processing instruction and the
  // whitespace around the document element as text nodes; XDM has neither
  for (const child of [...document.childNodes]) {
    if (
      child.nodeType === 3 ||
      (child.nodeType === 7 && child.target === "xml")
    ) {
      document.removeChild(child);
    }
  }
  if (uri) document.documentURI = uri;
  return document;
}

/**
 * Static options of the engine from a test context.
 *
 * @param {object} context - Static or dynamic context of the runner
 * @returns {object} Options of compileXPath
 */
function staticOptions(context) {
  const { variables = [] } = context;
  return {
    namespaces: context.namespaces ?? [],
    variables: Array.isArray(variables) ? variables : Object.keys(variables),
    baseUri: context.staticBaseUri,
    decimalFormats: context.decimalFormats ?? [],
  };
}

/**
 * Build the adapter.
 *
 * @param {{compileXPath: Function}} engine - The engine module
 * @returns {object} The adapter
 */
export function createEngineAdapter(engine) {
  /** @type {Map<string, Document>} documents by file, parsed once */
  const files = new Map();
  const loadFile = (file) => {
    let document = files.get(file);
    if (!document) {
      document = parseXml(
        decodeXml(readFileSync(file)),
        pathToFileURL(file).href,
      );
      files.set(file, document);
    }
    return document;
  };
  return {
    name: "xslt3",
    parse(expression, context) {
      engine.compileXPath(expression, staticOptions(context));
      return true;
    },
    evaluateXPath(expression, context) {
      const documents = context.documents ?? {};
      const documentLoader = (uri) => {
        const known = Object.entries(documents).find(
          ([key]) => key === uri || uri.endsWith(`/${key}`),
        );
        if (known) return known[1];
        if (uri.startsWith("file:")) {
          return loadFile(confinePath(fileURLToPath(uri)));
        }
        return null;
      };
      return engine
        .compileXPath(expression, staticOptions(context))
        .evaluate(context.contextItem, {
          variables: context.variables ?? {},
          documentLoader,
          createDocument: () =>
            new DOMImplementation().createDocument(null, null),
        });
    },
    loadDocument(source) {
      if (source.file) return loadFile(source.file);
      return parseXml(source.content ?? "", source.uri);
    },
    serialize(value, params = {}) {
      const method = params.method ?? "xml";
      if (method !== "xml") {
        throw new NotRunError(`serialization method ${method}`);
      }
      return serializeXml(value);
    },
  };
}
