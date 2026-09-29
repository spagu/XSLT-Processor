/**
 * Helpers of the XSLT pattern matcher (see patterns.js): node relationships
 * in the XPath data model and the per-call {@link MatchScope} that builds the
 * XPath contexts predicates and `id()`/`key()` anchors are evaluated in.
 *
 * @module xslt/matchScope
 */

"use strict";

import { XPathContext } from "../xpath/evaluator.js";
import { parentOf } from "../xpath/axes.js";

const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const EMPTY_VARIABLES = Object.freeze({});
const EMPTY_NAMESPACES = Object.freeze({});

export { parentOf };

/**
 * The root of the tree holding a node (its document, or the top of a
 * detached subtree or result tree fragment).
 *
 * @param {Node} node - Any node
 * @returns {Node} The outermost ancestor
 */
export function rootOf(node) {
  let root = node;
  for (let parent = parentOf(root); parent; parent = parentOf(parent)) {
    root = parent;
  }
  return root;
}

/**
 * Whether a node is a root node (a document or a result tree fragment).
 *
 * @param {Node|null} node - Any node
 * @returns {boolean} True for document and document fragment nodes
 */
export function isRoot(node) {
  return node !== null && (node.nodeType === 9 || node.nodeType === 11);
}

/**
 * Whether an attribute is a namespace declaration, which XPath does not
 * expose on the attribute axis.
 *
 * @param {Attr} attribute - An attribute node
 * @returns {boolean} True for `xmlns` and `xmlns:*` attributes
 */
export function isNamespaceDeclaration(attribute) {
  return (
    attribute.namespaceURI === XMLNS_NAMESPACE ||
    attribute.name === "xmlns" ||
    attribute.name.startsWith("xmlns:")
  );
}

/**
 * State of a single match call: lazily merges the XSLT variables once.
 */
export class MatchScope {
  /**
   * @param {object|null} host - XSLT context (variables, parameters, namespaces)
   * @param {Object<string, string>} [namespaces] - Prefix bindings, when they
   *   differ from the host's (e.g. those in scope on an xsl:template)
   */
  constructor(host, namespaces) {
    this.host = host;
    this.namespaces = namespaces ?? host?.namespaces ?? EMPTY_NAMESPACES;
    this.variables = null;
  }

  /**
   * Build an XPath context for evaluating a predicate or anchor call.
   *
   * @param {Node} node - Context node
   * @param {number} position - Context position
   * @param {number} size - Context size
   * @returns {XPathContext} The evaluation context
   */
  context(node, position, size) {
    if (!this.variables) {
      this.variables = this.host?.xpathVariables ?? {
        ...this.host?.variables,
        ...this.host?.parameters,
      };
    }
    return new XPathContext(
      node,
      position,
      size,
      this.variables,
      this.namespaces,
      this.host,
    );
  }

  /**
   * Build a cheap XPath context for node tests (namespaces only).
   *
   * @param {Node} node - Context node
   * @returns {XPathContext} The evaluation context
   */
  testContext(node) {
    return new XPathContext(
      node,
      1,
      1,
      EMPTY_VARIABLES,
      this.namespaces,
      this.host,
    );
  }
}
