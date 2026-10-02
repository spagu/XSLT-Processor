/**
 * Parser of the top of the XPath 3.1 grammar: Expr (the comma operator),
 * ExprSingle and the expressions introduced by a keyword (for, let, some,
 * every, if). Productions [6] to [15] of XPath 3.1 Appendix A.1.
 *
 * Each function takes the {@link TokenStream} and returns an AST node.
 *
 * @module @tradik/xslt3/xpath/syntax/expressions
 */

import { makeNode } from "./ast.js";
import { parseOrExpr } from "./operators.js";
import { qName } from "./tokenStream.js";

/** @typedef {import("./tokenStream.js").TokenStream} TokenStream */
/** @typedef {import("./ast.js").Expr} Expr */

/**
 * Expr ::= ExprSingle ("," ExprSingle)*
 *
 * @param {TokenStream} p - Tokens
 * @returns {Expr} A SequenceExpr for two or more items, else the item
 */
export function parseExpr(p) {
  const first = parseExprSingle(p);
  if (!p.isSymbol(",")) return first;
  const items = [first];
  while (p.acceptSymbol(",")) items.push(parseExprSingle(p));
  return makeNode("SequenceExpr", { items }, first.start, items.at(-1).end);
}

/**
 * ExprSingle ::= ForExpr | LetExpr | QuantifiedExpr | IfExpr | OrExpr.
 * A keyword starts its expression only when followed by "$" (or "(" for
 * `if`); otherwise it is an ordinary name, e.g. the element `for`.
 *
 * @param {TokenStream} p - Tokens
 * @returns {Expr} The expression
 */
export function parseExprSingle(p) {
  if (p.isSymbol("$", 1)) {
    if (p.isKeyword("for")) {
      return parseBindingExpr(p, "ForExpr", "in", "return");
    }
    if (p.isKeyword("let")) {
      return parseBindingExpr(p, "LetExpr", ":=", "return");
    }
    if (p.isKeyword("some") || p.isKeyword("every")) {
      return parseBindingExpr(p, "QuantifiedExpr", "in", "satisfies");
    }
  }
  if (p.isKeyword("if") && p.isSymbol("(", 1)) return parseIfExpr(p);
  return parseOrExpr(p);
}

/**
 * ForExpr, LetExpr and QuantifiedExpr, which share their shape:
 * keyword binding ("," binding)* final-keyword ExprSingle.
 *
 * @param {TokenStream} p - Tokens
 * @param {"ForExpr"|"LetExpr"|"QuantifiedExpr"} type - Node type
 * @param {"in"|":="} separator - Between variable and value
 * @param {"return"|"satisfies"} finalKeyword - Before the result expression
 * @returns {Expr} The node
 */
function parseBindingExpr(p, type, separator, finalKeyword) {
  const keyword = p.next();
  const bindings = [];
  do {
    const dollar = p.expectSymbol("$");
    const name = qName(p.expectName("a variable name"));
    if (separator === "in") p.expectKeyword("in");
    else p.expectSymbol(":=");
    const expr = parseExprSingle(p);
    bindings.push(makeNode("Binding", { name, expr }, dollar.start, expr.end));
  } while (p.acceptSymbol(","));
  p.expectKeyword(finalKeyword);
  const result = parseExprSingle(p);
  const fields =
    type === "QuantifiedExpr"
      ? { quantifier: keyword.local, bindings, satisfies: result }
      : { bindings, returnExpr: result };
  return makeNode(type, fields, keyword.start, result.end);
}

/**
 * IfExpr ::= "if" "(" Expr ")" "then" ExprSingle "else" ExprSingle
 *
 * @param {TokenStream} p - Tokens
 * @returns {import("./ast.js").IfExpr} The node
 */
function parseIfExpr(p) {
  const start = p.next().start;
  p.expectSymbol("(");
  const condition = parseExpr(p);
  p.expectSymbol(")");
  p.expectKeyword("then");
  const thenExpr = parseExprSingle(p);
  p.expectKeyword("else");
  const elseExpr = parseExprSingle(p);
  return makeNode(
    "IfExpr",
    { condition, thenExpr, elseExpr },
    start,
    elseExpr.end,
  );
}
