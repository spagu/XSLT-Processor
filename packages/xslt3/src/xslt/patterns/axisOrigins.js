/**
 * The origins of an axis step in a pattern (see general.js): the nodes
 * from which the step selects a node, found through the inverse of its
 * axis, with the child-or-top, attribute-or-top and namespace-or-top
 * adjustments of the first step of a relative pattern (XSLT 3.0 section
 * 5.5.3).
 *
 * @module @tradik/xslt3/xslt/patterns/axisOrigins
 */

import { parentOf } from "../../xpath/eval/domNodes.js";
import { compileNode } from "../../xpath/eval/compiler.js";
import { compileNodeTest } from "../../xpath/eval/nodeTests.js";
import { compilePredicate } from "../../xpath/eval/predicates.js";

/** Node kinds the child-or-top axis selects when they have no parent. */
const TOP_KINDS = new Set([1, 3, 4, 7, 8]);

/**
 * The ancestors of a node, nearest first.
 * @param {Node} node
 * @returns {Node[]}
 */
function ancestors(node) {
  const result = [];
  for (let a = parentOf(node); a; a = parentOf(a)) result.push(a);
  return result;
}

/**
 * The nodes from which an axis can reach a node.
 * @param {string} axis
 * @param {Node} node
 * @returns {Node[]}
 */
function inverseAxis(axis, node) {
  switch (axis) {
    case "self":
      return [node];
    case "descendant":
      return ancestors(node);
    case "descendant-or-self":
      return [node, ...ancestors(node)];
    default: {
      const parent = parentOf(node);
      return parent ? [parent] : [];
    }
  }
}

/**
 * Whether a step selects nodes as child-or-top / attribute-or-top /
 * namespace-or-top does for a parentless node (the first step of a
 * relative pattern).
 * @param {object} step - AxisStep
 * @param {Node} node
 * @returns {boolean}
 */
function selectsTop(step, node) {
  if (parentOf(node)) return false;
  if (step.axis === "child") return TOP_KINDS.has(node.nodeType);
  return step.axis === "attribute" || step.axis === "namespace";
}

/**
 * Compiles predicates applied to a node alone (position 1 of 1).
 * @param {object[]} predicates
 * @param {object} env
 * @returns {(node: Node, xc: object) => Node[]} [node] when it passes
 */
export function filterAlone(predicates, env) {
  const scope = { sc: env.sc, vars: env.vars };
  const compiled = predicates.map((p) =>
    compilePredicate(p, scope, compileNode),
  );
  return (node, xc) => {
    const ctx = env.cx.patternContext(node, xc, env.local);
    let items = [node];
    for (const predicate of compiled) items = predicate(items, ctx);
    return items;
  };
}

/**
 * Compiles an axis step: `origins(node, xc)` returns the context nodes
 * from which the step selects the node.
 * @param {object} step - AxisStep
 * @param {object} env - See compile.js
 * @param {boolean} first - First step of a relative pattern
 * @param {(ctx: object) => Array} run - The step compiled as an expression
 * @returns {{origins: (node: Node, xc: object) => Node[]}}
 */
export function compileAxisOrigins(step, env, first, run) {
  // document-node() without an axis matches document nodes (self axis)
  const documentStep =
    first &&
    step.axis === "child" &&
    step.nodeTest.type === "DocumentTest" &&
    !env.text.startsWith("child::", step.start);
  const axis = documentStep ? "self" : step.axis;
  const effective = documentStep ? { ...step, axis } : step;
  const evaluate = documentStep
    ? env.cx.exprs.compileAst(effective, env.sc, env.vars)
    : run;
  const nodeTest = compileNodeTest(step.nodeTest, axis, env.sc);
  const simple = step.predicates.length === 0;
  const alone = filterAlone(step.predicates, env);
  return {
    origins(node, xc) {
      if (first && !documentStep && selectsTop(step, node)) {
        // the predicates see the node alone (position 1 of 1)
        return nodeTest(node) ? alone(node, xc) : [];
      }
      const candidates = inverseAxis(axis, node);
      if (simple) return nodeTest(node) ? candidates : [];
      return candidates.filter((c) =>
        evaluate(env.cx.patternContext(c, xc, env.local)).includes(node),
      );
    },
  };
}
