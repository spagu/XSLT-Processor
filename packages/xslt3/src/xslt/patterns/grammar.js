/**
 * The grammar of patterns (XSLT 3.0 section 5.5.2): a pattern is parsed
 * as an XPath expression, then checked against the production Pattern30:
 * a predicate pattern `.[P]...`, or unions, intersections and
 * differences of path patterns whose steps are forward axis steps,
 * parenthesized patterns with predicates, and rooted first steps
 * (`$var`, doc(), id(), element-with-id(), key(), root()) whose arguments
 * are variable references or literals.
 *
 * @module @tradik/xslt3/xslt/patterns/grammar
 */

import { NS } from "../../functions/signatures.js";
import { withoutComments } from "../compiler/avt.js";
import { xsltError } from "../names.js";

/** Axes allowed in patterns. */
const FORWARD_AXES = new Set([
  "child",
  "descendant",
  "attribute",
  "self",
  "descendant-or-self",
  "namespace",
]);

/** Functions allowed as the root of a path pattern, by local name. */
const ROOT_FUNCTIONS = new Set(["doc", "id", "element-with-id", "key", "root"]);

/** Argument kinds allowed in those calls. */
const ARGUMENTS = new Set(["VarRef", "StringLiteral", "NumericLiteral"]);

/**
 * @param {string} message
 * @returns {Error} XTSE0340
 */
const invalid = (message) => xsltError("XTSE0340", message);

/**
 * Removes the predicates of a filter expression.
 * @param {object} ast
 * @returns {object} the filtered expression
 */
export function unfiltered(ast) {
  let base = ast;
  while (base.type === "FilterExpr") base = base.base;
  return base;
}

/**
 * Whether an expression is a predicate pattern `.[P]...`.
 * @param {object} ast
 * @returns {boolean}
 */
export const isPredicatePattern = (ast) =>
  unfiltered(ast).type === "ContextItemExpr";

/**
 * Whether a call is a rooted step: one of the allowed functions in the
 * standard function namespace.
 * @param {object} ast - A FunctionCall
 * @returns {boolean}
 */
function isRootFunction(ast) {
  const { prefix, uri, local } = ast.name;
  const standard =
    uri === NS.fn || (uri === null && (prefix === null || prefix === "fn"));
  return standard && ROOT_FUNCTIONS.has(local);
}

/**
 * Checks a rooted step `$v[...]` or `f(...)[...]`.
 * @param {object} ast
 */
function checkRooted(ast) {
  const base = unfiltered(ast);
  if (base.type === "VarRef") return;
  if (!isRootFunction(base)) {
    throw invalid(`${base.name.local}() cannot start a pattern`);
  }
  if (base.name.local === "root" && base.arguments.length > 0) {
    throw invalid("root() in a pattern takes no argument");
  }
  for (const argument of base.arguments) {
    if (!ARGUMENTS.has(argument.type)) {
      throw invalid("Arguments in a pattern must be variables or literals");
    }
  }
}

/**
 * Whether a step is rooted (a variable or a function call, filtered).
 * @param {object} ast
 * @returns {boolean}
 */
export const isRootedStep = (ast) => {
  const type = unfiltered(ast).type;
  return type === "VarRef" || type === "FunctionCall";
};

/**
 * Checks one step of a path pattern.
 * @param {object} ast
 * @param {boolean} first - The first step of a relative path
 */
function checkStep(ast, first) {
  if (ast.type === "AxisStep") {
    if (!FORWARD_AXES.has(ast.axis)) {
      throw invalid(`The ${ast.axis} axis is not allowed in a pattern`);
    }
    return;
  }
  if (isRootedStep(ast)) {
    if (!first) throw invalid("A rooted step must come first in a pattern");
    checkRooted(ast);
    return;
  }
  const base = unfiltered(ast);
  if (
    base.type === "SetExpr" ||
    base.type === "PathExpr" ||
    (base.type === "AxisStep" && base !== ast)
  ) {
    checkUnion(base);
    return;
  }
  throw invalid("Invalid step in a pattern");
}

/**
 * Checks a UnionExprP (no predicate pattern inside).
 * @param {object} ast
 */
function checkUnion(ast) {
  if (ast.type === "SetExpr") {
    checkUnion(ast.left);
    checkUnion(ast.right);
    return;
  }
  if (ast.type === "PathExpr") {
    ast.steps.forEach((step, i) => checkStep(step, i === 0 && !ast.absolute));
    return;
  }
  checkStep(ast, true);
}

/** Functions a pattern cannot call, with their error codes. */
const FORBIDDEN = {
  "current-merge-group": "XTSE3470",
  "current-merge-key": "XTSE3500",
};

/**
 * Checks that a pattern calls none of the forbidden functions.
 * @param {*} node - A node of the syntax tree (or any value in it)
 */
function checkFunctions(node) {
  if (Array.isArray(node)) {
    node.forEach(checkFunctions);
    return;
  }
  if (typeof node !== "object" || node === null) return;
  if (node.type === "FunctionCall" || node.type === "NamedFunctionRef") {
    const code = FORBIDDEN[node.name.local];
    const { uri, prefix } = node.name;
    const standard =
      uri === NS.fn || (uri === null && (prefix ?? "fn") === "fn");
    if (code && standard) {
      throw xsltError(code, `${node.name.local}() cannot be used in a pattern`);
    }
  }
  for (const value of Object.values(node)) checkFunctions(value);
}

/**
 * Checks a pattern.
 * @param {object} ast - The parsed pattern
 * @param {string} text - Its source text
 * @throws {import("../../errors.js").XPathError} XTSE0340
 */
export function checkPattern(ast, text) {
  checkFunctions(ast);
  if (isPredicatePattern(ast)) {
    if (/\S/.test(withoutComments(text.slice(0, unfiltered(ast).start)))) {
      throw invalid("A predicate pattern cannot be parenthesized");
    }
    return;
  }
  checkUnion(ast);
}
