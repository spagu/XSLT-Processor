/**
 * Path patterns of any form (XSLT 3.0 section 5.5.3), matched by their
 * formal meaning: a node N matches when it is selected by the equivalent
 * expression evaluated from some node of its tree. The steps are read
 * from the last one: for each step, the context nodes from which the
 * step can select N (the parent for child::, the ancestors for
 * descendant::...) are evaluated, and those that do select N carry on
 * to the step before. Used for the patterns the fast matcher of paths.js
 * does not handle: descendant axes, parenthesized steps, filtered rooted
 * steps, positional predicates over whole paths.
 *
 * @module @tradik/xslt3/xslt/patterns/general
 */

import { parentOf } from "../../xpath/eval/domNodes.js";
import { compileAxisOrigins, filterAlone } from "./axisOrigins.js";
import { isRootedStep, unfiltered } from "./grammar.js";

/** @param {*} node @returns {boolean} whether a node is a document node */
const isDocument = (node) => node?.nodeType === 9 || node?.nodeType === 11;

/** @param {*} item @returns {boolean} */
const isNode = (item) => typeof item?.nodeType === "number";

/**
 * Compiles one step: `origins(node, xc)` returns the context nodes from
 * which the step selects the node.
 * @param {object} step
 * @param {object} env - See compile.js
 * @param {boolean} first - First step of a relative pattern
 * @returns {{origins: (node: Node, xc: object) => Node[]}}
 */
function compileStep(step, env, first) {
  const run = env.cx.exprs.compileAst(step, env.sc, env.vars);
  const selects = (context, node, xc) =>
    run(env.cx.patternContext(context, xc, env.local)).includes(node);
  if (step.type === "AxisStep") {
    return compileAxisOrigins(step, env, first, run);
  }
  if (step.type === "FilterExpr") {
    const inner = compileStep(unfiltered(step), env, first);
    const predicates = [];
    for (let s = step; s.type === "FilterExpr"; s = s.base) {
      predicates.unshift(s.predicate);
    }
    const alone = filterAlone(predicates, env);
    return {
      origins: (node, xc) =>
        inner.origins(node, xc).flatMap((c) => {
          // a parentless node selected by itself (child-or-top)
          if (c === node && !parentOf(node)) return alone(node, xc);
          return selects(c, node, xc) ? [c] : [];
        }),
    };
  }
  if (step.type === "SetExpr") {
    // each side is a path of its own (its first step adjusted)
    const sides = [step.left, step.right].map((s) => compileStep(s, env, true));
    const union = step.operator === "union";
    return {
      origins: (node, xc) => {
        const candidates = new Set(sides[0].origins(node, xc));
        if (union) {
          for (const c of sides[1].origins(node, xc)) candidates.add(c);
        }
        return [...candidates].filter((c) => selects(c, node, xc));
      },
    };
  }
  if (step.type === "PathExpr" && !step.absolute) {
    return compilePath(step, env, true);
  }
  // an absolute path or a rooted step: any node of the tree is a context
  return { origins: (node, xc) => (selects(node, node, xc) ? [node] : []) };
}

/**
 * Compiles the steps of a relative path.
 * @param {{steps: object[]}} path
 * @param {object} env
 * @param {boolean} first - The path starts a relative pattern
 * @returns {{origins: (node: Node, xc: object) => Node[]}}
 */
function compilePath(path, env, first) {
  const steps = path.steps.map((step, i) =>
    compileStep(step, env, first && i === 0),
  );
  return {
    origins(node, xc) {
      let current = [node];
      for (let k = steps.length - 1; k >= 0 && current.length > 0; k--) {
        const next = new Set();
        for (const n of current) {
          for (const c of steps[k].origins(n, xc)) next.add(c);
        }
        current = [...next];
      }
      return current;
    },
  };
}

/**
 * Compiles a path pattern of any form.
 * @param {object} ast - PathExpr or a single step
 * @param {object} env - See compile.js
 * @returns {(item: *, xc: object) => boolean}
 */
export function compileGeneralPath(ast, env) {
  const steps = ast.type === "PathExpr" ? ast.steps : [ast];
  const absolute = ast.type === "PathExpr" && ast.absolute;
  const rootStep = !absolute && isRootedStep(steps[0]) ? steps[0] : null;
  const rest = compilePath(
    { steps: rootStep ? steps.slice(1) : steps },
    env,
    !absolute && !rootStep,
  );
  const root = rootStep
    ? env.cx.exprs.compileAst(rootStep, env.sc, env.vars)
    : null;
  return (item, xc) => {
    if (!isNode(item)) return false;
    const origins = rest.origins(item, xc);
    if (absolute) {
      return origins.some((c) => isDocument(c) && !parentOf(c));
    }
    if (!root) return origins.length > 0;
    if (origins.length === 0) return false;
    const roots = root(env.cx.patternContext(item, xc, env.local));
    return origins.some((c) => roots.includes(c));
  };
}
