/**
 * Document order of nodes (XDM 3.1 section 2.4), for any DOM.
 *
 * The nodes of a tree are numbered once, in one walk, the first time a
 * node of that tree is compared: an element, then its attributes, then its
 * children (namespace nodes sit between the element and its attributes).
 * Sorting then compares numbers, which is fast whatever the DOM; walking
 * ancestors per comparison (compareDocumentPosition in jsdom or xmldom) is
 * not. Trees are ordered among themselves by when they were first seen.
 *
 * The numbering assumes the trees do not change while an instance is in
 * use; one instance serves one evaluation unless the caller shares one
 * (dynamic option `documentOrder`). A node missing from its tree's
 * numbering (added later) makes the tree be numbered again.
 *
 * @module @tradik/xslt3/xpath/eval/documentOrder
 */

import { NODE_TYPES, parentOf, rootOf } from "./domNodes.js";
import { namespaceNodesOf } from "./namespaceNodes.js";

/** Positions of the nodes of trees, built lazily. */
export class DocumentOrder {
  constructor() {
    /** @type {Map<Node, {tree: number, index: number}>} */
    this.positions = new Map();
    this.trees = 0;
  }

  /**
   * Numbers the nodes of the tree containing a node.
   * @param {Node} node
   */
  index(node) {
    const tree = this.trees++;
    const stack = [rootOf(node)];
    let index = 0;
    while (stack.length > 0) {
      const current = stack.pop();
      this.positions.set(current, { tree, index: index++ });
      if (current.attributes) {
        for (const attribute of current.attributes) {
          this.positions.set(attribute, { tree, index: index++ });
        }
      }
      const children = current.childNodes ?? [];
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
  }

  /**
   * @param {Node} node
   * @returns {{tree: number, index: number}} the position of a node
   */
  position(node) {
    if (node.nodeType === NODE_TYPES.namespace) {
      const element = parentOf(node);
      const siblings = namespaceNodesOf(element);
      const { tree, index } = this.position(element);
      const rank = siblings.indexOf(node) + 1;
      return { tree, index: index + rank / (siblings.length + 1) };
    }
    let position = this.positions.get(node);
    if (position === undefined) {
      this.index(node);
      position = this.positions.get(node);
    }
    return position;
  }

  /**
   * @param {Node} a
   * @param {Node} b
   * @returns {number} negative when a comes first, positive when b does,
   *   0 for the same node
   */
  compare(a, b) {
    if (a === b) return 0;
    const pa = this.position(a);
    const pb = this.position(b);
    return pa.tree === pb.tree ? pa.index - pb.index : pa.tree - pb.tree;
  }

  /**
   * @param {Node[]} nodes
   * @returns {Node[]} the nodes in document order without duplicates (a
   *   new array)
   */
  sort(nodes) {
    if (nodes.length < 2) return nodes.slice();
    const keyed = nodes.map((node) => ({ node, key: this.position(node) }));
    keyed.sort((x, y) =>
      x.key.tree === y.key.tree
        ? x.key.index - y.key.index
        : x.key.tree - y.key.tree,
    );
    const result = [keyed[0].node];
    for (let i = 1; i < keyed.length; i++) {
      if (keyed[i].node !== keyed[i - 1].node) result.push(keyed[i].node);
    }
    return result;
  }
}
