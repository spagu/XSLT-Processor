/**
 * The thirteen axes of XPath 3.1 (section 3.3.2.1) over DOM nodes. An axis
 * function collects the nodes that pass a node test, in axis order:
 * document order for the forward axes, reverse document order for the
 * reverse axes (parent, ancestor, ancestor-or-self, preceding,
 * preceding-sibling). It stops after `limit` nodes, so that `[1]` or `[2]`
 * after a step does not walk the whole axis.
 *
 * Siblings are reached through nextSibling/previousSibling, so walking an
 * axis from each of n siblings stays linear when it stops early.
 *
 * @module @tradik/xslt3/xpath/eval/axes
 */

import {
  attributesOf,
  isContainer,
  isXdmNode,
  namedAttributeOf,
  parentOf,
} from "./domNodes.js";
import { namespaceNodesOf } from "./namespaceNodes.js";

/** Axes whose order is reverse document order. */
export const REVERSE_AXES = new Set([
  "parent",
  "ancestor",
  "ancestor-or-self",
  "preceding",
  "preceding-sibling",
]);

/**
 * @callback Axis
 * @param {Node} node - Context node
 * @param {(node: Node) => boolean} test - Node test, false for the nodes
 *   that are not XDM nodes (document types; see nodeTests.js)
 * @param {number} limit - Most nodes to collect
 * @returns {Node[]} the nodes in axis order
 */

/** @param {Node} node @returns {boolean} attribute or namespace node */
const isAttached = (node) => node.nodeType === 2 || node.nodeType === 13;

/**
 * Collects the descendants of a node in document order, walking
 * firstChild/nextSibling/parentNode: no child arrays, and each DOM property
 * read once per node (in jsdom every read goes through a wrapper, and
 * childNodes through a Proxy).
 * @param {Node} node
 * @param {Function} test - Rejects the nodes that are not XDM nodes
 * @param {number} limit
 * @param {Node[]} result - Appended to
 * @returns {boolean} true when the limit is reached
 */
function descendants(node, test, limit, result) {
  if (!isContainer(node)) return false;
  let current = node.firstChild;
  while (current) {
    if (test(current) && result.push(current) >= limit) return true;
    if (current.nodeType === 1) {
      const first = current.firstChild;
      if (first) {
        current = first;
        continue;
      }
    }
    let next = current.nextSibling;
    while (!next) {
      current = current.parentNode;
      if (current === node || !current) return false;
      next = current.nextSibling;
    }
    current = next;
  }
  return false;
}

/**
 * The next or previous XDM sibling of a node.
 * @param {Node} node
 * @param {"nextSibling"|"previousSibling"} direction
 * @returns {Node|null}
 */
function sibling(node, direction) {
  let current = node[direction];
  while (current && !isXdmNode(current)) {
    current = current[direction];
  }
  return current ?? null;
}

/**
 * Collects the siblings of a node in one direction.
 * @returns {Node[]}
 */
function siblings(node, test, limit, direction) {
  const result = [];
  if (isAttached(node)) return result;
  for (let s = sibling(node, direction); s; s = sibling(s, direction)) {
    if (test(s) && result.push(s) >= limit) break;
  }
  return result;
}

/**
 * Collects a list of candidate nodes.
 * @param {Iterable<Node>} nodes
 * @returns {Node[]}
 */
function collect(nodes, test, limit) {
  const result = [];
  for (const node of nodes) {
    if (test(node) && result.push(node) >= limit) break;
  }
  return result;
}

/**
 * The ancestors of a node, nearest first, optionally with the node.
 * @param {Node} node
 * @param {boolean} self
 * @returns {Node[]}
 */
function ancestry(node, self) {
  const chain = self ? [node] : [];
  for (let p = parentOf(node); p; p = parentOf(p)) chain.push(p);
  return chain;
}

/** @type {Record<string, Axis>} Axis functions by axis name. */
export const axes = {
  self: (node, test) => (test(node) ? [node] : []),
  child(node, test, limit) {
    const result = [];
    if (!isContainer(node)) return result;
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (test(c) && result.push(c) >= limit) break;
    }
    return result;
  },
  attribute(node, test, limit) {
    if (test.qname) {
      const found = namedAttributeOf(node, test.qname.uri, test.qname.local);
      if (found !== undefined) {
        return found && limit > 0 && test(found) ? [found] : [];
      }
    }
    return collect(attributesOf(node), test, limit);
  },
  namespace: (node, test, limit) =>
    node.nodeType === 1 ? collect(namespaceNodesOf(node), test, limit) : [],
  parent(node, test) {
    const parent = parentOf(node);
    return parent && test(parent) ? [parent] : [];
  },
  descendant(node, test, limit) {
    const result = [];
    descendants(node, test, limit, result);
    return result;
  },
  "descendant-or-self"(node, test, limit) {
    const result = test(node) ? [node] : [];
    if (result.length < limit) descendants(node, test, limit, result);
    return result;
  },
  ancestor: (node, test, limit) => collect(ancestry(node, false), test, limit),
  "ancestor-or-self": (node, test, limit) =>
    collect(ancestry(node, true), test, limit),
  "following-sibling": (node, test, limit) =>
    siblings(node, test, limit, "nextSibling"),
  "preceding-sibling": (node, test, limit) =>
    siblings(node, test, limit, "previousSibling"),
  following(node, test, limit) {
    const result = [];
    let start = node;
    if (isAttached(node)) {
      start = parentOf(node);
      if (!start || descendants(start, test, limit, result)) return result;
    }
    for (let n = start; n; n = parentOf(n)) {
      for (
        let s = sibling(n, "nextSibling");
        s;
        s = sibling(s, "nextSibling")
      ) {
        if (test(s) && result.push(s) >= limit) return result;
        if (descendants(s, test, limit, result)) return result;
      }
    }
    return result;
  },
  preceding(node, test, limit) {
    const result = [];
    const start = isAttached(node) ? parentOf(node) : node;
    for (let n = start; n; n = parentOf(n)) {
      for (
        let s = sibling(n, "previousSibling");
        s;
        s = sibling(s, "previousSibling")
      ) {
        const subtree = [];
        descendants(s, test, Infinity, subtree);
        for (let i = subtree.length - 1; i >= 0; i--) {
          if (result.push(subtree[i]) >= limit) return result;
        }
        if (test(s) && result.push(s) >= limit) return result;
      }
    }
    return result;
  },
};
