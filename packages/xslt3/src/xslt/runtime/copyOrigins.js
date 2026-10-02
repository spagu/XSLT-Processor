/**
 * The original node a node of a copy stands for, for the accumulator
 * values of copies (fn:copy-of, fn:snapshot, xsl:copy-of with
 * copy-accumulators): copied nodes are recorded with their original, and
 * a node inside a recorded copy is found by its child positions.
 *
 * Every accumulator-before()/accumulator-after() call asks, so the common
 * case (a node of a source tree, in no copy) must stay cheap: the
 * ancestors are first searched for a recorded copy, and child positions
 * are only computed for nodes that are inside one. Positions are counted
 * along previousSibling rather than with an indexOf over childNodes,
 * which on jsdom goes through a live NodeList proxy per index.
 *
 * @module @tradik/xslt3/xslt/runtime/copyOrigins
 */

/**
 * Position of a node among the children of its parent.
 * @param {Node} node
 * @returns {number}
 */
function positionOf(node) {
  let position = 0;
  for (let s = node.previousSibling; s; s = s.previousSibling) position++;
  return position;
}

/**
 * The nearest recorded copy containing a node (the node itself included).
 * @param {WeakMap<Node, Node>} origins
 * @param {Node} node
 * @returns {Node|null}
 */
function recordedAncestor(origins, node) {
  for (let current = node; current; current = current.parentNode) {
    if (origins.has(current)) return current;
  }
  return null;
}

/**
 * The node of the original tree a node of a copy stands for.
 * @param {WeakMap<Node, Node>} origins - Copied nodes to original nodes
 * @param {Node} node - Not an attribute (accumulators have no values
 *   for attributes)
 * @returns {Node|null} the original, null when the node is not in a copy
 */
export function originalNode(origins, node) {
  const copy = recordedAncestor(origins, node);
  if (!copy) return null;
  const path = [];
  for (let current = node; current !== copy; current = current.parentNode) {
    path.push(positionOf(current));
  }
  let original = origins.get(copy);
  for (let i = path.length - 1; i >= 0; i--) {
    original = original.childNodes[path[i]];
  }
  return original;
}
