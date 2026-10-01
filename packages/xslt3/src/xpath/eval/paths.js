/**
 * Compilers of path expressions, axis steps, predicates, filter
 * expressions and the node set operators (XPath 3.1 sections 3.3, 3.4).
 *
 * `//T` is compiled as `descendant::T` when the predicates of T do not
 * depend on the context position (see positional.js), instead of
 * `descendant-or-self::node()/child::T`, which gives the same nodes.
 *
 * @module @tradik/xslt3/xpath/eval/paths
 */

import { XPathError } from "../../errors.js";
import { isNode } from "../../xdm/atomic.js";
import { axes, REVERSE_AXES } from "./axes.js";
import { rootOf } from "./domNodes.js";
import { compileNodeTest } from "./nodeTests.js";
import { isPositionIndependent } from "./positional.js";
import { compilePredicate } from "./predicates.js";
import { contextItem } from "./scope.js";
import { stepper } from "./steps.js";

/**
 * @param {import("./scope.js").Context} ctx
 * @param {string} code - Error code when the context item is not a node
 * @returns {Node} the context node
 */
function contextNode(ctx, code) {
  const item = contextItem(ctx);
  if (!isNode(item)) {
    throw new XPathError(code, "The context item is not a node");
  }
  return item;
}

/**
 * Whether a step is `descendant-or-self::node()` and the next one a child
 * step whose predicates do not depend on the position, which together are
 * a descendant step.
 */
const isDescendantShortcut = (step, next, sc) =>
  step.type === "AxisStep" &&
  step.axis === "descendant-or-self" &&
  step.nodeTest.type === "AnyKindTest" &&
  step.predicates.length === 0 &&
  next?.type === "AxisStep" &&
  next.axis === "child" &&
  next.predicates.every((p) => isPositionIndependent(p, sc));

/**
 * How many nodes of an axis a step needs: N for a first predicate that is
 * the integer literal N, all of them otherwise.
 * @param {import("../syntax/ast.js").Expr|undefined} predicate
 * @returns {number}
 */
const positionalLimit = (predicate) =>
  predicate?.type === "NumericLiteral" && predicate.kind === "integer"
    ? Math.max(Number(predicate.value), 0)
    : Infinity;

/** Compilers by node type. */
export const pathCompilers = {
  AxisStep(node, scope, compile) {
    const axis = axes[node.axis];
    const test = compileNodeTest(node.nodeTest, node.axis, scope.sc);
    const predicates = node.predicates.map((p) =>
      compilePredicate(p, scope, compile),
    );
    const limit = positionalLimit(node.predicates[0]);
    const reverse = REVERSE_AXES.has(node.axis);
    return (ctx) => {
      let nodes = axis(contextNode(ctx, "XPTY0020"), test, limit);
      for (const predicate of predicates) nodes = predicate(nodes, ctx);
      return reverse ? nodes.reverse() : nodes;
    };
  },

  PathExpr(node, scope, compile) {
    const steps = [...node.steps];
    for (let i = 0; i < steps.length - 1; i++) {
      if (isDescendantShortcut(steps[i], steps[i + 1], scope.sc)) {
        steps.splice(i, 2, { ...steps[i + 1], axis: "descendant" });
      }
    }
    const compiled = steps.map((step) => {
      const evaluate = compile(step, scope);
      const axis = step.type === "AxisStep" ? step.axis : null;
      return { evaluate, run: stepper(evaluate, axis) };
    });
    const sortedStart = node.absolute || steps[0].type === "AxisStep";
    const start = node.absolute
      ? (ctx) => {
          const root = rootOf(contextNode(ctx, "XPTY0020"));
          if (root.nodeType !== 9 && root.nodeType !== 11) {
            throw new XPathError(
              "XPDY0050",
              "The root of the context node is not a document node",
            );
          }
          return [root];
        }
      : compiled.shift().evaluate;
    return (ctx) => {
      let current = start(ctx);
      let sorted = sortedStart;
      for (const { run } of compiled) {
        current = run(current, ctx, sorted);
        sorted = true;
      }
      return current;
    };
  },

  FilterExpr(node, scope, compile) {
    const base = compile(node.base, scope);
    const predicate = compilePredicate(node.predicate, scope, compile);
    return (ctx) => predicate(base(ctx), ctx);
  },

  SetExpr(node, scope, compile) {
    const left = compile(node.left, scope);
    const right = compile(node.right, scope);
    const operator = node.operator;
    const nodesOf = (sequence) => {
      if (!sequence.every(isNode)) {
        throw new XPathError(
          "XPTY0004",
          `The operands of ${operator} must be nodes`,
        );
      }
      return sequence;
    };
    return (ctx) => {
      const a = nodesOf(left(ctx));
      const b = nodesOf(right(ctx));
      if (operator === "union") return ctx.dyn.order.sort(a.concat(b));
      const inRight = new Set(b);
      const keep = operator === "intersect";
      return ctx.dyn.order.sort(a.filter((n) => inRight.has(n) === keep));
    };
  },
};
