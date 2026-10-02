/**
 * Parser of the XPath 3.1 binary operator expressions, from `or` (lowest
 * precedence) down to `intersect`/`except`: productions [8] OrExpr to [24]
 * IntersectExceptExpr of Appendix A.1. The levels below (instance of ... !)
 * are in typeOperators.js.
 *
 * Operator keywords are recognised only here, in operator position, so
 * `div div div` divides the child element `div` by itself.
 *
 * @module @tradik/xslt3/xpath/syntax/operators
 */

import { makeNode } from "./ast.js";
import { parseInstanceofExpr } from "./typeOperators.js";

/** @typedef {import("./tokenStream.js").TokenStream} TokenStream */
/** @typedef {import("./ast.js").Expr} Expr */

/** Kind of each comparison operator (ComparisonExpr.kind). */
const COMPARISON_KINDS = {
  ...Object.fromEntries(
    "= != < <= > >=".split(" ").map((op) => [op, "general"]),
  ),
  ...Object.fromEntries(
    "eq ne lt le gt ge".split(" ").map((op) => [op, "value"]),
  ),
  ...Object.fromEntries("is << >>".split(" ").map((op) => [op, "node"])),
};

/** Operators stored under another name. */
const ALIASES = { "|": "union" };

/**
 * Builds the parser of one binary precedence level. Each operator may be
 * a symbol or a keyword; both are tried, as names and symbols never clash.
 *
 * @param {string} type - Node type
 * @param {string} operators - Space-separated operators of the level
 * @param {(p: TokenStream) => Expr} operand - Parser of the next level
 * @param {object} [options] - Level options
 * @param {boolean} [options.chain] - Left-associative; false allows at most
 *   one operator (comparisons and `to` are non-associative)
 * @param {boolean} [options.withOperator] - Store the operator in the node
 * @returns {(p: TokenStream) => Expr} Parser of the level
 */
export function binaryLevel(type, operators, operand, options = {}) {
  const { chain = true, withOperator = true } = options;
  const spellings = operators.split(" ");
  const match = (p) =>
    spellings.find((op) => p.acceptSymbol(op) || p.acceptKeyword(op));
  return (p) => {
    let left = operand(p);
    let spelling;
    while ((spelling = match(p))) {
      const right = operand(p);
      const operator = ALIASES[spelling] ?? spelling;
      const kind = COMPARISON_KINDS[operator];
      const fields = withOperator ? { operator, left, right } : { left, right };
      const node = kind ? { kind, ...fields } : fields;
      left = makeNode(type, node, left.start, right.end);
      if (!chain) break;
    }
    return left;
  };
}

const parseIntersectExceptExpr = binaryLevel(
  "SetExpr",
  "intersect except",
  parseInstanceofExpr,
);
const parseUnionExpr = binaryLevel(
  "SetExpr",
  "union |",
  parseIntersectExceptExpr,
);
const parseMultiplicativeExpr = binaryLevel(
  "ArithmeticExpr",
  "* div idiv mod",
  parseUnionExpr,
);
const parseAdditiveExpr = binaryLevel(
  "ArithmeticExpr",
  "+ -",
  parseMultiplicativeExpr,
);
const parseRangeExpr = binaryLevel("RangeExpr", "to", parseAdditiveExpr, {
  chain: false,
  withOperator: false,
});
const parseStringConcatExpr = binaryLevel(
  "StringConcatExpr",
  "||",
  parseRangeExpr,
  { withOperator: false },
);
const parseComparisonExpr = binaryLevel(
  "ComparisonExpr",
  Object.keys(COMPARISON_KINDS).join(" "),
  parseStringConcatExpr,
  { chain: false },
);
const parseAndExpr = binaryLevel("LogicalExpr", "and", parseComparisonExpr);

/**
 * OrExpr ::= AndExpr ("or" AndExpr)*, the operator expression of lowest
 * precedence and the entry point of this module.
 *
 * @type {(p: TokenStream) => Expr}
 */
export const parseOrExpr = binaryLevel("LogicalExpr", "or", parseAndExpr);
