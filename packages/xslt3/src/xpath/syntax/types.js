/**
 * Parser of XPath 3.1 types: SingleType, SequenceType and ItemType with the
 * function, map and array tests (productions [77] SingleType to [116]
 * ParenthesizedItemType of Appendix A.1). Kind tests are in kindTests.js.
 *
 * Occurrence-indicators constraint (A.1.2): a `?`, `*` or `+` right after
 * an item type always belongs to it, so `4 treat as item() + - 5` is
 * `(4 treat as item()+) - 5`.
 *
 * @module @tradik/xslt3/xpath/syntax/types
 */

import { makeNode } from "./ast.js";
import { isKindTestName, parseKindTest } from "./kindTests.js";
import { isPlainName, qName } from "./tokenStream.js";

/** @typedef {import("./tokenStream.js").TokenStream} TokenStream */
/** @typedef {import("./typeAst.js").SequenceType} SequenceType */
/** @typedef {import("./typeAst.js").ItemType} ItemType */

const OCCURRENCES = ["?", "*", "+"];

/**
 * SingleType ::= SimpleTypeName "?"?
 *
 * @param {TokenStream} p - Tokens
 * @returns {{name: import("./ast.js").QName, emptyAllowed: boolean, end: number}}
 *   The type name, whether "?" follows, and the offset after the type
 */
export function parseSingleType(p) {
  const token = p.expectName("a type name");
  const question = p.acceptSymbol("?");
  const end = question ? question.end : token.end;
  return { name: qName(token), emptyAllowed: Boolean(question), end };
}

/**
 * SequenceType ::= ("empty-sequence" "(" ")") | (ItemType OccurrenceIndicator?)
 *
 * @param {TokenStream} p - Tokens
 * @returns {SequenceType} The type
 */
export function parseSequenceType(p) {
  const start = p.peek().start;
  if (p.isKeyword("empty-sequence") && p.isSymbol("(", 1)) {
    p.next();
    p.next();
    const end = p.expectSymbol(")").end;
    return makeNode(
      "SequenceType",
      { itemType: null, occurrence: "" },
      start,
      end,
    );
  }
  const itemType = parseItemType(p);
  const indicator = OCCURRENCES.find((symbol) => p.isSymbol(symbol));
  const end = indicator ? p.next().end : itemType.end;
  return makeNode(
    "SequenceType",
    { itemType, occurrence: indicator ?? "" },
    start,
    end,
  );
}

/**
 * ItemType ::= KindTest | ("item" "(" ")") | FunctionTest | MapTest |
 * ArrayTest | AtomicOrUnionType | ParenthesizedItemType
 *
 * @param {TokenStream} p - Tokens
 * @returns {ItemType} The type
 */
export function parseItemType(p) {
  const token = p.peek();
  if (p.acceptSymbol("(")) {
    const inner = parseItemType(p);
    p.expectSymbol(")");
    return inner;
  }
  if (token.type !== "name") p.fail("Expected an item type");
  if (p.isSymbol("(", 1)) {
    if (isKindTestName(token)) return parseKindTest(p);
    const parse =
      isPlainName(token) && Object.hasOwn(TYPE_TESTS, token.local)
        ? TYPE_TESTS[token.local]
        : null;
    if (parse) {
      p.next();
      p.next();
      const { type, ...fields } = parse(p);
      let end = p.expectSymbol(")").end;
      if (type === "TypedFunctionTest") {
        p.expectKeyword("as");
        fields.returnType = parseSequenceType(p);
        end = fields.returnType.end;
      }
      return makeNode(type, fields, token.start, end);
    }
  }
  p.next();
  return makeNode("AtomicType", { name: qName(token) }, token.start, token.end);
}

/** Parsers of the item tests with a keyword, after the "(". */
const TYPE_TESTS = {
  item: () => ({ type: "AnyItemTest" }),
  function: parseFunctionTestBody,
  map: parseMapTestBody,
  array: parseArrayTestBody,
};

/**
 * Inside `function(...)`: "*" or the parameter types; the caller reads the
 * `as` return type of a typed test after the ")".
 *
 * @param {TokenStream} p - Tokens
 * @returns {object} Fields of the test
 */
function parseFunctionTestBody(p) {
  if (p.acceptSymbol("*")) return { type: "AnyFunctionTest" };
  const paramTypes = [];
  if (!p.isSymbol(")")) {
    do paramTypes.push(parseSequenceType(p));
    while (p.acceptSymbol(","));
  }
  return { type: "TypedFunctionTest", paramTypes };
}

/**
 * Inside `map(...)`: "*" or AtomicOrUnionType "," SequenceType.
 *
 * @param {TokenStream} p - Tokens
 * @returns {object} Fields of the test
 */
function parseMapTestBody(p) {
  if (p.acceptSymbol("*")) return { type: "AnyMapTest" };
  const token = p.expectName("an atomic type");
  const keyType = makeNode(
    "AtomicType",
    { name: qName(token) },
    token.start,
    token.end,
  );
  p.expectSymbol(",");
  return { type: "TypedMapTest", keyType, valueType: parseSequenceType(p) };
}

/**
 * Inside `array(...)`: "*" or SequenceType.
 *
 * @param {TokenStream} p - Tokens
 * @returns {object} Fields of the test
 */
function parseArrayTestBody(p) {
  if (p.acceptSymbol("*")) return { type: "AnyArrayTest" };
  return { type: "TypedArrayTest", memberType: parseSequenceType(p) };
}
