/**
 * Parser of the XPath 3.1 constructors: inline function expressions
 * (productions [69] InlineFunctionExpr, [10] ParamList, [11] Param), maps
 * ([69] MapConstructor to [72] MapValueExpr) and arrays ([73]
 * ArrayConstructor to [75] CurlyArrayConstructor) of Appendix A.1.
 *
 * @module @tradik/xslt3/xpath/syntax/constructors
 */

import { makeNode } from "./ast.js";
import { parseExpr, parseExprSingle } from "./expressions.js";
import { qName } from "./tokenStream.js";
import { parseSequenceType } from "./types.js";

/** @typedef {import("./tokenStream.js").TokenStream} TokenStream */
/** @typedef {import("./ast.js").Expr} Expr */

/**
 * EnclosedExpr ::= "{" Expr? "}"; an empty one gives an EmptySequence.
 *
 * @param {TokenStream} p - Tokens, at "{"
 * @returns {{expr: Expr, end: number}} The content and the offset after "}"
 */
function parseEnclosedExpr(p) {
  const open = p.expectSymbol("{");
  const close = p.acceptSymbol("}");
  if (close) {
    return {
      expr: makeNode("EmptySequence", {}, open.start, close.end),
      end: close.end,
    };
  }
  const expr = parseExpr(p);
  return { expr, end: p.expectSymbol("}").end };
}

/**
 * Reads `item ("," item)*` up to a closing symbol, which is consumed.
 *
 * @template T
 * @param {TokenStream} p - Tokens, after the opening symbol
 * @param {string} close - Closing symbol
 * @param {(p: TokenStream) => T} parseItem - Parser of one item
 * @returns {{items: T[], end: number}} The items and the offset after close
 */
function parseList(p, close, parseItem) {
  const items = [];
  if (!p.isSymbol(close)) {
    do items.push(parseItem(p));
    while (p.acceptSymbol(","));
  }
  return { items, end: p.expectSymbol(close).end };
}

/**
 * InlineFunctionExpr ::= "function" "(" ParamList? ")" ("as" SequenceType)?
 * FunctionBody
 *
 * @param {TokenStream} p - Tokens, at "function"
 * @returns {import("./ast.js").InlineFunctionExpr} The function
 */
export function parseInlineFunctionExpr(p) {
  const start = p.next().start;
  p.expectSymbol("(");
  const { items: params } = parseList(p, ")", parseParam);
  const returnType = p.acceptKeyword("as") ? parseSequenceType(p) : null;
  const { expr: body, end } = parseEnclosedExpr(p);
  return makeNode(
    "InlineFunctionExpr",
    { params, returnType, body },
    start,
    end,
  );
}

/**
 * Param ::= "$" EQName TypeDeclaration?
 *
 * @param {TokenStream} p - Tokens
 * @returns {import("./ast.js").Param} The parameter
 */
function parseParam(p) {
  const dollar = p.expectSymbol("$");
  const name = p.expectName("a parameter name");
  const sequenceType = p.acceptKeyword("as") ? parseSequenceType(p) : null;
  const end = sequenceType ? sequenceType.end : name.end;
  return makeNode(
    "Param",
    { name: qName(name), sequenceType },
    dollar.start,
    end,
  );
}

/**
 * MapConstructor ::= "map" "{" (MapConstructorEntry ("," ...)*)? "}"
 *
 * @param {TokenStream} p - Tokens, at "map"
 * @returns {import("./ast.js").MapConstructor} The constructor
 */
export function parseMapConstructor(p) {
  const start = p.next().start;
  p.expectSymbol("{");
  const { items: entries, end } = parseList(p, "}", parseMapEntry);
  return makeNode("MapConstructor", { entries }, start, end);
}

/**
 * MapConstructorEntry ::= ExprSingle ":" ExprSingle. Note that `map{a:b}`
 * reads the QName `a:b`; a key that is a name needs a space: `map{a :b}`.
 *
 * @param {TokenStream} p - Tokens
 * @returns {import("./ast.js").MapEntry} The entry
 */
function parseMapEntry(p) {
  const key = parseExprSingle(p);
  p.expectSymbol(":");
  const value = parseExprSingle(p);
  return makeNode("MapEntry", { key, value }, key.start, value.end);
}

/**
 * SquareArrayConstructor ::= "[" (ExprSingle ("," ExprSingle)*)? "]"
 *
 * @param {TokenStream} p - Tokens, at "["
 * @returns {import("./ast.js").SquareArrayConstructor} The constructor
 */
export function parseSquareArrayConstructor(p) {
  const start = p.next().start;
  const { items: members, end } = parseList(p, "]", parseExprSingle);
  return makeNode("SquareArrayConstructor", { members }, start, end);
}

/**
 * CurlyArrayConstructor ::= "array" EnclosedExpr
 *
 * @param {TokenStream} p - Tokens, at "array"
 * @returns {import("./ast.js").CurlyArrayConstructor} The constructor
 */
export function parseCurlyArrayConstructor(p) {
  const start = p.next().start;
  const { expr, end } = parseEnclosedExpr(p);
  return makeNode("CurlyArrayConstructor", { expr }, start, end);
}
