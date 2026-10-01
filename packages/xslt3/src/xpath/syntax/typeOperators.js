/**
 * Parser of the XPath 3.1 expressions between the binary operators and the
 * paths: productions [25] InstanceofExpr to [35] SimpleMapExpr of Appendix
 * A.1 (instance of, treat as, castable as, cast as, `=>`, unary signs and
 * `!`).
 *
 * @module @tradik/xslt3/xpath/syntax/typeOperators
 */

import { makeNode } from "./ast.js";
import { parsePathExpr } from "./paths.js";
import { parseArgumentList } from "./postfix.js";
import { parseParenthesizedExpr, parseVarRef } from "./primaries.js";
import { qName } from "./tokenStream.js";
import { parseSequenceType, parseSingleType } from "./types.js";

/** @typedef {import("./tokenStream.js").TokenStream} TokenStream */
/** @typedef {import("./ast.js").Expr} Expr */

/**
 * SimpleMapExpr ::= PathExpr ("!" PathExpr)*
 *
 * @param {TokenStream} p - Tokens
 * @returns {Expr} The node
 */
function parseSimpleMapExpr(p) {
  let left = parsePathExpr(p);
  while (p.acceptSymbol("!")) {
    const right = parsePathExpr(p);
    left = makeNode("SimpleMapExpr", { left, right }, left.start, right.end);
  }
  return left;
}

/**
 * UnaryExpr ::= ("-" | "+")* ValueExpr, ValueExpr being a SimpleMapExpr.
 *
 * @param {TokenStream} p - Tokens
 * @returns {Expr} The node
 */
function parseUnaryExpr(p) {
  const sign = p.acceptSymbol("-") ?? p.acceptSymbol("+");
  if (!sign) return parseSimpleMapExpr(p);
  const operand = parseUnaryExpr(p);
  const fields = { operator: sign.value, operand };
  return makeNode("UnaryExpr", fields, sign.start, operand.end);
}

/**
 * ArrowExpr ::= UnaryExpr ("=>" ArrowFunctionSpecifier ArgumentList)*,
 * the specifier being an EQName, a VarRef or a ParenthesizedExpr.
 *
 * @param {TokenStream} p - Tokens
 * @returns {Expr} The node
 */
function parseArrowExpr(p) {
  let expr = parseUnaryExpr(p);
  while (p.acceptSymbol("=>")) {
    let functionName = null;
    let functionExpr = null;
    if (p.peek().type === "name") functionName = qName(p.next());
    else if (p.isSymbol("$")) functionExpr = parseVarRef(p);
    else if (p.isSymbol("(")) functionExpr = parseParenthesizedExpr(p);
    else p.fail('Expected a function after "=>"');
    const { arguments: args, end } = parseArgumentList(p);
    const fields = { expr, functionName, functionExpr, arguments: args };
    expr = makeNode("ArrowExpr", fields, expr.start, end);
  }
  return expr;
}

/**
 * Builds the parser of `E keyword1 keyword2 Type` (instance of, treat as,
 * castable as, cast as). Each operator may appear at most once.
 *
 * @param {string} type - Node type
 * @param {string} keywords - The two keywords, space-separated
 * @param {(p: TokenStream) => Expr} operand - Parser of the next level
 * @param {boolean} single - SingleType (cast, castable) or SequenceType
 * @returns {(p: TokenStream) => Expr} Parser of the level
 */
function typeLevel(type, keywords, operand, single) {
  const [first, second] = keywords.split(" ");
  return (p) => {
    const expr = operand(p);
    if (!p.acceptKeyword(first)) return expr;
    p.expectKeyword(second);
    if (single) {
      const { name, emptyAllowed, end } = parseSingleType(p);
      const fields = { expr, targetType: name, emptyAllowed };
      return makeNode(type, fields, expr.start, end);
    }
    const sequenceType = parseSequenceType(p);
    return makeNode(type, { expr, sequenceType }, expr.start, sequenceType.end);
  };
}

const parseCastExpr = typeLevel("CastExpr", "cast as", parseArrowExpr, true);
const parseCastableExpr = typeLevel(
  "CastableExpr",
  "castable as",
  parseCastExpr,
  true,
);
const parseTreatExpr = typeLevel(
  "TreatExpr",
  "treat as",
  parseCastableExpr,
  false,
);
const parseInstanceof = typeLevel(
  "InstanceOfExpr",
  "instance of",
  parseTreatExpr,
  false,
);

/**
 * InstanceofExpr ::= TreatExpr ("instance" "of" SequenceType)?, the entry
 * point of this module.
 *
 * @param {TokenStream} p - Tokens
 * @returns {Expr} The node
 */
export function parseInstanceofExpr(p) {
  return parseInstanceof(p);
}
