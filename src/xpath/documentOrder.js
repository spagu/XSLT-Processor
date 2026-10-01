/**
 * Document order of nodes that are not children of their parent: attributes
 * and synthesized namespace nodes (XPath 1.0 section 5).
 *
 * An element comes first, then its namespace nodes, then its attributes, then
 * its children. `Node.compareDocumentPosition` cannot order namespace nodes,
 * which are not DOM nodes, and jsdom reports an element and one of its own
 * attributes as equal, so both kinds are ordered through their element here.
 *
 * Browsers implement `compareDocumentPosition` natively. The JavaScript DOMs
 * of Node.js walk the ancestors of both nodes on every call, and xmldom also
 * looks each ancestor up in its parent's child list, which makes sorting a
 * large node-set take minutes; some DOMs have no such method at all. A
 * {@link DocumentOrderIndex} numbers the nodes of a tree once instead, in one
 * walk, and sorts node-sets by those numbers: the XSLT engine uses one per
 * transformation (the source tree does not change while it runs) unless the
 * DOM compares positions natively.
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

/**
 * Order of two DOM nodes in different positions of a tree, from
 * `compareDocumentPosition`.
 *
 * @param {Node} a - First node
 * @param {Node} b - Second node
 * @returns {number} -1 when a comes first, 1 when b does, 0 when the DOM
 *   gives no order
 */
export function compareDomPositions(a, b) {
  const position = a.compareDocumentPosition(b);
  if (position & 4) return -1; // b follows a
  if (position & 2) return 1; // b precedes a
  return 0;
}

/**
 * Whether a node's DOM compares positions in native code (browsers), as
 * opposed to a JavaScript implementation (jsdom, xmldom) or none.
 *
 * @param {Node} node - A DOM node
 * @returns {boolean} True for a built-in `compareDocumentPosition`
 *
 * @example
 * hasNativePositionComparison(document.body); // true in a browser
 */
export function hasNativePositionComparison(node) {
  const compare = node.compareDocumentPosition;
  return (
    typeof compare === "function" &&
    Function.prototype.toString.call(compare).includes("[native code]")
  );
}

/**
 * The topmost ancestor of a node.
 *
 * @param {Node} node - A DOM node
 * @returns {Node} The document, or the root of a detached tree
 */
function rootOf(node) {
  let root = node;
  while (root.parentNode) root = root.parentNode;
  return root;
}

/**
 * Sort key offset of attributes among the nodes anchored at an element:
 * after the element (0) and its namespace nodes (1 + index).
 */
const ATTRIBUTE_KEY = 2 ** 30;

/**
 * Document order positions of DOM nodes, computed tree by tree.
 *
 * The first time a node of a tree is looked up, the whole tree is numbered
 * in document order (attributes are not: they are ordered through their
 * element, and among themselves by their index in the element's attribute
 * list, looked up only when two attributes of one element are sorted). Trees are numbered in
 * the order they are first seen, so nodes of different documents have a
 * stable, implementation-defined order (XPath 1.0 section 5). A node added
 * to a tree after it was numbered makes the tree numbered again; nodes
 * moved within a numbered tree are not noticed, so an index must not
 * outlive changes to its trees.
 *
 * @example
 * const order = new DocumentOrderIndex();
 * order.sort([lastChild, firstChild]); // [firstChild, lastChild]
 */
export class DocumentOrderIndex {
  constructor() {
    /** @type {WeakMap<Node, number>} */
    this.positions = new WeakMap();
    /** @type {WeakMap<Attr, number>} */
    this.attributeIndexes = new WeakMap();
    this.nextPosition = 0;
  }

  /**
   * The position of a tree node in document order.
   *
   * @param {Node} node - A DOM node, not an attribute of an element nor a
   *   namespace node (see {@link DocumentOrderIndex#sort})
   * @returns {number} Its position; larger for later nodes
   */
  positionOf(node) {
    let position = this.positions.get(node);
    if (position === undefined) {
      this.numberTree(rootOf(node));
      position = this.positions.get(node);
    }
    return position ?? this.assign(node);
  }

  /**
   * Give a node the next position.
   *
   * @param {Node} node - A DOM node
   * @returns {number} The assigned position
   */
  assign(node) {
    const position = this.nextPosition++;
    this.positions.set(node, position);
    return position;
  }

  /**
   * Number a tree in document order, without recursion (deep trees).
   *
   * @param {Node} root - The root of the tree
   * @returns {void}
   */
  numberTree(root) {
    let node = root;
    for (;;) {
      this.assign(node);
      if (node.firstChild) {
        node = node.firstChild;
        continue;
      }
      while (node !== root && !node.nextSibling) node = node.parentNode;
      if (node === root) return;
      node = node.nextSibling;
    }
  }

  /**
   * The index of an attribute in the attribute list of its element.
   *
   * @param {Attr} attribute - An attribute with an ownerElement
   * @returns {number} Its index (0 when the element does not list it)
   */
  attributeIndexOf(attribute) {
    let index = this.attributeIndexes.get(attribute);
    if (index === undefined) {
      const attributes = attribute.ownerElement.attributes;
      for (let i = 0; i < attributes.length; i++) {
        this.attributeIndexes.set(attributes[i], i);
      }
      index = this.attributeIndexes.get(attribute) ?? 0;
    }
    return index;
  }

  /**
   * The sort key of a node: the position of the node, or of the element it
   * hangs off, then its rank among the nodes anchored at that element. All
   * attributes of an element share one key (see
   * {@link DocumentOrderIndex#compareKeys}): walking the attribute list of
   * every element up front would dominate sorting `$items/@v`, where no two
   * attributes share an element.
   *
   * @param {Node} node - A DOM node or namespace node
   * @returns {{node: Node, major: number, minor: number}} The key
   */
  keyOf(node) {
    if (node.nodeType === NAMESPACE_NODE) {
      const major = this.positionOf(node.ownerElement);
      return { node, major, minor: 1 + node.index };
    }
    if (node.nodeType === 2 && node.ownerElement) {
      const major = this.positionOf(node.ownerElement);
      return { node, major, minor: ATTRIBUTE_KEY };
    }
    return { node, major: this.positionOf(node), minor: 0 };
  }

  /**
   * Order of two sort keys; attributes of the same element are ordered by
   * their index in its attribute list, looked up only for such a tie.
   *
   * @param {{node: Node, major: number, minor: number}} a - First key
   * @param {{node: Node, major: number, minor: number}} b - Second key
   * @returns {number} Negative when a comes first, positive when b does
   */
  compareKeys(a, b) {
    const order = a.major - b.major || a.minor - b.minor;
    if (order !== 0 || a.minor !== ATTRIBUTE_KEY) return order;
    return this.attributeIndexOf(a.node) - this.attributeIndexOf(b.node);
  }

  /**
   * Sort nodes in document order: an element, then its namespace nodes (by
   * index), then its attributes, then its children.
   *
   * @param {Node[]} nodes - DOM nodes and namespace nodes, sorted in place
   * @returns {Node[]} The same array
   */
  sort(nodes) {
    const keyed = nodes.map((node) => this.keyOf(node));
    keyed.sort((a, b) => this.compareKeys(a, b));
    for (let i = 0; i < keyed.length; i++) nodes[i] = keyed[i].node;
    return nodes;
  }
}
