/**
 * Document order of nodes that are not children of their parent: attributes
 * and synthesized namespace nodes (XPath 1.0 section 5).
 *
 * An element comes first, then its namespace nodes, then its attributes, then
 * its children. `Node.compareDocumentPosition` cannot order namespace nodes,
 * which are not DOM nodes, and jsdom reports an element and one of its own
 * attributes as equal, so both kinds are ordered through their element here.
 *
 * @module xpath/documentOrder
 */

"use strict";

import { NAMESPACE_NODE } from "./namespaceNodes.js";

/**
 * Rank of a node among the nodes anchored at the same element: the element,
 * its namespace nodes, its attributes.
 *
 * @param {Node} node - Any node
 * @returns {number} 0 for the element (or any other node), 1 for a namespace
 *   node, 2 for an attribute
 */
function rankOf(node) {
  const type = node.nodeType;
  if (type === NAMESPACE_NODE) return 1;
  return type === 2 ? 2 : 0;
}

/**
 * The node whose position in the tree stands for a node: the element of an
 * attached attribute or namespace node, else the node itself.
 *
 * @param {Node} node - Any node
 * @param {number} rank - The node's rank (see rankOf)
 * @returns {Node} The anchor
 */
function anchorOf(node, rank) {
  return rank === 0 ? node : (node.ownerElement ?? node);
}

/**
 * Compare two distinct nodes in document order.
 *
 * @param {Node} a - First node
 * @param {Node} b - Second node
 * @param {(a: Node, b: Node) => number} compareDom - Order of two DOM nodes
 *   in different positions of the tree (compareDocumentPosition based)
 * @returns {number} Negative when a comes first, positive when b does
 *
 * @example
 * compareNodeOrder(attribute, ownerElement, compareDom); // 1
 */
export function compareNodeOrder(a, b, compareDom) {
  const rankA = rankOf(a);
  const rankB = rankOf(b);
  if (rankA === 0 && rankB === 0) return compareDom(a, b);
  const anchorA = anchorOf(a, rankA);
  const anchorB = anchorOf(b, rankB);
  if (anchorA !== anchorB) return compareDom(anchorA, anchorB);
  if (rankA !== rankB) return rankA - rankB;
  // Two namespace nodes, or two attributes, of the same element
  return rankA === 1 ? a.index - b.index : compareDom(a, b);
}
