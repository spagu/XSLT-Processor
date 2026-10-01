// Helpers shared by the tests of the XSLT engine: parse XML, wrap a
// stylesheet body, run a transformation and show its result, get the
// code of the error it raises. (A .test.js file, so it is neither
// published nor counted in coverage.)

import assert from "node:assert/strict";
import { DOMImplementation, DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { isAtomic } from "../xdm/atomic.js";
import { canonicalString } from "../xdm/lexical.js";
import { compileStylesheet } from "./api.js";

/** The XSLT namespace. */
export const XSL = "http://www.w3.org/1999/XSL/Transform";

/**
 * Parses an XML document with @xmldom/xmldom.
 * @param {string} text
 * @returns {Document}
 */
export const parse = (text) =>
  new DOMParser().parseFromString(text, "text/xml");

/** @returns {Document} an empty document */
export const createDocument = () =>
  new DOMImplementation().createDocument(null, null);

/**
 * A stylesheet around declarations.
 * @param {string} body - Top-level declarations
 * @param {object} [options]
 * @param {string} [options.version]
 * @param {string} [options.attributes] - More attributes of xsl:stylesheet
 * @param {string} [options.exclude] - More excluded result prefixes
 * @returns {string}
 */
export const stylesheet = (
  body,
  { version = "3.0", attributes = "", exclude = "" } = {},
) =>
  `<xsl:stylesheet version="${version}" xmlns:xsl="${XSL}" ` +
  `xmlns:xs="http://www.w3.org/2001/XMLSchema" exclude-result-prefixes="xs ${exclude}" ` +
  `${attributes}>${body}</xsl:stylesheet>`;

/**
 * Serializes a result: nodes as XML, atomic values in canonical form.
 * @param {*} value - Node or sequence
 * @returns {string}
 */
export function show(value) {
  const items = Array.isArray(value) ? value : [value];
  const serializer = new XMLSerializer();
  return items
    .map((item) =>
      isAtomic(item)
        ? canonicalString(item)
        : item.nodeType === 2
          ? `@${item.name}=${item.value}`
          : serializer.serializeToString(item),
    )
    .join(" ");
}

/**
 * Compiles and runs a stylesheet.
 * @param {string} xsl - Stylesheet text
 * @param {string|null} [xml] - Source document text
 * @param {object} [options] - Options of transform (and compileStylesheet)
 * @returns {object} the result of transform
 */
export function transform(xsl, xml = "<doc/>", options = {}) {
  const compiled = compileStylesheet(xsl, { parseXml: parse, ...options });
  return compiled.transform({
    source: xml === null ? undefined : parse(xml),
    createDocument,
    ...options,
  });
}

/**
 * Runs a stylesheet and serializes its principal result.
 * @param {string} xsl
 * @param {string|null} [xml]
 * @param {object} [options]
 * @returns {string}
 */
export const run = (xsl, xml, options) =>
  show(transform(xsl, xml, options).principal);

/**
 * Runs a template body as the template matching the document node.
 * @param {string} body - Content of the template
 * @param {string} [xml]
 * @param {object} [options] - `version`, `declarations`, transform options
 * @returns {string}
 */
export function runBody(body, xml = "<doc/>", options = {}) {
  const { version, declarations = "", attributes, exclude, ...rest } = options;
  const xsl = stylesheet(
    `${declarations}<xsl:template match="/">${body}</xsl:template>`,
    { version, attributes, exclude },
  );
  return run(xsl, xml, rest);
}

/**
 * The error code a function raises.
 * @param {() => *} fn
 * @returns {string|undefined}
 */
export function errorCode(fn) {
  try {
    fn();
  } catch (error) {
    return error.code ?? error.message;
  }
  assert.fail("no error raised");
  return undefined;
}

/**
 * Asserts the results of table-driven cases.
 * @param {Array<[string, string, string?]>} cases - Body, expected
 *   result (or error code), source document
 * @param {object} [options] - Options of runBody
 */
export function checkBodies(cases, options = {}) {
  const { xml: defaultXml, ...rest } = options;
  for (const [body, expected, xml = defaultXml] of cases) {
    const actual = /^[A-Z]{4}\d{4}$/.test(expected)
      ? errorCode(() => runBody(body, xml, rest))
      : runBody(body, xml, rest);
    assert.equal(actual, expected, body);
  }
}
