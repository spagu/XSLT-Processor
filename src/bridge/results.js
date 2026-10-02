/**
 * Shaping @tradik/xslt3 Results for the W3C API
 *
 * The principal result of @tradik/xslt3 is a document (a well-formed tree)
 * or a document fragment. `transformToFragment` and `transformToDocument`
 * return it shaped as the XSLT 1.0 engine shapes its own results (as
 * Chrome does): html output parsed by the HTML parser, text output as one
 * text node or wrapped in a `pre` page, xml output as the result nodes or a
 * document with the `doctype-public`/`doctype-system` of xsl:output.
 *
 * @module bridge/results
 */

import {
  importResultFragment,
  parseHtmlFragment,
  textFragment,
  wrapTextResult,
} from "../xslt/resultTree.js";
import { fillXmlDocument, parseHtmlDocument } from "../xslt/resultDocument.js";

/**
 * Serialization parameters by camelCase name (`omit-xml-declaration`
 * becomes `omitXmlDeclaration`), the form the XSLT 1.0 output settings use.
 *
 * @param {Record<string, *>} output - Parameters of @tradik/xslt3
 * @returns {Record<string, *>} The same parameters, camelCase names
 *
 * @example
 * camelCaseOutput({ "omit-xml-declaration": "yes" }); // { omitXmlDeclaration: "yes" }
 */
export function camelCaseOutput(output) {
  return Object.fromEntries(
    Object.entries(output).map(([name, value]) => [
      name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()),
      value,
    ]),
  );
}

/**
 * The result as a fragment owned by `output`, shaped as the XSLT 1.0
 * engine shapes its fragments (XsltEngine.transformToFragment): html
 * output parsed by the HTML parser whatever the owner document, text
 * output as one text node, xml output as the result nodes.
 *
 * @param {Node} principal - Principal result (document or fragment)
 * @param {Record<string, *>} params - Its serialization parameters
 * @param {Document} output - The owner document
 * @param {(node: Node, params: object) => string} serialize - Serializer
 * @param {{xhtmlElements?: boolean}} [options] - Deprecated
 *   `legacyXhtmlFragments`: xml output as XHTML elements in an HTML owner
 * @returns {DocumentFragment} The fragment
 */
export function fragmentResult(
  principal,
  params,
  output,
  serialize,
  options = {},
) {
  if (params.method === "text") {
    return textFragment(output, serialize(principal, params));
  }
  if (params.method === "html") {
    return (
      parseHtmlFragment(serialize(principal, params), output) ??
      importResultFragment(principal, output, { htmlMethod: true })
    );
  }
  return importResultFragment(principal, output, options);
}

/**
 * The result as a document.
 *
 * @param {Node} principal - Principal result (document or fragment)
 * @param {Record<string, *>} params - Its serialization parameters
 * @param {Document} doc - An empty document to fill
 * @param {(node: Node, params: object) => string} serialize - Serializer
 * @returns {Document} The result document
 */
export function documentResult(principal, params, doc, serialize) {
  if (params.method === "text") {
    return wrapTextResult(doc, serialize(principal, params));
  }
  if (params.method === "html") {
    const html = parseHtmlDocument(serialize(principal, params), doc);
    if (html) return html;
  }
  return fillXmlDocument(doc, importResultFragment(principal, doc), params);
}
