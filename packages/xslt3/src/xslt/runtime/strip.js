/**
 * Whitespace stripping of source documents (XSLT 3.0 section 4.3): the
 * whitespace-only text nodes whose parent element matches xsl:strip-space
 * (and no better xsl:preserve-space rule), outside xml:space="preserve",
 * are removed from a copy of the document.
 *
 * @module @tradik/xslt3/xslt/runtime/strip
 */

import { XML_NS } from "../names.js";

const WHITESPACE = /^[ \t\r\n]*$/;

/**
 * Builds the decision of the rules for an element name.
 * @param {object[]} rules - Best first (see compileSpaceRules)
 * @returns {(element: Element) => boolean} whether to strip its children
 */
export function stripDecider(rules) {
  const cache = new Map();
  return (element) => {
    const uri = element.namespaceURI ?? "";
    const local = element.localName;
    const key = `{${uri}}${local}`;
    let strip = cache.get(key);
    if (strip === undefined) {
      const rule = rules.find(
        (r) =>
          (r.uri === null || r.uri === uri) &&
          (r.local === null || r.local === local),
      );
      strip = rule ? rule.strip : false;
      cache.set(key, strip);
    }
    return strip;
  };
}

/**
 * Whether a text node is one that stripping removes: whitespace only,
 * its parent element matched by xsl:strip-space and not under
 * xml:space="preserve".
 * @param {Node} node
 * @param {object[]} rules
 * @returns {boolean}
 */
export function isStrippedText(node, rules) {
  const parent = node.parentNode;
  if (node.nodeType !== 3 || parent?.nodeType !== 1) return false;
  if (!WHITESPACE.test(node.nodeValue) || !stripDecider(rules)(parent)) {
    return false;
  }
  for (let e = parent; e?.nodeType === 1; e = e.parentNode) {
    const space = e.getAttributeNS(XML_NS, "space");
    if (space) return space !== "preserve";
  }
  return true;
}

/**
 * A stripped copy of a document (the document itself when no rule
 * strips anything).
 * @param {Document} document
 * @param {object[]} rules
 * @returns {Document}
 */
export function stripDocument(document, rules) {
  if (!rules.some((rule) => rule.strip)) return document;
  const decide = stripDecider(rules);
  const copy = document.implementation.createDocument(null, null, null);
  for (const child of document.childNodes) {
    if (child.nodeType !== 10) copy.appendChild(copy.importNode(child, true));
  }
  if (document.documentURI) {
    try {
      copy.documentURI = document.documentURI;
    } catch {
      // read-only in some DOMs
    }
  }
  const stack = [[copy.documentElement, false]];
  while (stack.length > 0) {
    const [element, preserved] = stack.pop();
    if (!element) continue;
    const space = element.getAttributeNS(XML_NS, "space");
    const keep = space === "preserve" || (space !== "default" && preserved);
    const strip = !keep && decide(element);
    for (let child = element.firstChild; child;) {
      const next = child.nextSibling;
      if (child.nodeType === 1) stack.push([child, keep]);
      else if (
        strip &&
        child.nodeType === 3 &&
        WHITESPACE.test(child.nodeValue)
      ) {
        element.removeChild(child);
      }
      child = next;
    }
  }
  return copy;
}
