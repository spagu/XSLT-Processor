/**
 * Static test of whether a predicate depends on the context position or
 * size: when it does not, `//T[P]` (`descendant-or-self::node()/child::T[P]`)
 * selects the same nodes as `descendant::T[P]`, which needs no sorting.
 *
 * The test is syntactic and conservative: the predicate must evaluate to a
 * boolean or to nodes (never to a number, which would select by position)
 * and must not call position() or last() anywhere.
 *
 * @module @tradik/xslt3/xpath/eval/positional
 */

import { NS } from "../../functions/signatures.js";

/** Expressions that always return a boolean or nodes. */
const NON_NUMERIC = new Set([
  "ComparisonExpr",
  "LogicalExpr",
  "QuantifiedExpr",
  "InstanceOfExpr",
  "CastableExpr",
  "AxisStep",
]);

/** Built-in functions returning xs:boolean. */
const BOOLEAN_FUNCTIONS = new Set([
  "not",
  "boolean",
  "exists",
  "empty",
  "true",
  "false",
  "contains",
  "starts-with",
  "ends-with",
  "matches",
  "deep-equal",
]);

/**
 * @param {import("../syntax/ast.js").QName} name
 * @param {import("./staticContext.js").StaticContext} sc
 * @returns {boolean} whether the name is a built-in function name
 */
const isBuiltIn = (name, sc) =>
  name.uri === null &&
  (name.prefix === null
    ? sc.defaultFunctionNamespace === NS.fn
    : sc.namespaces.get(name.prefix) === NS.fn);

/**
 * Whether an AST contains a call or reference to position() or last().
 * @param {*} node
 * @returns {boolean}
 */
function usesFocusSize(node) {
  if (Array.isArray(node)) return node.some(usesFocusSize);
  if (node === null || typeof node !== "object") return false;
  const named =
    node.type === "FunctionCall" || node.type === "NamedFunctionRef";
  if (named && ["position", "last"].includes(node.name.local)) return true;
  return Object.values(node).some(usesFocusSize);
}

/**
 * Whether a predicate selects the same items whatever the context
 * position and size.
 * @param {import("../syntax/ast.js").Expr} predicate
 * @param {import("./staticContext.js").StaticContext} sc
 * @returns {boolean}
 */
export function isPositionIndependent(predicate, sc) {
  const { type } = predicate;
  const nonNumeric =
    NON_NUMERIC.has(type) ||
    (type === "PathExpr" && predicate.steps.at(-1)?.type === "AxisStep") ||
    (type === "FunctionCall" &&
      BOOLEAN_FUNCTIONS.has(predicate.name.local) &&
      isBuiltIn(predicate.name, sc));
  return nonNumeric && !usesFocusSize(predicate);
}
