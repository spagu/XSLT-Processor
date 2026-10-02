/**
 * The original node a node of a copy stands for, for the accumulator
 * values of copies (fn:copy-of, fn:snapshot, xsl:copy-of with
 * copy-accumulators): copied nodes are recorded with their original, and
 * a node inside a recorded copy is found by its child positions.
 *
 * @module @tradik/xslt3/xslt/runtime/copyOrigins
 */

/**
 * Position of a node among the children of its parent.
 * @param {Node} node
 * @returns {number}
 */
const positionOf = (node) =>
  Array.prototype.indexOf.call(node.parentNode.childNodes, node);

/**
 * The node of the original tree a node of a copy stands for.
 * @param {WeakMap<Node, Node>} origins - Copied nodes to original nodes
 * @param {Node} node - Not an attribute (accumulators have no values
 *   for attributes)
 * @returns {Node|null} the original, null when the node is not in a copy
 */
export function originalNode(origins, node) {
  const path = [];
  let current = node;
  while (!origins.has(current)) {
    if (!current.parentNode) return null;
    path.push(positionOf(current));
    current = current.parentNode;
  }
  let original = origins.get(current);
  for (let i = path.length - 1; i >= 0; i--) {
    original = original.childNodes[path[i]];
  }
  return original;
}
