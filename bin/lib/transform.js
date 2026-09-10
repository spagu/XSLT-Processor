/**
 * XSLT Processor CLI - Transformation Helpers
 *
 * DOM environment setup, document parsing and the transformation itself.
 * Output is serialized through XSLTProcessor#transformToString so that the
 * xsl:output settings of the stylesheet are honored.
 */

"use strict";

import { JSDOM } from "jsdom";
import { XSLTProcessor } from "../../src/XSLTProcessor.js";

/**
 * Create a JSDOM based DOM environment and expose it globally.
 *
 * The XSLT engine builds its result documents through the global `document`,
 * so the globals have to be installed before transforming.
 *
 * @returns {JSDOM} The created JSDOM instance
 */
export function createDomEnvironment() {
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
  const settings = processor._engine.outputSettings;

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
 * @returns {string} The serialized transformation result
 */
export function runTransformation({
  dom,
  xmlContent,
  xsltContent,
  params,
  values,
}) {
  const xmlDoc = parseDocument(dom, xmlContent, "XML");
  const xsltDoc = parseDocument(dom, xsltContent, "XSLT");

  const processor = new XSLTProcessor();
  processor.importStylesheet(xsltDoc);

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
