/**
 * Axis results remembered for the rest of an evaluation, so that
 * `for $c in ... return //item[@cat = $c]` walks the tree and looks the
 * attributes up once instead of once per iteration:
 *
 * - the descendant axes of a document node, always;
 * - the attributes looked up by name, once the evaluation has walked a
 *   tree a second time (a remembered descendant axis was used): before
 *   that, in one pass over the tree, remembering costs more than it saves.
 *
 * Only an evaluation that owns its dynamic context turns it on
 * (compileXPath's evaluate sets `dyn.descendantMemo`): an XPath evaluation
 * does not change existing trees (the nodes that functions build are new,
 * complete trees), so a remembered result stays exact while it runs. A
 * caller that shares a dynamic context over trees it changes leaves it
 * off.
 *
 * @module @tradik/xslt3/xpath/eval/descendantMemo
 */

import { axes } from "./axes.js";

/** Axes worth remembering: whole subtrees. */
const MEMO_AXES = new Set(["descendant", "descendant-or-self"]);

/**
 * @typedef {object} DescendantMemo
 * @property {Map<string, Map<Function, Map<Node, Node[]>>>|null} results -
 *   By axis, node test and context node
 * @property {boolean} repeated - Whether a remembered descendant axis was
 *   used again
 */

/** @returns {DescendantMemo} the memo of an evaluation */
export const createDescendantMemo = () => ({ results: null, repeated: false });

/**
 * Whether the result of an axis is remembered.
 * @returns {boolean}
 */
function isRemembered(memo, name, node, test, limit) {
  if (name === "attribute") {
    return memo.repeated && test.qname !== undefined && limit >= 1;
  }
  const type = node.nodeType;
  return (
    limit === Infinity && MEMO_AXES.has(name) && (type === 9 || type === 11)
  );
}

/**
 * The nodes of an axis, from the memo of the evaluation when there is one
 * and the axis is remembered.
 * @param {string} name - Axis name
 * @param {Node} node - Context node
 * @param {(node: Node) => boolean} test - Node test (one function per
 *   compiled step, so it identifies the step)
 * @param {number} limit - Most nodes to collect
 * @param {object} dyn - Dynamic context
 * @returns {Node[]} the nodes in axis order (a new array)
 */
export function axisNodes(name, node, test, limit, dyn) {
  const memo = dyn.descendantMemo;
  if (!memo || !isRemembered(memo, name, node, test, limit)) {
    return axes[name](node, test, limit);
  }
  // Created on first use: most evaluations never need it
  memo.results ??= new Map();
  let byTest = memo.results.get(name);
  if (!byTest) memo.results.set(name, (byTest = new Map()));
  let byNode = byTest.get(test);
  if (!byNode) byTest.set(test, (byNode = new Map()));
  let nodes = byNode.get(node);
  if (nodes) memo.repeated = true;
  else byNode.set(node, (nodes = axes[name](node, test, limit)));
  return nodes.slice();
}
