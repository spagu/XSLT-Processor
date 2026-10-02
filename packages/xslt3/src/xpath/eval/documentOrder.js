/**
 * Document order of nodes (XDM 3.1 section 2.4), for any DOM.
 *
 * The nodes of a tree are numbered once, in one firstChild/nextSibling
 * walk, the first time a node of that tree is compared. Sorting then
 * compares numbers, which is fast whatever the DOM; walking ancestors per
 * comparison (compareDocumentPosition in jsdom or xmldom) is not. Numbers
 * grow across trees, so trees are ordered among themselves by when they
 * were (last) numbered.
 *
 * Attributes and namespace nodes are not numbered: they sort after their
 * element and before its first child (element p, its namespace nodes in
 * (p, p + 0.5), its attributes at p + 0.75). Two attributes of the same
 * element are ordered by their index in its attribute list, looked up only
 * for such a tie: walking every attribute list up front would dominate
 * sorting `//item/@price` (and NamedNodeMap is slow in jsdom).
 *
 * The numbering assumes the trees do not change while an instance is in
 * use. One instance serves one evaluation (so a tree changed between two
 * evaluations is numbered again) unless the caller shares one (dynamic
 * option `documentOrder`) over trees it does not change. A node missing
 * from its tree's numbering (added later) makes the tree be numbered
 * again; a node moved within a numbered tree keeps its stale number.
 *
 * @module @tradik/xslt3/xpath/eval/documentOrder
 */

import { NODE_TYPES, parentOf, rootOf } from "./domNodes.js";
import { namespaceNodesOf } from "./namespaceNodes.js";

/** Offset of the attributes of an element from the element's number. */
const ATTRIBUTE_OFFSET = 0.75;

/** Positions of the nodes of trees, built lazily. */
export class DocumentOrder {
  constructor() {
    /** @type {Map<Node, number>} */
    this.positions = new Map();
    /** @type {Map<Attr, number>} index in the attribute list */
    this.attributeIndexes = new Map();
    this.next = 0;
  }

  /**
   * Numbers the nodes of the tree containing a node, attributes aside.
   * @param {Node} node
   */
  index(node) {
    const root = rootOf(node);
    const positions = this.positions;
    positions.set(root, this.next++);
    let current = root.firstChild;
    while (current) {
      positions.set(current, this.next++);
      const first = current.firstChild;
      if (first) {
        current = first;
        continue;
      }
      while (!current.nextSibling) {
        current = current.parentNode;
        if (current === root || !current) return;
      }
      current = current.nextSibling;
    }
  }

  /**
   * @param {Node} node
   * @returns {number} the position of a node: larger for later nodes
   */
  position(node) {
    const type = node.nodeType;
    if (type === NODE_TYPES.namespace) {
      const element = parentOf(node);
      const siblings = namespaceNodesOf(element);
      const rank = siblings.indexOf(node) + 1;
      return this.position(element) + rank / (2 * (siblings.length + 1));
    }
    if (type === NODE_TYPES.attribute && node.ownerElement) {
      return this.position(node.ownerElement) + ATTRIBUTE_OFFSET;
    }
    let position = this.positions.get(node);
    if (position === undefined) {
      this.index(node);
      position = this.positions.get(node);
    }
    return position;
  }

  /**
   * @param {Attr} attribute - An attribute with an owner element
   * @returns {number} its index in the attribute list of its element
   */
  attributeIndex(attribute) {
    let index = this.attributeIndexes.get(attribute);
    if (index === undefined) {
      const attributes = attribute.ownerElement.attributes;
      for (let i = 0, n = attributes.length; i < n; i++) {
        this.attributeIndexes.set(attributes[i], i);
      }
      index = this.attributeIndexes.get(attribute) ?? 0;
    }
    return index;
  }

  /**
   * Order of two nodes at the same position: the attributes of one
   * element (or the same node twice).
   * @returns {number}
   */
  tie(a, b) {
    return a === b ? 0 : this.attributeIndex(a) - this.attributeIndex(b);
  }

  /**
   * @param {Node} a
   * @param {Node} b
   * @returns {number} negative when a comes first, positive when b does,
   *   0 for the same node
   */
  compare(a, b) {
    if (a === b) return 0;
    return this.position(a) - this.position(b) || this.tie(a, b);
  }

  /**
   * @param {Node[]} nodes
   * @returns {Node[]} the nodes in document order without duplicates (a
   *   new array)
   */
  sort(nodes) {
    if (nodes.length < 2) return nodes.slice();
    const keyed = nodes.map((node) => ({ node, key: this.position(node) }));
    keyed.sort((x, y) => x.key - y.key || this.tie(x.node, y.node));
    const result = [keyed[0].node];
    for (let i = 1; i < keyed.length; i++) {
      if (keyed[i].node !== keyed[i - 1].node) result.push(keyed[i].node);
    }
    return result;
  }
}
