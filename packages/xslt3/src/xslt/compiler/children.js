/**
 * The children of a stylesheet element as the compiler sees them:
 * comments and processing instructions dropped, adjacent text merged,
 * whitespace-only text stripped (except in xsl:text and under
 * xml:space="preserve"), and elements excluded by use-when left out
 * (XSLT 3.0 sections 3.13.1 and 4.2).
 *
 * @module @tradik/xslt3/xslt/compiler/children
 */

import { isXsl, XML_NS, XSL_NS } from "../names.js";

const WHITESPACE = /^[ \t\r\n]*$/;

/** XSLT elements whose content has no text: whitespace there is ignored. */
const ELEMENT_ONLY = new Set([
  "stylesheet",
  "transform",
  "package",
  "use-package",
  "override",
  "apply-templates",
  "apply-imports",
  "next-match",
  "call-template",
  "choose",
  "attribute-set",
  "character-map",
  "analyze-string",
]);

/**
 * @param {object} node
 * @returns {boolean} whether a child is whitespace-only text
 */
export const isWhitespaceText = (node) =>
  node.nodeType === 3 && WHITESPACE.test(node.nodeValue);

/**
 * Splits leading children of one XSLT kind (xsl:param, xsl:sort) from the
 * rest, ignoring whitespace text between them.
 * @param {Array<object>} children
 * @param {string} local - Local name of the leading elements
 * @returns {{leading: Element[], rest: Array<object>}}
 */
export function splitLeading(children, local) {
  const leading = [];
  let end = 0;
  for (let i = 0; i < children.length; i++) {
    if (isXsl(children[i], local)) {
      leading.push(children[i]);
      end = i + 1;
    } else if (!isWhitespaceText(children[i])) break;
  }
  return { leading, rest: children.slice(end) };
}

/**
 * @param {Element} element
 * @returns {boolean} whether xml:space="preserve" applies to the children
 */
function preservesSpace(element) {
  for (let e = element; e && e.nodeType === 1; e = e.parentNode) {
    const space = e.getAttributeNS(XML_NS, "space");
    if (space) return space === "preserve";
  }
  return false;
}

/**
 * A text child of a stylesheet element: `{nodeType: 3, nodeValue}`.
 * @typedef {{nodeType: 3, nodeValue: string, parentNode: Element}} TextChild
 */

/**
 * The significant children of a stylesheet element.
 * @param {Element} element
 * @param {(element: Element) => boolean} included - Whether an element
 *   passes its use-when condition
 * @returns {Array<Element|TextChild>} elements and texts
 */
export function significantChildren(element, included) {
  const elementOnly =
    element.namespaceURI === XSL_NS && ELEMENT_ONLY.has(element.localName);
  const keepSpace =
    isXsl(element, "text") || (!elementOnly && preservesSpace(element));
  const result = [];
  let text = null;
  const flush = () => {
    if (text !== null && (keepSpace || !WHITESPACE.test(text))) {
      result.push({ nodeType: 3, nodeValue: text, parentNode: element });
    }
    text = null;
  };
  for (let child = element.firstChild; child; child = child.nextSibling) {
    const type = child.nodeType;
    if (type === 3 || type === 4) text = (text ?? "") + child.nodeValue;
    else if (type === 1) {
      flush();
      if (included(child)) result.push(child);
    }
  }
  flush();
  return result;
}
