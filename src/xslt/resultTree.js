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
 * Copy an element in no namespace as an element of the XHTML namespace:
 * with `lowerCase`, with lower-case element and attribute names, what the
 * HTML parser would make of html output (for DOMs that cannot parse HTML
 * fragments, see parseHtmlFragment); without, with the names as written
 * (the deprecated `legacyXhtmlFragments` behaviour).
 *
 * @param {Element} element - Element in no namespace
 * @param {Document} targetDoc - The document that will own the copy
 * @param {boolean} lowerCase - Lower-case the element and attribute names
 * @returns {Element} The shallow copy, with the attributes
 */
function importAsHtmlElement(element, targetDoc, lowerCase) {
  const fold = (name) => (lowerCase ? name.toLowerCase() : name);
  const copy = targetDoc.createElementNS(
    XHTML_NAMESPACE,
    fold(element.localName),
  );
  for (const attribute of element.attributes) {
    const name = attribute.namespaceURI ? attribute.name : fold(attribute.name);
    copy.setAttributeNS(attribute.namespaceURI, name, attribute.value);
  }
  return copy;
}

/**
 * Deep-import a result tree node into another document.
 *
 * Unlike `Document.importNode` this preserves the internal
 * `_disableOutputEscaping` marker set by `disable-output-escaping`. Elements
 * in no namespace become XHTML elements (see importAsHtmlElement) with
 * `htmlMethod` (output of the html method on a DOM without an HTML parser,
 * lower-case names) or, into an HTML document only, with `xhtmlElements`
 * (the deprecated `legacyXhtmlFragments` option, names as written);
 * elements of other namespaces are kept.
 *
 * @param {Node} node - The node to import
 * @param {Document} targetDoc - The document that will own the copy
 * @param {{htmlMethod?: boolean, xhtmlElements?: boolean}} [options] - Import
 *   options
 * @returns {Node} The imported copy
 *
 * @example
 * const copy = importResultNode(element, window.document);
 */
export function importResultNode(node, targetDoc, options = {}) {
  const htmlMethod = options.htmlMethod === true;
  const legacy = options.xhtmlElements === true && isHtmlDocument(targetDoc);
  const asHtml =
    (htmlMethod || legacy) && node.nodeType === 1 && !node.namespaceURI;
  const copy = asHtml
    ? importAsHtmlElement(node, targetDoc, htmlMethod)
    : targetDoc.importNode(node, false);

  if (node._disableOutputEscaping) {
    copy._disableOutputEscaping = true;
  }

  if (node.childNodes) {
    for (const child of node.childNodes) {
      copy.appendChild(importResultNode(child, targetDoc, options));
    }
  }

  return copy;
}

/**
 * Move a finished result fragment into the caller's output document.
 *
 * @param {DocumentFragment} fragment - The fragment built in the neutral document
 * @param {Document} targetDoc - The document that will own the result
 * @param {{htmlMethod?: boolean, xhtmlElements?: boolean}} [options] - See
 *   {@link importResultNode}
 * @returns {DocumentFragment} A fragment owned by `targetDoc`
 *
 * @example
 * const result = importResultFragment(fragment, window.document);
 */
export function importResultFragment(fragment, targetDoc, options = {}) {
  if (fragment.ownerDocument === targetDoc) return fragment;

  const imported = targetDoc.createDocumentFragment();
  for (const child of fragment.childNodes) {
    imported.appendChild(importResultNode(child, targetDoc, options));
  }

  return imported;
}

/** The XHTML namespace. */
export const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

/** Public and system identifiers of the XHTML 1.0 Strict DTD. */
const XHTML_STRICT_DOCTYPE = [
  "-//W3C//DTD XHTML 1.0 Strict//EN",
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd",
];

/**
 * Turn an empty document into the one Chrome's `XSLTProcessor` returns from
 * `transformToDocument` for `method="text"`: the text in a `pre` element of
 * the XHTML 1.0 Strict page Blink builds, with its line breaks:
 * `<!DOCTYPE html PUBLIC ...>` then
 * `<html>\n<head><title/></head>\n<body>\n<pre>text</pre>\n</body>\n</html>`.
 * A text result has no element to be the document element of an XML
 * document.
 *
 * @param {Document} doc - An empty document
 * @param {string} text - The serialized text output
 * @returns {Document} The same document, filled in
 *
 * @example
 * wrapTextResult(emptyDoc, "hello").documentElement.textContent;
 * // "\n\n\nhello\n\n"
 */
export function wrapTextResult(doc, text) {
  // appendChild, not append: xmldom has no ParentNode.append
  const create = (name, ...children) => {
    const element = doc.createElementNS(XHTML_NAMESPACE, name);
    for (const child of children) {
      element.appendChild(
        typeof child === "string" ? doc.createTextNode(child) : child,
      );
    }
    return element;
  };
  const pre = create("pre");
  if (text) pre.appendChild(doc.createTextNode(text));
  const head = create("head", create("title"));
  const body = create("body", "\n", pre, "\n");
  // One node at a time: a doctype cannot pass through a fragment
  appendDoctype(doc, "html", ...XHTML_STRICT_DOCTYPE);
  doc.appendChild(create("html", "\n", head, "\n", body, "\n"));
  return doc;
}

/**
 * Append a document type node to a document.
 *
 * @param {Document} doc - A document without a doctype
 * @param {string} name - The root element name
 * @param {string} publicId - Public identifier ("" for none)
 * @param {string} systemId - System identifier ("" for none)
 * @returns {DocumentType} The appended node
 *
 * @example
 * appendDoctype(doc, "html", "", "about:legacy-compat");
 */
export function appendDoctype(doc, name, publicId, systemId) {
  const doctype = doc.implementation.createDocumentType(
    name,
    publicId,
    systemId,
  );
  doc.appendChild(doctype);
  // xmldom leaves Document.doctype null when a doctype node is appended
  doc.doctype ??= doctype;
  return doctype;
}

/**
 * Whether a document is an HTML document (as opposed to an XML one).
 *
 * @param {Document} doc - Any document
 * @returns {boolean} True for documents of content type text/html
 */
export function isHtmlDocument(doc) {
  return doc.contentType === "text/html";
}

/**
 * Parse serialized `html` output into a fragment of `doc`, as Chrome's
 * `XSLTProcessor.transformToFragment` does whatever the owner document: the
 * elements are created by the HTML parser, so `<a>` is an `HTMLAnchorElement`
 * in the XHTML namespace with a lower-case name, `<table>` gets its `tbody`,
 * and `<script>` elements run when inserted. Like Blink, the markup is
 * parsed in the context of a (detached) `body` element, that is in the
 * "in body" insertion mode: `<html>`, `<head>` and `<body>` tags are dropped
 * and their content becomes children of the fragment.
 *
 * An XML owner document (`createDocument("", "XmlTransform", null)`, issue
 * #17) gets the same nodes: they are parsed in a scratch HTML document of
 * its DOM implementation and adopted. A DOM that cannot do that (xmldom has
 * no `createRange`) returns null, and the caller imports the result tree
 * instead (see importResultNode).
 *
 * @param {string} markup - HTML markup
 * @param {Document} doc - The document that will own the fragment
 * @returns {DocumentFragment|null} The parsed fragment, or null when the
 *   DOM cannot parse HTML fragments
 *
 * @example
 * parseHtmlFragment('<a href="u">x</a>', document).firstChild; // HTMLAnchorElement
 */
export function parseHtmlFragment(markup, doc) {
  const scratch = isHtmlDocument(doc) ? doc : createScratchHtmlDocument(doc);
  if (typeof scratch?.createRange !== "function") return null;
  const range = scratch.createRange();
  range.selectNodeContents(scratch.createElement("body"));
  const fragment = range.createContextualFragment(markup);
  return scratch === doc ? fragment : doc.adoptNode(fragment);
}

/**
 * An HTML document of the same DOM implementation as `doc`, to parse HTML
 * for an XML document, or null when the DOM cannot create one or cannot
 * adopt its nodes.
 *
 * @param {Document} doc - An XML document
 * @returns {Document|null} The scratch document
 */
function createScratchHtmlDocument(doc) {
  const implementation = doc.implementation;
  if (
    typeof implementation?.createHTMLDocument !== "function" ||
    typeof doc.adoptNode !== "function"
  ) {
    return null;
  }
  return implementation.createHTMLDocument("");
}

/**
 * The fragment Chrome returns for `method="text"`: the serialized text as
 * one text node, or an empty fragment for no text. Result elements never
 * reach the fragment, text output has none.
 *
 * @param {Document} doc - The document that will own the fragment
 * @param {string} text - The serialized text output
 * @returns {DocumentFragment} The fragment
 *
 * @example
 * textFragment(document, "a < b").firstChild.nodeValue; // "a < b"
 */
export function textFragment(doc, text) {
  const fragment = doc.createDocumentFragment();
  if (text) fragment.appendChild(doc.createTextNode(text));
  return fragment;
}
