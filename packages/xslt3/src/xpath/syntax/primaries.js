/**
 * Parser of XPath 3.1 primary expressions: productions [56] PrimaryExpr to
 * [68] NamedFunctionRef and [76] UnaryLookup of Appendix A.1. Postfixes are
 * in postfix.js; function, map and array constructors in constructors.js.
 *
 * Reserved-function-names constraint (A.3): an unprefixed name from
 * {@link RESERVED_FUNCTION_NAMES} cannot be called or referenced as a
 * function, so `if(1)` or `node#0` never are function calls.
 *
 * @module @tradik/xslt3/xpath/syntax/primaries
 */

import { makeNode } from "./ast.js";
import {
  parseCurlyArrayConstructor,
  parseInlineFunctionExpr,
  parseMapConstructor,
  parseSquareArrayConstructor,
} from "./constructors.js";
import { parseExpr } from "./expressions.js";
import { parseArgumentList, parseKeySpecifier } from "./postfix.js";
import { isPlainName, qName } from "./tokenStream.js";

/** @typedef {import("./tokenStream.js").TokenStream} TokenStream */
/** @typedef {import("./ast.js").Expr} Expr */

/** Unprefixed names that are not function names (XPath 3.1 A.3). */
export const RESERVED_FUNCTION_NAMES = new Set(
  (
    "array attribute comment document-node element empty-sequence function " +
    "if item map namespace-node node processing-instruction schema-attribute " +
    "schema-element switch text typeswitch"
  ).split(" "),
);

/**
 * PrimaryExpr: literals, variable references, parenthesized expressions,
 * `.`, function calls and references, constructors and `?key`.
 *
 * @param {TokenStream} p - Tokens
 * @returns {Expr} The expression
 */
export function parsePrimaryExpr(p) {
  const token = p.peek();
  switch (token.type) {
    case "integer":
    case "decimal":
    case "double":
      p.next();
      return makeNode(
        "NumericLiteral",
        { kind: token.type, value: token.value },
        token.start,
        token.end,
      );
    case "string":
      p.next();
      return makeNode(
        "StringLiteral",
        { value: token.value },
        token.start,
        token.end,
      );
    case "name":
      return parseNamedPrimary(p);
  }
  if (p.isSymbol("$")) return parseVarRef(p);
  if (p.isSymbol("(")) return parseParenthesizedExpr(p);
  if (p.isSymbol("[")) return parseSquareArrayConstructor(p);
  if (p.acceptSymbol(".")) {
    return makeNode("ContextItemExpr", {}, token.start, token.end);
  }
  if (p.acceptSymbol("?")) {
    const { keyKind, key, end } = parseKeySpecifier(p);
    return makeNode("UnaryLookup", { keyKind, key }, token.start, end);
  }
  return p.fail("Expected an expression");
}

/**
 * A primary expression that starts with a name: `f#2`, `function(...)`,
 * `map {...}`, `array {...}` or a function call. Plain names never get
 * here: the path parser makes name tests of them.
 *
 * @param {TokenStream} p - Tokens
 * @returns {Expr} The expression
 */
function parseNamedPrimary(p) {
  const token = p.peek();
  if (p.isKeyword("function") && p.isSymbol("(", 1)) {
    return parseInlineFunctionExpr(p);
  }
  if (p.isSymbol("{", 1)) {
    if (p.isKeyword("map")) return parseMapConstructor(p);
    if (p.isKeyword("array")) return parseCurlyArrayConstructor(p);
  }
  if (isPlainName(token) && RESERVED_FUNCTION_NAMES.has(token.local)) {
    p.fail("Reserved name used as a function name");
  }
  p.next();
  if (p.acceptSymbol("#")) {
    const arity = p.peek();
    if (arity.type !== "integer") {
      p.fail("Expected the arity, an integer literal");
    }
    p.next();
    return makeNode(
      "NamedFunctionRef",
      { name: qName(token), arity: Number(arity.value) },
      token.start,
      arity.end,
    );
  }
  const { arguments: args, end } = parseArgumentList(p);
  return makeNode(
    "FunctionCall",
    { name: qName(token), arguments: args },
    token.start,
    end,
  );
}

/**
 * ParenthesizedExpr ::= "(" Expr? ")"; `()` gives an EmptySequence, `(E)`
 * the node of E.
 *
 * @param {TokenStream} p - Tokens, at "("
 * @returns {Expr} The expression
 */
export function parseParenthesizedExpr(p) {
  const open = p.expectSymbol("(");
  const close = p.acceptSymbol(")");
  if (close) return makeNode("EmptySequence", {}, open.start, close.end);
  const expr = parseExpr(p);
  p.expectSymbol(")");
  return expr;
}

/**
 * VarRef ::= "$" VarName
 *
 * @param {TokenStream} p - Tokens, at "$"
 * @returns {import("./ast.js").VarRef} The reference
 */
export function parseVarRef(p) {
  const dollar = p.expectSymbol("$");
  const name = p.expectName("a variable name");
  return makeNode("VarRef", { name: qName(name) }, dollar.start, name.end);
}
