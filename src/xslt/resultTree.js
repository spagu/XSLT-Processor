/**
 * Result tree construction helpers.
 *
 * XSLT builds its result tree in a neutral XML document: building directly in
 * an HTML owner document would lower case element names and force the XHTML
 * namespace on every created element. The finished tree is imported into the
 * caller's document only at the very end, which keeps names, namespaces and the
 * `disable-output-escaping` markers intact.
 */

"use strict";

/**
 * Create an empty, namespace neutral XML document.
 *
 * @param {Document} ownerDocument - Any document, used for its DOM implementation
 * @returns {Document} A fresh empty XML document
 *
 * @example
 * const resultDoc = createResultDocument(window.document);
 */
export function createResultDocument(ownerDocument) {
  return ownerDocument.implementation.createDocument(null, null, null);
}

/**
 * Deep-import a result tree node into another document.
 *
 * Unlike `Document.importNode` this preserves the internal
 * `_disableOutputEscaping` marker set by `disable-output-escaping`.
 *
 * @param {Node} node - The node to import
 * @param {Document} targetDoc - The document that will own the copy
 * @returns {Node} The imported copy
 *
 * @example
 * const copy = importResultNode(element, window.document);
 */
export function importResultNode(node, targetDoc) {
  const copy = targetDoc.importNode(node, false);

  if (node._disableOutputEscaping) {
    copy._disableOutputEscaping = true;
  }

  if (node.childNodes) {
    for (const child of node.childNodes) {
      copy.appendChild(importResultNode(child, targetDoc));
    }
  }

  return copy;
}

/**
 * Move a finished result fragment into the caller's output document.
 *
 * @param {DocumentFragment} fragment - The fragment built in the neutral document
 * @param {Document} targetDoc - The document that will own the result
 * @returns {DocumentFragment} A fragment owned by `targetDoc`
 *
 * @example
 * const result = importResultFragment(fragment, window.document);
 */
export function importResultFragment(fragment, targetDoc) {
  if (fragment.ownerDocument === targetDoc) return fragment;

  const imported = targetDoc.createDocumentFragment();
  for (const child of fragment.childNodes) {
    imported.appendChild(importResultNode(child, targetDoc));
  }

  return imported;
}

/** The XHTML namespace. */
export const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

/**
 * Turn an empty document into the one Chrome's `XSLTProcessor` returns from
 * `transformToDocument` for `method="text"`: the text in a `pre` element of
 * an XHTML page, `<html><head/><body><pre>text</pre></body></html>`. A text
 * result has no element to be the document element of an XML document.
 *
 * @param {Document} doc - An empty document
 * @param {string} text - The serialized text output
 * @returns {Document} The same document, filled in
 *
 * @example
 * wrapTextResult(emptyDoc, "hello").documentElement.textContent; // "hello"
 */
export function wrapTextResult(doc, text) {
  const create = (name) => doc.createElementNS(XHTML_NAMESPACE, name);
  const html = create("html");
  const body = create("body");
  const pre = create("pre");
  if (text) pre.appendChild(doc.createTextNode(text));
  body.appendChild(pre);
  html.append(create("head"), body);
  doc.appendChild(html);
  return doc;
}
