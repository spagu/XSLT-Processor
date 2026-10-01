/**
 * Path patterns: the steps checked against the pattern grammar, then
 * matched from the last step upwards: the last step is tested on the
 * node, each `/` moves to the parent and each `//` to some ancestor,
 * until the first step; an absolute pattern requires a document node
 * above it.
 *
 * @module @tradik/xslt3/xslt/patterns/paths
 */

import { parentOf } from "../../xpath/eval/domNodes.js";
import { xsltError } from "../names.js";
import { compileStep, stepPriority } from "./steps.js";

/** Functions allowed as the first step of a path pattern. */
const ROOT_FUNCTIONS = new Set(["id", "key", "doc", "element-with-id", "root"]);

/** @param {*} node @returns {boolean} whether a node is a document node */
const isDocument = (node) => node?.nodeType === 9 || node?.nodeType === 11;

/**
 * Whether a step stands for `//` (descendant-or-self::node()).
 * @param {object} step
 * @returns {boolean}
 */
const isSlashSlash = (step) =>
  step.type === "AxisStep" &&
  step.axis === "descendant-or-self" &&
  step.nodeTest.type === "AnyKindTest" &&
  step.predicates.length === 0;

/**
 * Checks that a step that is not an axis step is a rooted first step
 * (key(), id(), doc(), $var...).
 * @param {object} step
 * @param {boolean} first
 */
function checkStep(step, first) {
  if (step.type === "AxisStep") return;
  const rooted =
    first &&
    ((step.type === "FunctionCall" && ROOT_FUNCTIONS.has(step.name.local)) ||
      step.type === "VarRef");
  if (!rooted) throw xsltError("XTSE0340", "Invalid step in a pattern");
}

/**
 * Builds the matcher of the parts of a path pattern.
 * @param {Array<{separator: string|null, test: {test: Function}}>} parts -
 *   Steps in order; `separator` is what precedes the step ("/", "//", or
 *   null for the first step of a relative pattern)
 * @returns {(item: *, xc: object) => boolean}
 */
export function matchParts(parts) {
  const last = parts.length - 1;
  const matchFrom = (node, k, xc) => {
    if (!parts[k].test.test(node, xc)) return false;
    const { separator } = parts[k];
    if (k === 0) {
      if (separator === null) return true;
      if (separator === "/") return isDocument(parentOf(node));
      for (let a = parentOf(node); a; a = parentOf(a)) {
        if (isDocument(a)) return true;
      }
      return false;
    }
    if (separator === "/") {
      const parent = parentOf(node);
      return parent !== null && matchFrom(parent, k - 1, xc);
    }
    for (let a = parentOf(node); a; a = parentOf(a)) {
      if (matchFrom(a, k - 1, xc)) return true;
    }
    return false;
  };
  return (item, xc) =>
    typeof item?.nodeType === "number" && matchFrom(item, last, xc);
}

/**
 * Compiles a path pattern (a PathExpr, or a single step).
 * @param {object} ast
 * @param {object} env - See compile.js
 * @returns {import("./compile.js").PatternAlternative}
 */
export function compilePathPattern(ast, env) {
  const absolute = ast.type === "PathExpr" && ast.absolute;
  const steps = ast.type === "PathExpr" ? ast.steps : [ast];
  if (absolute && steps.length === 0) {
    return { matches: (item) => isDocument(item), priority: -0.5, key: "k9" };
  }
  const parts = [];
  let separator = absolute ? "/" : null;
  for (const step of steps) {
    if (isSlashSlash(step)) {
      separator = "//";
      continue;
    }
    checkStep(step, parts.length === 0 && !absolute);
    parts.push({ separator, test: compileStep(step, env) });
    separator = "/";
  }
  const last = steps.at(-1);
  const single = parts.length === 1 && !absolute;
  return {
    matches: matchParts(parts),
    priority: single ? stepPriority(last) : 0.5,
    key: last.type === "AxisStep" ? parts.at(-1).test.key : "*",
  };
}
