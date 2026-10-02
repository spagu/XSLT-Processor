/**
 * Parser of XPath 3.1 steps: productions [38] StepExpr to [52]
 * PredicateList of Appendix A.1 (axes, abbreviations, node tests,
 * predicates).
 *
 * @module @tradik/xslt3/xpath/syntax/steps
 */

import { makeNode } from "./ast.js";
import { parseExpr } from "./expressions.js";
import { isKindTestName, parseKindTest } from "./kindTests.js";
import { parsePostfixExpr } from "./postfix.js";
import { isPlainName, qName } from "./tokenStream.js";

/** @typedef {import("./tokenStream.js").TokenStream} TokenStream */
/** @typedef {import("./ast.js").Expr} Expr */

/** The 13 axes of XPath 3.1, namespace included. */
const AXES = new Set(
  (
    "child descendant attribute self descendant-or-self following-sibling " +
    "following namespace parent ancestor preceding-sibling preceding " +
    "ancestor-or-self"
  ).split(" "),
);

/**
 * StepExpr ::= PostfixExpr | AxisStep
 *
 * @param {TokenStream} p - Tokens
 * @returns {Expr} The step
 */
export function parseStepExpr(p) {
  const token = p.peek();
  if (p.isSymbol("..")) {
    p.next();
    const nodeTest = makeNode("AnyKindTest", {}, token.start, token.end);
    return finishStep(p, "parent", nodeTest, token.start);
  }
  if (p.isSymbol("@")) {
    p.next();
    return finishStep(p, "attribute", parseNodeTest(p), token.start);
  }
  if (token.type === "name" && p.isSymbol("::", 1)) {
    if (!isPlainName(token) || !AXES.has(token.local)) p.fail("Unknown axis");
    p.next();
    p.next();
    return finishStep(p, token.local, parseNodeTest(p), token.start);
  }
  if (startsNodeTest(p)) {
    const nodeTest = parseNodeTest(p);
    return finishStep(p, defaultAxis(nodeTest), nodeTest, token.start);
  }
  return parsePostfixExpr(p);
}

/**
 * Whether an abbreviated step (no axis) starts here, rather than a primary
 * expression such as a function call, `f#1`, `map {}` or `array {}`.
 *
 * @param {TokenStream} p - Tokens
 * @returns {boolean} True for a name test, wildcard or kind test
 */
function startsNodeTest(p) {
  const token = p.peek();
  if (token.type === "wildcard" || p.isSymbol("*")) return true;
  if (token.type !== "name") return false;
  if (p.isSymbol("(", 1)) return isKindTestName(token);
  if (p.isSymbol("#", 1)) return false;
  const constructor = p.isKeyword("map") || p.isKeyword("array");
  return !(constructor && p.isSymbol("{", 1));
}

/**
 * Default axis of an abbreviated step (XPath 3.1 section 3.3.5).
 *
 * @param {import("./typeAst.js").NodeTest} nodeTest - Test of the step
 * @returns {string} "attribute", "namespace" or "child"
 */
function defaultAxis(nodeTest) {
  switch (nodeTest.type) {
    case "AttributeTest":
    case "SchemaAttributeTest":
      return "attribute";
    case "NamespaceNodeTest":
      return "namespace";
    default:
      return "child";
  }
}

/**
 * NodeTest ::= KindTest | NameTest, NameTest being an EQName or a Wildcard.
 *
 * @param {TokenStream} p - Tokens
 * @returns {import("./typeAst.js").NodeTest} The test
 */
function parseNodeTest(p) {
  const token = p.peek();
  if (token.type === "name" && p.isSymbol("(", 1) && isKindTestName(token)) {
    return parseKindTest(p);
  }
  if (token.type === "wildcard" || p.isSymbol("*")) {
    p.next();
    const fields =
      token.type === "wildcard"
        ? qName(token)
        : { prefix: null, local: null, uri: null };
    return makeNode("Wildcard", fields, token.start, token.end);
  }
  const name = p.expectName("a node test");
  return makeNode("NameTest", { name: qName(name) }, name.start, name.end);
}

/**
 * Reads the predicates of an axis step and builds the step.
 *
 * @param {TokenStream} p - Tokens
 * @param {string} axis - Axis name
 * @param {import("./typeAst.js").NodeTest} nodeTest - Node test
 * @param {number} start - Offset of the step
 * @returns {import("./ast.js").AxisStep} The step
 */
function finishStep(p, axis, nodeTest, start) {
  const predicates = [];
  let end = nodeTest.end;
  while (p.isSymbol("[")) {
    const { predicate, end: predicateEnd } = parsePredicate(p);
    predicates.push(predicate);
    end = predicateEnd;
  }
  return makeNode("AxisStep", { axis, nodeTest, predicates }, start, end);
}

/**
 * Predicate ::= "[" Expr "]"
 *
 * @param {TokenStream} p - Tokens, at "["
 * @returns {{predicate: Expr, end: number}} The expression and the offset
 *   after "]"
 */
export function parsePredicate(p) {
  p.expectSymbol("[");
  const predicate = parseExpr(p);
  return { predicate, end: p.expectSymbol("]").end };
}
