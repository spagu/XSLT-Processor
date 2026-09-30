/**
 * Shared end-to-end harness for the themed XSLT regression suites
 * (scoping, copying, result namespaces, ...). It uses the DOM under test
 * (see domEnvironment.test.js: jsdom, or xmldom with `DOM=xmldom`) and
 * compiles and runs stylesheets with a fresh {@link XsltEngine} per call.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { XsltEngine } from "./engine.js";
import { domEnvironment, parseXmlDocument } from "../domEnvironment.test.js";

/** Opening tag of an XSLT 1.0 stylesheet. */
export const XSL_OPEN =
  '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">';

/** The DOM environment under test (a JSDOM instance for jsdom). */
export const dom = domEnvironment;
globalThis.document ??= dom.window.document;
globalThis.DOMParser ??= dom.window.DOMParser;

/** Parse an XML string with the DOM under test. */
export const parseXML = parseXmlDocument;

/**
 * Wrap top-level declarations in a stylesheet with the given output method.
 *
 * @param {string} body - Top-level elements
 * @param {string} [method] - The xsl:output method
 * @param {string} [namespaces] - Extra namespace declarations
 * @returns {string} A complete stylesheet
 */
export function stylesheet(body, method = "text", namespaces = "") {
  return (
    `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" ${namespaces}>` +
    `<xsl:output method="${method}" omit-xml-declaration="yes"/>${body}</xsl:stylesheet>`
  );
}

/**
 * Compile a stylesheet into a new engine.
 *
 * @param {string} xsl - A complete stylesheet
 * @param {object} [options] - Options
 * @param {Object<string, string>} [options.imports] - Stylesheets by URI
 * @param {Object<string, *>} [options.params] - Global parameter values
 * @returns {XsltEngine} The compiled engine
 */
export function compile(xsl, { imports, params } = {}) {
  const engine = new XsltEngine();
  if (imports) engine.setStylesheetLoader((uri) => imports[uri]);
  for (const [name, value] of Object.entries(params ?? {})) {
    engine.setParameterValue(name, value);
  }
  engine.importStylesheet(parseXML(xsl), imports ? "http://x/main.xsl" : "");
  return engine;
}

/**
 * Compile a stylesheet and transform a document to a string.
 *
 * @param {string} xsl - A complete stylesheet
 * @param {string} [xml] - Source document markup
 * @param {object} [options] - See {@link compile}
 * @returns {string} The serialized result
 */
export function run(xsl, xml = "<d/>", options = {}) {
  return compile(xsl, options).transformToString(parseXML(xml));
}

describe("e2e harness", () => {
  it("runs a stylesheet end to end", () => {
    const xsl = stylesheet('<xsl:template match="/">ok</xsl:template>');
    assert.strictEqual(run(xsl), "ok");
    assert.ok(XSL_OPEN.startsWith("<xsl:stylesheet"));
  });

  it("passes global parameters and imports", () => {
    const xsl = stylesheet(
      '<xsl:import href="lib.xsl"/><xsl:param name="p"/><xsl:template match="/"><xsl:value-of select="$p"/></xsl:template>',
    );
    const imports = { "http://x/lib.xsl": stylesheet("") };
    assert.strictEqual(run(xsl, "<d/>", { imports, params: { p: "v" } }), "v");
  });
});
