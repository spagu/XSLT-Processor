/**
 * The `/` operator: a step applied to each node of the left operand, and
 * the results combined (XPath 3.1 section 3.3.1.1): nodes in document
 * order without duplicates, or atomic values and functions in order.
 *
 * Sorting is skipped where the order is known: a single input node and an
 * axis step, or sorted sibling inputs and an axis that stays inside each
 * input's subtree (child, attribute, namespace, self, descendant,
 * descendant-or-self), whose results are then disjoint and in order.
 *
 * @module @tradik/xslt3/xpath/eval/steps
 */

import { XPathError } from "../../errors.js";
import { isNode } from "../../xdm/atomic.js";
import { isContainer, parentOf } from "./domNodes.js";
import { withFocus } from "./scope.js";

const EMPTY = Object.freeze([]);

/** Axes that select inside the subtree of the context node. */
const SUBTREE_AXES = new Set([
  "child",
  "attribute",
  "namespace",
  "self",
  "descendant",
  "descendant-or-self",
]);

/** Axes that select only children or descendants of the context node. */
const CHILD_AXES = new Set(["child", "descendant"]);

/**
 * Combines the results of a step applied to each input item.
 * @param {Array[]} results - One sequence per input item
 * @param {import("./scope.js").Context} ctx
 * @returns {Array} nodes in document order, or the concatenated values
 * @throws {XPathError} XPTY0018 when nodes and other items are mixed
 */
function combine(results, ctx) {
  const all = results.flat();
  let nodes = 0;
  for (const item of all) if (isNode(item)) nodes++;
  if (nodes === 0) return all;
  if (nodes !== all.length) {
    throw new XPathError(
      "XPTY0018",
      "A path step returned both nodes and other items",
    );
  }
  return ctx.dyn.order.sort(all);
}

/**
 * @param {Node[]} nodes - At least two nodes
 * @returns {boolean} whether all the nodes have the same parent
 */
function areSiblings(nodes) {
  const parent = parentOf(nodes[0]);
  if (parent === null) return false;
  for (let i = 1; i < nodes.length; i++) {
    if (parentOf(nodes[i]) !== parent) return false;
  }
  return true;
}

/**
 * Evaluator of `E1/E2` for an evaluated E1.
 * @param {import("./scope.js").Evaluator} step - E2
 * @param {string|null} axis - Axis of E2 when it is an axis step
 * @returns {(input: Array, ctx: object, sorted: boolean) => Array} the
 *   combined result; `sorted` tells that the input is in document order
 */
export function stepper(step, axis) {
  const subtree = SUBTREE_AXES.has(axis);
  const childless = CHILD_AXES.has(axis);
  return (input, ctx, sorted) => {
    const size = input.length;
    if (size === 0) return EMPTY;
    const results = [];
    for (let i = 0; i < size; i++) {
      if (!isNode(input[i])) {
        throw new XPathError(
          "XPTY0019",
          "The left operand of / must contain only nodes",
        );
      }
      // An axis step finds no children nor descendants of a leaf node (a
      // shortcut for the text nodes reached by `//`)
      if (childless && !isContainer(input[i])) continue;
      results.push(step(withFocus(ctx, input[i], i + 1, size)));
    }
    if (size === 1 && axis !== null) return results[0] ?? EMPTY;
    if (sorted && subtree && areSiblings(input)) return results.flat();
    return combine(results, ctx);
  };
}
