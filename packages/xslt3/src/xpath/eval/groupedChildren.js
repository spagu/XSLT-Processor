/**
 * `//T[P]` with a positional predicate (`//item[last()]`, `//x[1]`):
 * `descendant-or-self::node()/child::T[P]`, which cannot become
 * `descendant::T[P]` (see positional.js) because P sees the position of a
 * node among the T children of its parent.
 *
 * Instead of applying `child::T[P]` to every node of the tree (one context
 * and one child walk per node, text nodes included), one descendant walk
 * collects the T nodes, grouped by parent in document order; P filters
 * each group as it would filter the children of that parent. A parent
 * without T children gives nothing in both evaluations.
 *
 * @module @tradik/xslt3/xpath/eval/groupedChildren
 */

import { XPathError } from "../../errors.js";
import { isNode } from "../../xdm/atomic.js";
import { axisNodes } from "./descendantMemo.js";
import { parentOf } from "./domNodes.js";
import { compileNodeTest } from "./nodeTests.js";
import { compilePredicate } from "./predicates.js";

/**
 * Whether a step is `descendant-or-self::node()` and the next one a child
 * step: the pair `groupedChildren` evaluates (when the descendant shortcut
 * of paths.js does not apply).
 * @param {object} step
 * @param {object|undefined} next
 * @returns {boolean}
 */
export const isGroupedChildren = (step, next) =>
  step.type === "AxisStep" &&
  step.axis === "descendant-or-self" &&
  step.nodeTest.type === "AnyKindTest" &&
  step.predicates.length === 0 &&
  next?.type === "AxisStep" &&
  next.axis === "child";

/**
 * Compiles the child step of a `descendant-or-self::node()/child::T[P]`
 * pair.
 * @param {object} step - The child AxisStep
 * @param {import("./scope.js").Scope} scope
 * @param {Function} compile
 * @returns {(input: Array, ctx: object) => Node[]} the nodes selected from
 *   the input nodes, in document order without duplicates
 */
export function compileGroupedChildren(step, scope, compile) {
  const test = compileNodeTest(step.nodeTest, "child", scope.sc);
  const predicates = step.predicates.map((p) =>
    compilePredicate(p, scope, compile),
  );
  return (input, ctx) => {
    // Candidates in document order when there is one input node
    const found = [];
    for (const node of input) {
      if (!isNode(node)) {
        throw new XPathError(
          "XPTY0019",
          "The left operand of / must contain only nodes",
        );
      }
      const nodes = axisNodes("descendant", node, test, Infinity, ctx.dyn);
      for (const n of nodes) found.push(n);
    }
    const groups = new Map();
    // Walks from nested input nodes overlap
    const seen = input.length > 1 ? new Set() : null;
    for (const node of found) {
      if (seen) {
        if (seen.has(node)) continue;
        seen.add(node);
      }
      const parent = parentOf(node);
      const group = groups.get(parent);
      if (group) group.push(node);
      else groups.set(parent, [node]);
    }
    const kept = new Set();
    for (const group of groups.values()) {
      let nodes = group;
      for (const predicate of predicates) nodes = predicate(nodes, ctx);
      for (const node of nodes) kept.add(node);
    }
    if (input.length > 1) return ctx.dyn.order.sort([...kept]);
    return found.filter((node) => kept.has(node));
  };
}
