/**
 * Patterns (XSLT 3.0 section 5.5): parsed as XPath expressions and
 * compiled to matchers. A union is split into alternatives, each with its
 * default priority (section 6.5); intersect and except combine patterns,
 * and predicate patterns `.[P]` match any item.
 *
 * @module @tradik/xslt3/xslt/patterns/compile
 */

import { parseXPath } from "../../xpath/syntax/index.js";
import { xsltError } from "../names.js";
import { parentOf } from "../../xpath/eval/domNodes.js";
import { derive } from "../runtime/context.js";
import { compileGeneralPath } from "./general.js";
import { checkPattern, isPredicatePattern } from "./grammar.js";
import { checkGroupingCalls } from "./patternChecks.js";
import { compilePathPattern } from "./paths.js";

/**
 * @typedef {object} PatternAlternative
 * @property {(item: *, xc: object) => boolean} matches
 * @property {number} priority - Default priority
 * @property {string} key - Index key: "e{uri}local", "a{uri}local", "k"
 *   followed by a nodeType, or "*" for any item
 */

/**
 * Splits a pattern into its union alternatives.
 * @param {object} ast
 * @returns {object[]}
 */
function alternativesOf(ast) {
  if (ast.type === "SetExpr" && ast.operator === "union") {
    return [...alternativesOf(ast.left), ...alternativesOf(ast.right)];
  }
  return [ast];
}

/**
 * Compiles a predicate pattern `.` or `.[P]` (XSLT 3.0), which matches
 * any item.
 * @param {object} ast
 * @param {object} env
 * @returns {PatternAlternative}
 */
function compilePredicatePattern(ast, env) {
  const run = env.cx.exprs.compileAst(ast, env.sc, env.vars);
  return {
    matches: (item, xc) =>
      run(env.cx.patternContext(item, xc, env.local)).length > 0,
    priority: ast.type === "ContextItemExpr" ? -1 : 1,
    key: "*",
  };
}

/**
 * Compiles `A intersect B` or `A except B` (XSLT 3.0).
 * @param {object} ast
 * @param {object} env
 * @returns {PatternAlternative}
 */
function compileSetPattern(ast, env) {
  const side = (part) =>
    alternativesOf(part).map((alternative) =>
      compileAlternative(alternative, env),
    );
  const left = side(ast.left);
  const right = side(ast.right);
  const any = (list, item, xc) => list.some((a) => a.matches(item, xc));
  const intersect = ast.operator === "intersect";
  // a node with a parent: both sides are evaluated from the same context
  const formal = compileGeneralPath(ast, env);
  return {
    matches: (item, xc) =>
      parentOf(item)
        ? formal(item, xc)
        : any(left, item, xc) && any(right, item, xc) === intersect,
    priority: 0.5,
    key: left.length === 1 ? left[0].key : "*",
  };
}

/**
 * Compiles one alternative; while it is tested, current() is the item
 * being matched, and a dynamic error is a non-match (XSLT 3.0 5.5.4).
 * @param {object} ast
 * @param {object} env - `{cx, sc, vars, local, text}`
 * @returns {PatternAlternative}
 */
function compileAlternative(ast, env) {
  let alternative;
  if (ast.type === "SetExpr") alternative = compileSetPattern(ast, env);
  else if (isPredicatePattern(ast)) {
    alternative = compilePredicatePattern(ast, env);
  } else alternative = compilePathPattern(ast, env);
  const { matches } = alternative;
  alternative.matches = (item, xc) => {
    try {
      return matches(item, xc.item === item ? xc : derive(xc, { item }));
    } catch (error) {
      if (!error.code || error.code === "XTDE0640") throw error;
      return false;
    }
  };
  return alternative;
}

/**
 * Compiles a pattern written on a stylesheet element.
 * @param {string} text
 * @param {Element} element
 * @param {object} cx - Stylesheet compiler
 * @param {object|null} [vars] - Local variables in scope (patterns of
 *   instructions); template and key patterns see the global ones only
 * @returns {{text: string, alternatives: PatternAlternative[]}}
 * @throws {import("../../errors.js").XPathError} XTSE0340 for an
 *   expression that is not a pattern
 */
export function compilePattern(text, element, cx, vars) {
  let ast;
  try {
    ast = parseXPath(text);
  } catch (error) {
    throw error.code === "XPST0003"
      ? xsltError("XTSE0340", `Invalid pattern "${text}": ${error.message}`)
      : error;
  }
  checkPattern(ast, text);
  checkGroupingCalls(ast);
  const env = {
    cx,
    sc: cx.exprs.staticContext(element),
    vars: vars === undefined ? cx.globalScope().vars : vars,
    local: vars !== undefined,
    text,
  };
  const alternatives = alternativesOf(ast).map((alternative) =>
    compileAlternative(alternative, env),
  );
  return { text, alternatives };
}

/**
 * Whether an item matches any alternative of a pattern.
 * @param {{alternatives: PatternAlternative[]}} pattern
 * @param {*} item
 * @param {object} xc
 * @returns {boolean}
 */
export const patternMatches = (pattern, item, xc) =>
  pattern.alternatives.some((alternative) => alternative.matches(item, xc));
