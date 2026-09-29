/**
 * Conformance runner - execution of a single case.
 *
 * Runs inside a worker thread (see worker.mjs) so that a hanging
 * transformation can be terminated. The DOM environment and the file
 * loaders are the ones of the `xslt` command line tool, so the suite
 * exercises the same code paths as real users.
 */

import { readFileSync, realpathSync } from "node:fs";
import { URL } from "node:url";
import { XSLTProcessor } from "../../src/XSLTProcessor.js";
import { decodeXml } from "../../bin/lib/decode.js";
import {
  createDocumentLoader,
  createStylesheetLoader,
  toBaseUri,
} from "../../bin/lib/loaders.js";
import {
  createDomEnvironment,
  parseDocument,
} from "../../bin/lib/transform.js";

/** Stylesheet parameters libxslt's runtest passes to every case. */
export const CASE_PARAMETERS = Object.freeze({
  test: "passed_value",
  test2: "passed_value2",
});

/** Matches the href pseudo-attribute of an xml-stylesheet PI. */
const STYLESHEET_HREF = /\bhref\s*=\s*(["'])(.*?)\1/;

/**
 * @typedef {Object} CaseOutcome
 * @property {string|null} output - Serialized result, null when the
 *   stylesheet or the transformation failed
 * @property {string|null} error - Failure message, null on success
 * @property {string[]} diagnostics - Messages written to the console
 *   (xsl:message, recoverable errors, warnings)
 * @property {boolean} indented - Whether the serializer may add or remove
 *   whitespace between tags (`indent="yes"` or HTML output)
 * @property {string|null} encoding - Effective xsl:output encoding, used to
 *   decode expected outputs that do not announce their encoding
 */

/** Start of an HTML output method result. */
const HTML_RESULT = /^(?:<!DOCTYPE[^>]*>\s*)?<html[\s>]/i;

/**
 * Tell whether a result was serialized with indentation allowed.
 *
 * `indent` defaults to `yes` for the HTML output method, which is also the
 * default method when the result starts with an `html` element.
 *
 * @param {object} settings - Effective xsl:output settings of the engine
 * @param {string} output - Serialized result
 * @returns {boolean} True for indented output
 */
export function isIndented(settings, output) {
  if (settings.indent === "yes" || settings.method === "html") return true;
  return settings.method == null && HTML_RESULT.test(output);
}

let domPromise = null;

/**
 * Create the shared jsdom environment once per worker.
 *
 * @returns {Promise<object>} The JSDOM instance
 */
function getDom() {
  domPromise ??= createDomEnvironment();
  return domPromise;
}

/**
 * Read and parse an XML file of the corpus.
 *
 * @param {object} dom - JSDOM instance
 * @param {string} path - Absolute file path
 * @param {string} label - Role of the file, used in errors
 * @returns {Document} Parsed document
 */
function loadDocument(dom, path, label) {
  return parseDocument(dom, decodeXml(readFileSync(path), path), label);
}

/**
 * Find an element by its `id` attribute, without relying on a DTD.
 *
 * @param {Document} doc - Document to search
 * @param {string} id - Wanted id
 * @returns {Element|null} The element, or null
 */
function findById(doc, id) {
  const walker = doc.createTreeWalker(doc, 1);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.getAttribute("id") === id) return node;
  }
  return null;
}

/**
 * Resolve the stylesheet of a standalone case (XSLT 1.0 section 2.7).
 *
 * @param {object} dom - JSDOM instance
 * @param {Document} sourceDoc - Source document holding the PI
 * @param {string} sourcePath - Absolute source path
 * @returns {{node: Node, uri: string}} Stylesheet node and its base URI
 * @throws {Error} When no usable xml-stylesheet PI is present
 */
function standaloneStylesheet(dom, sourceDoc, sourcePath) {
  const pi = [...sourceDoc.childNodes].find(
    (node) => node.nodeType === 7 && node.target === "xml-stylesheet",
  );
  const href = pi && STYLESHEET_HREF.exec(pi.data)?.[2];
  if (!href) throw new Error("No xml-stylesheet processing instruction");

  const uri = toBaseUri(sourcePath);
  if (href.startsWith("#")) {
    const node = findById(sourceDoc, href.slice(1));
    if (!node) throw new Error(`Embedded stylesheet ${href} not found`);
    return { node, uri };
  }
  const path = new URL(href, uri);
  return {
    node: loadDocument(dom, path.pathname, "stylesheet"),
    uri: path.href,
  };
}

/**
 * Collect console output during a callback instead of printing it.
 *
 * @param {string[]} sink - Receives one entry per console call
 * @param {() => *} callback - Code to run
 * @returns {*} The callback result
 */
function captureConsole(sink, callback) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  const record = (...args) =>
    sink.push(
      args
        .map((arg) => (arg instanceof Error ? arg.message : String(arg)))
        .join(" "),
    );
  Object.assign(console, { log: record, warn: record, error: record });
  try {
    return callback();
  } finally {
    Object.assign(console, saved);
  }
}

/**
 * Transform one conformance case.
 *
 * @param {import('./cases.mjs').ConformanceCase} testCase - Case to run
 * @param {string} baseDir - Directory every loaded file is confined to
 * @returns {Promise<CaseOutcome>} What the processor produced
 */
export async function runCase(testCase, baseDir) {
  const dom = await getDom();
  const root = realpathSync(baseDir);
  const diagnostics = [];
  let settings = {};

  try {
    const output = captureConsole(diagnostics, () => {
      const sourceDoc = loadDocument(dom, testCase.source, "source");
      const stylesheet = testCase.stylesheet
        ? {
            node: loadDocument(dom, testCase.stylesheet, "stylesheet"),
            uri: toBaseUri(realpathSync(testCase.stylesheet)),
          }
        : standaloneStylesheet(dom, sourceDoc, realpathSync(testCase.source));

      const processor = new XSLTProcessor();
      processor.setStylesheetLoader(createStylesheetLoader(root));
      processor.setDocumentLoader(createDocumentLoader(root, console.warn));
      processor.importStylesheet(stylesheet.node, stylesheet.uri);
      for (const [name, value] of Object.entries(CASE_PARAMETERS)) {
        processor.setParameter(null, name, value);
      }
      const result = processor.transformToString(sourceDoc);
      settings = processor.engine.outputSettings;
      return result;
    });
    if (output === null) {
      return {
        output: null,
        error: diagnostics.at(-1) ?? "transformation failed",
        diagnostics,
        indented: false,
        encoding: null,
      };
    }
    return {
      output,
      error: null,
      diagnostics,
      indented: isIndented(settings, output),
      encoding: settings.encoding ?? null,
    };
  } catch (error) {
    return {
      output: null,
      error: String(error?.message ?? error),
      diagnostics,
      indented: false,
      encoding: null,
    };
  }
}
