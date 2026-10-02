/**
 * Parser of the XPath 3.1 kind tests, used both as node tests of axis steps
 * and as item types: productions [83] KindTest to [100] TypeName of
 * Appendix A.1.
 *
 * @module @tradik/xslt3/xpath/syntax/kindTests
 */

import { makeNode } from "./ast.js";
import { isNCName, normalizeSpace } from "./chars.js";
import { isPlainName, qName } from "./tokenStream.js";

/** @typedef {import("./tokenStream.js").TokenStream} TokenStream */

/** Kind tests without arguments, by keyword. */
const EMPTY_TESTS = {
  node: "AnyKindTest",
  text: "TextTest",
  comment: "CommentTest",
  "namespace-node": "NamespaceNodeTest",
};

/** Parsers of the kind tests with arguments, after the "(". */
const TESTS_WITH_ARGUMENTS = {
  "document-node": parseDocumentTestBody,
  element: (p) => parseNamedTestBody(p, "ElementTest"),
  attribute: (p) => parseNamedTestBody(p, "AttributeTest"),
  "schema-element": (p) => ({
    type: "SchemaElementTest",
    name: qName(p.expectName()),
  }),
  "schema-attribute": (p) => ({
    type: "SchemaAttributeTest",
    name: qName(p.expectName()),
  }),
  "processing-instruction": parsePITestBody,
};

/**
 * @param {import("./lexer.js").Token} token - Name token followed by "("
 * @returns {boolean} Whether the name is the keyword of a kind test
 */
export function isKindTestName(token) {
  return (
    isPlainName(token) &&
    (Object.hasOwn(EMPTY_TESTS, token.local) ||
      Object.hasOwn(TESTS_WITH_ARGUMENTS, token.local))
  );
}

/**
 * KindTest, e.g. `element(*, xs:untyped)` or `document-node(element(a))`.
 * The caller has checked {@link isKindTestName}.
 *
 * @param {TokenStream} p - Tokens, at the keyword
 * @returns {import("./typeAst.js").KindTest} The test
 */
export function parseKindTest(p) {
  const keyword = p.next();
  p.expectSymbol("(");
  const emptyType = EMPTY_TESTS[keyword.local];
  const { type, ...fields } = emptyType
    ? { type: emptyType }
    : TESTS_WITH_ARGUMENTS[keyword.local](p);
  const end = p.expectSymbol(")").end;
  return makeNode(type, fields, keyword.start, end);
}

/**
 * Inside `document-node(...)`: an optional element or schema-element test.
 *
 * @param {TokenStream} p - Tokens
 * @returns {{type: string, elementTest: object|null}} Fields of the test
 */
function parseDocumentTestBody(p) {
  let elementTest = null;
  if (p.isKeyword("element") || p.isKeyword("schema-element")) {
    elementTest = parseKindTest(p);
  } else if (!p.isSymbol(")")) {
    p.fail("Expected element(...) or schema-element(...)");
  }
  return { type: "DocumentTest", elementTest };
}

/**
 * Inside `element(...)` or `attribute(...)`: (name | "*") ("," TypeName)?,
 * plus a "?" (nillable) after the type name of an element test.
 *
 * @param {TokenStream} p - Tokens
 * @param {"ElementTest"|"AttributeTest"} type - Test type
 * @returns {object} Fields of the test
 */
function parseNamedTestBody(p, type) {
  let name = null;
  let typeName = null;
  let nillable = false;
  if (!p.isSymbol(")")) {
    if (!p.acceptSymbol("*")) name = qName(p.expectName('a name or "*"'));
    if (p.acceptSymbol(",")) {
      typeName = qName(p.expectName("a type name"));
      if (type === "ElementTest") nillable = Boolean(p.acceptSymbol("?"));
    }
  }
  return type === "ElementTest"
    ? { type, name, typeName, nillable }
    : { type, name, typeName };
}

/**
 * Inside `processing-instruction(...)`: an NCName or a string literal, whose
 * whitespace-normalized value must be an NCName (else XPTY0004).
 *
 * @param {TokenStream} p - Tokens
 * @returns {{type: "PITest", target: string|null}} Fields of the test
 */
function parsePITestBody(p) {
  const token = p.peek();
  if (p.isSymbol(")")) return { type: "PITest", target: null };
  if (token.type === "string") {
    p.next();
    const target = normalizeSpace(token.value);
    if (!isNCName(target)) {
      p.fail(
        "Processing-instruction target is not an NCName",
        token,
        "XPTY0004",
      );
    }
    return { type: "PITest", target };
  }
  if (!isPlainName(token)) p.fail("Expected an NCName or a string literal");
  p.next();
  return { type: "PITest", target: token.local };
}
