/**
 * Compilation of XSLT 1.0 patterns (section 5.2).
 *
 * A pattern is parsed with the XPath parser and turned into a list of
 * alternatives (one per union member). Each alternative has an anchor (the
 * root for absolute paths, an `id()`/`key()` call, or none) and a list of
 * child or attribute steps, each remembering the separator (`/` or `//`)
 * that links it to the step on its left.
 *
 * @module xslt/patternCompiler
 */

import { NodeType, parse } from "../xpath/parser.js";

const ANCHOR_FUNCTIONS = new Set(["id", "key"]);
const POSITIONAL_FUNCTIONS = new Set(["position", "last"]);

/** Marker anchor of absolute location path patterns. */
export const ROOT = Symbol("root");

/**
 * Whether an expression calls `position()` or `last()` anywhere.
 *
 * @param {*} ast - XPath AST node (or any nested value)
 * @returns {boolean} True when the expression may depend on the position
 */
function usesPosition(ast) {
  if (Array.isArray(ast)) return ast.some(usesPosition);
  if (!ast || typeof ast !== "object") return false;
  if (
    ast.type === NodeType.FUNCTION_CALL &&
    !ast.prefix &&
    POSITIONAL_FUNCTIONS.has(ast.name)
  ) {
    return true;
  }
  return Object.values(ast).some(usesPosition);
}

/**
 * Whether a step is the `descendant-or-self::node()` step that `//` expands to.
 *
 * @param {object} step - Step AST node
 * @returns {boolean} True for the abbreviated `//` step
 */
function isDescendantSeparator(step) {
  return (
    step.axis === "descendant-or-self" &&
    step.nodeTest.type === NodeType.NODE_TYPE_TEST &&
    step.nodeTest.nodeType === "node" &&
    step.predicates.length === 0
  );
}

/**
 * Split a parsed union into its alternatives.
 *
 * @param {object} ast - XPath AST
 * @param {object[]} [result] - Array to append to
 * @returns {object[]} The alternatives in pattern order
 */
function unionAlternatives(ast, result = []) {
  if (ast.type === NodeType.UNION_EXPR) {
    unionAlternatives(ast.left, result);
    unionAlternatives(ast.right, result);
  } else {
    result.push(ast);
  }
  return result;
}

/**
 * Whether an AST node is an `id()` or `key()` call.
 *
 * @param {object} ast - XPath AST node
 * @returns {boolean} True for an anchor function call
 */
function isAnchorCall(ast) {
  return (
    ast?.type === NodeType.FUNCTION_CALL &&
    !ast.prefix &&
    ANCHOR_FUNCTIONS.has(ast.name)
  );
}

/**
 * Compile one location path pattern.
 *
 * @param {object} ast - AST of one union alternative
 * @returns {{anchor: (symbol|object|null), steps: object[]}} Compiled alternative
 * @throws {Error} When the expression is not a valid pattern
 */
function compileAlternative(ast) {
  let anchor;
  let steps;

  if (ast.type === NodeType.LOCATION_PATH) {
    anchor = ast.absolute ? ROOT : null;
    steps = ast.steps;
  } else if (isAnchorCall(ast)) {
    anchor = ast;
    steps = [];
  } else if (
    ast.type === NodeType.PATH_EXPR &&
    isAnchorCall(ast.filter) &&
    !ast.predicates
  ) {
    anchor = ast.filter;
    steps = ast.steps;
  } else {
    throw new Error(`Unsupported pattern expression: ${ast.type}`);
  }

  const compiled = [];
  let separator = anchor ? "/" : null;

  for (const step of steps) {
    if (isDescendantSeparator(step)) {
      separator = "//";
      continue;
    }
    if (step.axis !== "child" && step.axis !== "attribute") {
      throw new Error(`Axis not allowed in a pattern: ${step.axis}`);
    }
    compiled.push({
      axis: step.axis,
      nodeTest: step.nodeTest,
      separator,
      predicates: step.predicates.map((predicate) => ({
        expr: predicate.expr,
        positional: usesPosition(predicate.expr),
      })),
    });
    separator = "/";
  }

  if (separator === "//") throw new Error("Pattern cannot end with //");
  return { anchor, steps: compiled };
}

/**
 * Parse and compile a pattern string.
 *
 * @param {string} pattern - The XSLT pattern
 * @returns {object[]} The compiled alternatives
 * @throws {Error} When the pattern is not valid
 *
 * @example
 * compilePattern('chapter/title | appendix//title');
 */
export function compilePattern(pattern) {
  return unionAlternatives(parse(pattern)).map(compileAlternative);
}
