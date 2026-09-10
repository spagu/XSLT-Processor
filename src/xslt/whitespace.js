/**
 * `xsl:strip-space` and `xsl:preserve-space` support.
 *
 * XSLT 1.0 removes whitespace-only text nodes from the source tree before the
 * transformation starts. This module builds a stripped copy of the source so
 * the caller's document is never mutated, and resolves the usual conflict rules
 * between the two declarations.
 */

"use strict";

/** Node type of a document type declaration, which cannot be imported. */
const DOCUMENT_TYPE_NODE = 10;

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

  while (current && current.nodeType === 1) {
    const value = current.getAttribute("xml:space");
    if (value === "preserve") return true;
    if (value === "default") return false;
    current = current.parentNode;
  }

  return false;
}

/**
 * Remove whitespace-only text nodes from a subtree.
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
      (current.nodeType === 3 || current.nodeType === 4) &&
      current.nodeValue !== null &&
      current.nodeValue.trim() === "" &&
      current.parentNode &&
      current.parentNode.nodeType === 1 &&
      filter.isStripped(current.parentNode) &&
      !hasXmlSpacePreserve(current.parentNode)
    ) {
      doomed.push(current);
    }

    const children = current.childNodes;
    if (children) {
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
  }

  for (const node of doomed) node.parentNode.removeChild(node);
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
