/**
 * `xsl:strip-space` and `xsl:preserve-space` support.
 *
 * XSLT 1.0 removes whitespace-only text nodes from the source tree before the
 * transformation starts. This module builds a stripped copy of the source so
 * the caller's document is never mutated, and resolves the usual conflict rules
 * between the two declarations.
 */

"use strict";

import { isTextContinuation, isTextNode } from "../xpath/axes.js";

/** Node type of a document type declaration, which cannot be imported. */
const DOCUMENT_TYPE_NODE = 10;

/** Text made only of XML whitespace: #x20, #x9, #xD and #xA (not NBSP). */
const XML_WHITESPACE_ONLY = /^[ \t\r\n]*$/;

/**
 * Whether a string consists of XML whitespace only (XML 1.0 production S).
 * Unlike `trim()` and `\s`, a no-break space is not whitespace.
 *
 * @param {string} text - Any string
 * @returns {boolean} True for "" and strings of #x20 #x9 #xD #xA
 *
 * @example
 * isXmlWhitespace(" \n"); // true
 * isXmlWhitespace("\u00a0"); // false
 */
export function isXmlWhitespace(text) {
  return XML_WHITESPACE_ONLY.test(text);
}

/**
 * The DOM nodes of the text run starting at a node: the node and every
 * directly following Text/CDATA sibling (one XPath text node).
 *
 * @param {Node} first - The first node of the run
 * @returns {Node[]} The nodes of the run
 */
export function textRun(first) {
  const run = [first];
  for (
    let next = first.nextSibling;
    isTextNode(next);
    next = next.nextSibling
  ) {
    run.push(next);
  }
  return run;
}

/**
 * Compute the XSLT default priority of an element name test.
 *
 * @param {string} nameTest - A name test such as `*`, `ns:*` or `item`
 * @returns {number} The default priority
 */
function nameTestPriority(nameTest) {
  if (nameTest === "*") return -0.5;
  if (nameTest.endsWith(":*")) return -0.25;
  return 0;
}

/**
 * Check whether an element matches a name test.
 *
 * @param {Element} element - The element to test
 * @param {string} nameTest - A name test such as `*`, `ns:*` or `item`
 * @returns {boolean} True when the element matches
 */
function matchesNameTest(element, nameTest) {
  if (nameTest === "*") return true;

  if (nameTest.endsWith(":*")) {
    const prefix = nameTest.slice(0, -2);
    return element.nodeName.startsWith(`${prefix}:`);
  }

  return element.nodeName === nameTest || element.localName === nameTest;
}

/**
 * Decides which whitespace-only text nodes of the source tree are removed.
 */
export class WhitespaceFilter {
  /**
   * @param {string[]} [stripSpace] - Name tests from `xsl:strip-space`
   * @param {string[]} [preserveSpace] - Name tests from `xsl:preserve-space`
   */
  constructor(stripSpace = [], preserveSpace = []) {
    this.stripSpace = stripSpace;
    this.preserveSpace = preserveSpace;
  }

  /**
   * Whether the filter can remove anything at all.
   *
   * @returns {boolean} True when at least one `xsl:strip-space` was declared
   *
   * @example
   * new WhitespaceFilter(['*']).isActive(); // true
   */
  isActive() {
    return this.stripSpace.length > 0;
  }

  /**
   * Whether whitespace-only children of an element are stripped.
   *
   * The most specific name test wins; `xsl:preserve-space` wins ties.
   *
   * @param {Element} element - The parent element
   * @returns {boolean} True when whitespace-only text children are removed
   *
   * @example
   * new WhitespaceFilter(['*'], ['pre']).isStripped(preElement); // false
   */
  isStripped(element) {
    let stripPriority = -Infinity;
    let preservePriority = -Infinity;

    for (const nameTest of this.stripSpace) {
      if (matchesNameTest(element, nameTest)) {
        stripPriority = Math.max(stripPriority, nameTestPriority(nameTest));
      }
    }

    for (const nameTest of this.preserveSpace) {
      if (matchesNameTest(element, nameTest)) {
        preservePriority = Math.max(
          preservePriority,
          nameTestPriority(nameTest),
        );
      }
    }

    return stripPriority > -Infinity && stripPriority > preservePriority;
  }
}

/**
 * Check whether `xml:space="preserve"` is in scope for a node.
 *
 * @param {Node} node - The node to inspect
 * @returns {boolean} True when whitespace must be preserved
 */
function hasXmlSpacePreserve(node) {
  let current = node;

  while (current?.nodeType === 1) {
    const value = current.getAttribute("xml:space");
    if (value === "preserve") return true;
    if (value === "default") return false;
    current = current.parentNode;
  }

  return false;
}

/**
 * Remove whitespace-only text nodes from a subtree. Adjacent Text/CDATA
 * nodes form one text node and are only removed together.
 *
 * @param {Node} root - The root of the subtree to prune
 * @param {WhitespaceFilter} filter - The configured filter
 * @returns {void}
 */
function pruneWhitespace(root, filter) {
  const doomed = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();

    if (
      isTextNode(current) &&
      !isTextContinuation(current) &&
      current.parentNode?.nodeType === 1 &&
      filter.isStripped(current.parentNode) &&
      !hasXmlSpacePreserve(current.parentNode)
    ) {
      const run = textRun(current);
      if (run.every((node) => isXmlWhitespace(node.nodeValue))) {
        doomed.push(...run);
      }
    }

    const children = current.childNodes;
    if (children) {
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
  }

  for (const node of doomed) node.remove();
}

/**
 * Build a copy of the source tree with stripped whitespace removed.
 *
 * @param {Node} sourceNode - The source document or element
 * @param {WhitespaceFilter} filter - The configured filter
 * @param {Document} targetDoc - An empty document owning the copy
 * @returns {Node} The stripped copy, a document when the source was a document
 *
 * @example
 * const stripped = stripWhitespaceNodes(xmlDoc, filter, emptyDoc);
 */
export function stripWhitespaceNodes(sourceNode, filter, targetDoc) {
  let root;

  if (sourceNode.nodeType === 9) {
    root = targetDoc;
    for (const child of Array.from(sourceNode.childNodes)) {
      if (child.nodeType === DOCUMENT_TYPE_NODE) continue;
      targetDoc.appendChild(targetDoc.importNode(child, true));
    }
  } else {
    root = targetDoc.importNode(sourceNode, true);
    targetDoc.appendChild(root);
  }

  pruneWhitespace(root, filter);
  return root;
}
