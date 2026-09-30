/**
 * The document returned by `transformToDocument`, built like Chrome's
 * `XSLTProcessor` builds it from the serialized output:
 *
 * - xml output: the result tree nodes, minus whitespace-only text at the
 *   document level (the XML parser drops it, and a document cannot hold
 *   text), with a document type node when `xsl:output` declares
 *   `doctype-public` or `doctype-system` (as libxslt creates one);
 * - html output: an HTML document parsed from the serialized html output,
 *   so it has `html`, `head` and `body` elements that are HTMLElements;
 * - text output: see wrapTextResult in resultTree.js.
 *
 * @module xslt/resultDocument
 */

"use strict";

import { findRootElement } from "./serializer/settings.js";
import { appendDoctype } from "./resultTree.js";
import { findParseError } from "./domParsing.js";

/** Text made only of XML whitespace (#x20 #x9 #xD #xA). */
const WHITESPACE_ONLY = /^[ \t\r\n]*$/;

/**
 * Whether a result node is whitespace-only character data.
 *
 * @param {Node} node - A child of the result fragment
 * @returns {boolean} True for text or CDATA holding only whitespace
 */
function isWhitespaceText(node) {
  return (
    (node.nodeType === 3 || node.nodeType === 4) &&
    WHITESPACE_ONLY.test(node.nodeValue)
  );
}

/**
 * Move an xml result fragment into an empty document.
 *
 * @param {Document} doc - An empty XML document
 * @param {DocumentFragment} fragment - The result, owned by `doc`
 * @param {{doctypePublic?: string|null, doctypeSystem?: string|null}} settings -
 *   The xsl:output settings
 * @returns {Document} The same document, filled in
 * @throws {Error} When the result cannot be a document (text or several
 *   elements at the top level), as the DOM rejects it
 *
 * @example
 * fillXmlDocument(doc, fragment, { doctypeSystem: "doc.dtd" }).doctype.name;
 */
export function fillXmlDocument(doc, fragment, settings) {
  const { doctypePublic, doctypeSystem } = settings;
  const root = findRootElement(fragment);
  if (root && (doctypePublic || doctypeSystem)) {
    appendDoctype(doc, root.nodeName, doctypePublic ?? "", doctypeSystem ?? "");
  }
  for (const child of Array.from(fragment.childNodes)) {
    if (!isWhitespaceText(child)) doc.appendChild(child);
  }
  return doc;
}

/**
 * Parse serialized html output into an HTML document, as Chrome does for
 * `transformToDocument` with the html output method. The DOMParser of the
 * host (global, or the window of the source document) is used; without one,
 * an HTML document of the source's DOM implementation is filled through
 * `innerHTML` (without a doctype node).
 *
 * xmldom parses `text/html` too, into a document without the HTML
 * accessors (`body`, `head`, `title`); DOMs that can do neither, and markup
 * the HTML parser rejects, leave the XML result in place.
 *
 * @param {string} markup - The serialized html output
 * @param {Document} referenceDoc - A document of the DOM implementation to use
 * @returns {Document|null} The HTML document, or null when the DOM cannot
 *   create HTML documents (the caller then keeps the XML result)
 *
 * @example
 * parseHtmlDocument("<html><body><p>x</p></body></html>", xmlDoc).body;
 */
export function parseHtmlDocument(markup, referenceDoc) {
  const Parser =
    globalThis.DOMParser ?? referenceDoc.defaultView?.DOMParser ?? null;
  if (Parser) {
    const doc = new Parser().parseFromString(markup, "text/html");
    return findParseError(doc) ? null : doc;
  }

  const implementation = referenceDoc.implementation;
  if (typeof implementation?.createHTMLDocument !== "function") return null;
  const doc = implementation.createHTMLDocument("");
  if (!("innerHTML" in doc.documentElement)) return null;
  if (doc.doctype) doc.removeChild(doc.doctype);
  doc.documentElement.innerHTML = markup;
  return doc;
}
