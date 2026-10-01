/**
 * Parser of XPath 3.1 postfix expressions: productions [49] PostfixExpr,
 * [50] ArgumentList, [53] Lookup and [54] KeySpecifier of Appendix A.1
 * (predicates, dynamic function calls and lookups after a primary).
 *
 * @module @tradik/xslt3/xpath/syntax/postfix
 */

import { makeNode } from "./ast.js";
import { parseExprSingle } from "./expressions.js";
import { parseParenthesizedExpr, parsePrimaryExpr } from "./primaries.js";
import { parsePredicate } from "./steps.js";
import { isPlainName } from "./tokenStream.js";

/** @typedef {import("./tokenStream.js").TokenStream} TokenStream */
/** @typedef {import("./ast.js").Expr} Expr */

/**
 * PostfixExpr ::= PrimaryExpr (Predicate | ArgumentList | Lookup)*
 *
 * @param {TokenStream} p - Tokens
 * @returns {Expr} The expression
 */
export function parsePostfixExpr(p) {
  let expr = parsePrimaryExpr(p);
  for (;;) {
    if (p.isSymbol("[")) {
      const { predicate, end } = parsePredicate(p);
      expr = makeNode("FilterExpr", { base: expr, predicate }, expr.start, end);
    } else if (p.isSymbol("(")) {
      const { arguments: args, end } = parseArgumentList(p);
      expr = makeNode(
        "DynamicFunctionCall",
        { functionExpr: expr, arguments: args },
        expr.start,
        end,
      );
    } else if (p.acceptSymbol("?")) {
      const { keyKind, key, end } = parseKeySpecifier(p);
      expr = makeNode("Lookup", { base: expr, keyKind, key }, expr.start, end);
    } else {
      return expr;
    }
  }
}

/**
 * ArgumentList ::= "(" (Argument ("," Argument)*)? ")", an Argument being
 * an ExprSingle or the placeholder "?" (partial function application).
 *
 * @param {TokenStream} p - Tokens, at "("
 * @returns {{arguments: Array<Expr|import("./ast.js").ArgumentPlaceholder>, end: number}}
 *   The arguments and the offset after ")"
 */
export function parseArgumentList(p) {
  p.expectSymbol("(");
  const args = [];
  if (!p.isSymbol(")")) {
    do {
      if (p.isSymbol("?") && (p.isSymbol(",", 1) || p.isSymbol(")", 1))) {
        const { start, end } = p.next();
        args.push(makeNode("ArgumentPlaceholder", {}, start, end));
      } else {
        args.push(parseExprSingle(p));
      }
    } while (p.acceptSymbol(","));
  }
  return { arguments: args, end: p.expectSymbol(")").end };
}

/**
 * KeySpecifier ::= NCName | IntegerLiteral | ParenthesizedExpr | "*", after
 * the "?" of a lookup.
 *
 * @param {TokenStream} p - Tokens
 * @returns {{keyKind: string, key: string|Expr|null, end: number}} The key
 */
export function parseKeySpecifier(p) {
  const token = p.peek();
  if (isPlainName(token) || token.type === "integer") {
    p.next();
    const keyKind = token.type === "name" ? "name" : "integer";
    return { keyKind, key: token.local ?? token.value, end: token.end };
  }
  if (p.acceptSymbol("*")) {
    return { keyKind: "wildcard", key: null, end: token.end };
  }
  if (!p.isSymbol("(")) p.fail('Expected a key: NCName, integer, "(" or "*"');
  const key = parseParenthesizedExpr(p);
  return { keyKind: "expr", key, end: p.lastEnd };
}
