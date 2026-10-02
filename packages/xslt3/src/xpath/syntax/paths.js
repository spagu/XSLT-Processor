/**
 * Parser of XPath 3.1 path expressions: productions [36] PathExpr to [52]
 * RelativePathExpr of Appendix A.1; the steps are parsed in steps.js.
 *
 * Leading-lone-slash constraint (A.1.2): a `/` followed by a token that can
 * start a step is the start of a path, so `/ * 5` is `/*` followed by an
 * unexpected `5`; `(/) * 5` multiplies the root.
 *
 * @module @tradik/xslt3/xpath/syntax/paths
 */

import { makeNode } from "./ast.js";
import { parseStepExpr } from "./steps.js";

/** @typedef {import("./tokenStream.js").TokenStream} TokenStream */
/** @typedef {import("./ast.js").Expr} Expr */

/** Symbols that can start a step (leading-lone-slash constraint). */
const STEP_START_SYMBOLS = new Set(["*", "@", ".", "..", "$", "(", "?", "["]);
const LITERAL_TOKENS = new Set([
  "name",
  "wildcard",
  "integer",
  "decimal",
  "double",
  "string",
]);

/**
 * PathExpr ::= ("/" RelativePathExpr?) | ("//" RelativePathExpr) |
 * RelativePathExpr
 *
 * @param {TokenStream} p - Tokens
 * @returns {Expr} A PathExpr, or the step itself when there is no slash
 */
export function parsePathExpr(p) {
  const slash = p.acceptSymbol("/");
  if (slash) {
    if (!startsStep(p)) {
      return makeNode(
        "PathExpr",
        { absolute: true, steps: [] },
        slash.start,
        slash.end,
      );
    }
    return continuePath(p, slash.start, true, [parseStepExpr(p)]);
  }
  const doubleSlash = p.acceptSymbol("//");
  if (doubleSlash) {
    const steps = [descendantOrSelfStep(doubleSlash), parseStepExpr(p)];
    return continuePath(p, doubleSlash.start, true, steps);
  }
  const first = parseStepExpr(p);
  if (!p.isSymbol("/") && !p.isSymbol("//")) return first;
  return continuePath(p, first.start, false, [first]);
}

/**
 * Reads the `("/" | "//") StepExpr` pairs that follow the first step.
 *
 * @param {TokenStream} p - Tokens
 * @param {number} start - Offset of the path
 * @param {boolean} absolute - Whether the path starts with a slash
 * @param {Expr[]} steps - Steps read so far
 * @returns {import("./ast.js").PathExpr} The path
 */
function continuePath(p, start, absolute, steps) {
  let separator;
  while ((separator = p.acceptSymbol("/") ?? p.acceptSymbol("//"))) {
    if (separator.value === "//") steps.push(descendantOrSelfStep(separator));
    steps.push(parseStepExpr(p));
  }
  return makeNode("PathExpr", { absolute, steps }, start, steps.at(-1).end);
}

/**
 * @param {TokenStream} p - Tokens
 * @returns {boolean} Whether the current token can start a StepExpr
 */
function startsStep(p) {
  const token = p.peek();
  return token.type === "symbol"
    ? STEP_START_SYMBOLS.has(token.value)
    : LITERAL_TOKENS.has(token.type);
}

/**
 * The step `descendant-or-self::node()` that `//` stands for.
 *
 * @param {import("./lexer.js").Token} token - The `//` token
 * @returns {import("./ast.js").AxisStep} The step
 */
function descendantOrSelfStep(token) {
  const nodeTest = makeNode("AnyKindTest", {}, token.start, token.end);
  return makeNode(
    "AxisStep",
    { axis: "descendant-or-self", nodeTest, predicates: [] },
    token.start,
    token.end,
  );
}
