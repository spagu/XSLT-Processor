/**
 * The adapter of the @tradik/xslt3 engine: XPath compilation (parse stage:
 * syntax and static analysis), evaluation, source documents parsed with
 * @xmldom/xmldom, and the serialization of results with the engine's
 * serializer (Serialization 3.1, every output method).
 *
 * @module test-suites/lib/engineAdapter
 */

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DOMImplementation, DOMParser } from "@xmldom/xmldom";
import { confinePath } from "../../../../scripts/lib/fsSafety.mjs";
import { serialize } from "../../src/serialize/index.js";
import { withByteOrderMark } from "./byteOrderMark.mjs";
import { createTransform, outputParams } from "./transformAdapter.mjs";
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
  // xmldom does not check characters: XML 1.0 Char only
  const bad = /[^\t\n\r\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u.exec(
    text,
  );
  if (bad) {
    errors.push(`character U+${bad[0].codePointAt(0).toString(16)}`);
  }
  const parser = new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") errors.push(message);
    },
  });
  let document;
  try {
    if (!errors.length) document = parser.parseFromString(text, "text/xml");
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
 * A text resource of the test environment, or a file: URI.
 *
 * @param {{uri: string, file: string, encoding?: string, mediaType?: string}[]} resources
 *   - Resources of the environment
 * @param {string} uri - Absolute URI
 * @returns {object|null} `{content, encoding, mediaType}`, null when absent
 */
function loadResource(resources, uri) {
  const resource = resources.find(
    (r) => r.uri === uri || uri.endsWith(`/${r.uri}`),
  );
  if (resource) {
    return {
      content: readFileSync(confinePath(resource.file)),
      encoding: resource.encoding,
      mediaType: resource.mediaType,
    };
  }
  if (uri.startsWith("file:")) {
    return readFileSync(confinePath(fileURLToPath(uri)));
  }
  return null;
}

/**
 * The documents of a collection of the test environment.
 *
 * @param {{uri?: string, sources: {file?: string}[]}[]} collections - Collections
 * @param {string|null} uri - Absolute URI, null for the default collection
 * @param {(file: string) => Document} loadFile - Document loader
 * @returns {Document[]|null} the documents, null when unknown
 */
function collectionItems(collections, uri, loadFile) {
  const collection = collections.find((c) =>
    uri === null
      ? !c.uri
      : Boolean(c.uri) && (c.uri === uri || uri.endsWith(`/${c.uri}`)),
  );
  if (!collection || collection.queries.length) return null;
  return collection.sources.map((source) => loadFile(source.file));
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
  const loadDocument = (source) => {
    if (source.file) return loadFile(source.file);
    return parseXml(source.content ?? "", source.uri);
  };
  const transform =
    typeof engine.compileStylesheet === "function"
      ? createTransform(engine, {
          loadFile,
          loadSource: loadDocument,
          evaluate: (expression, contextItem) =>
            engine.compileXPath(expression).evaluate(contextItem, {
              createDocument: () =>
                new DOMImplementation().createDocument(null, null),
            }),
        })
      : undefined;
  return {
    name: "xslt3",
    transform,
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
          textLoader: (uri) => loadResource(context.resources ?? [], uri),
          xmlParser: (text) => parseXml(text),
          collections: (uri) =>
            collectionItems(context.collections ?? [], uri, loadFile),
          createDocument: () =>
            new DOMImplementation().createDocument(null, null),
        });
    },
    loadDocument,
    // XQuery 3.1 defaults (Appendix C.3): no XML declaration
    serialize(value, params = {}) {
      // assert-serialization uses the stylesheet's output parameters;
      // assert-xml (which sets omit-xml-declaration) compares the tree
      const own = outputParams.get(value);
      // the result of a transformation: XSLT's defaults (an XML
      // declaration unless xsl:output omits it)
      if (own && !("omit-xml-declaration" in params)) {
        return withByteOrderMark(serialize(value, { ...params, ...own }), own);
      }
      return serialize(value, { "omit-xml-declaration": true, ...params });
    },
  };
}
