/**
 * XSLT Processor CLI - Transformation Helpers
 *
 * DOM environment setup, document parsing and the transformation itself.
 * Output is serialized through XSLTProcessor#transformToString so that the
 * xsl:output settings of the stylesheet are honored.
 */

"use strict";

import { XSLTProcessor } from "../../src/XSLTProcessor.js";
import {
  createDocumentLoader,
  createStylesheetLoader,
  toBaseUri,
} from "./loaders.js";

/** Message shown when the optional jsdom peer dependency is missing. */
export const JSDOM_MISSING_MESSAGE =
  "The xslt command needs jsdom, an optional peer dependency that is not installed. " +
  "Install it next to this package: npm install -g jsdom (global install) " +
  "or npm install jsdom (project install).";

/**
 * Load jsdom, turning a missing package into an actionable error.
 *
 * jsdom is an optional peer dependency: the library itself has no runtime
 * dependencies and only the command line tool needs a DOM implementation.
 *
 * @param {(specifier: string) => Promise<object>} [importer] - Module loader (for tests)
 * @returns {Promise<object>} The jsdom module
 * @throws {Error} When jsdom is not installed
 */
export async function loadJsdom(importer = (specifier) => import(specifier)) {
  try {
    return await importer("jsdom");
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      throw new Error(JSDOM_MISSING_MESSAGE, { cause: error });
    }
    throw error;
  }
}

/**
 * Create a JSDOM based DOM environment and expose it globally.
 *
 * The XSLT engine builds its result documents through the global `document`,
 * so the globals have to be installed before transforming.
 *
 * @returns {Promise<object>} The created JSDOM instance
 * @throws {Error} When jsdom is not installed
 */
export async function createDomEnvironment() {
  const { JSDOM } = await loadJsdom();
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    contentType: "text/html",
  });

  globalThis.document = dom.window.document;
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.XMLSerializer = dom.window.XMLSerializer;

  return dom;
}

/**
 * Parse an XML string, reporting parser errors as exceptions.
 *
 * @param {JSDOM} dom - DOM environment
 * @param {string} content - XML source text
 * @param {string} label - Human readable document label used in errors
 * @returns {Document} Parsed document
 */
export function parseDocument(dom, content, label) {
  const doc = new dom.window.DOMParser().parseFromString(
    content,
    "application/xml",
  );

  const error = doc.querySelector("parsererror");
  if (error) {
    throw new Error(`Error parsing ${label}: ${error.textContent}`);
  }

  return doc;
}

/**
 * Override the stylesheet xsl:output settings from the command line flags.
 *
 * @param {XSLTProcessor} processor - Processor with an imported stylesheet
 * @param {object} values - Parsed command line option values
 * @returns {object} The effective output settings
 */
export function applyOutputOverrides(processor, values) {
  const settings = processor.engine.outputSettings;

  if (values.format || values.indent) {
    settings.indent = "yes";
  }
  if (values.method) {
    settings.method = values.method;
  }
  if (values["no-declaration"]) {
    settings.omitXmlDeclaration = "yes";
  }

  return settings;
}

/**
 * Run a transformation and serialize its result.
 *
 * @param {object} options - Transformation inputs
 * @param {JSDOM} options.dom - DOM environment
 * @param {string} options.xmlContent - XML source text
 * @param {string} options.xsltContent - XSLT stylesheet text
 * @param {Record<string, string>} options.params - Stylesheet parameters
 * @param {object} options.values - Parsed command line option values
 * @param {string} [options.xsltFile] - Canonical stylesheet path; enables
 *   xsl:include, xsl:import and document() relative to it
 * @param {string} [options.baseDir] - Canonical base directory every loaded
 *   file is confined to (required together with xsltFile)
 * @param {(message: string) => void} [options.warn] - Warning sink for document()
 * @returns {string} The serialized transformation result
 */
export function runTransformation({
  dom,
  xmlContent,
  xsltContent,
  params,
  values,
  xsltFile,
  baseDir,
  warn,
}) {
  const xmlDoc = parseDocument(dom, xmlContent, "XML");
  const xsltDoc = parseDocument(dom, xsltContent, "XSLT");

  const processor = new XSLTProcessor();
  if (xsltFile) {
    processor.setStylesheetLoader(createStylesheetLoader(baseDir));
    processor.setDocumentLoader(createDocumentLoader(baseDir, warn));
  }
  processor.importStylesheet(xsltDoc, xsltFile && toBaseUri(xsltFile));

  for (const [name, value] of Object.entries(params)) {
    processor.setParameter(null, name, value);
  }

  applyOutputOverrides(processor, values);

  const output = processor.transformToString(xmlDoc);
  if (output === null) {
    throw new Error("Transformation failed");
  }

  return output;
}
