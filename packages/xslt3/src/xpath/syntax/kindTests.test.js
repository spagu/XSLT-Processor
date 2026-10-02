import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertError, parse, qn } from "./helpers.test.js";

/** The item type of `. instance of T`. */
const test = (text) => parse(`. instance of ${text}`).sequenceType.itemType;
const element = (name, typeName = null, nillable = false) => ({
  type: "ElementTest",
  name,
  typeName,
  nillable,
});

describe("KindTest", () => {
  it("parses the tests without arguments", () => {
    assert.deepEqual(test("node()"), { type: "AnyKindTest" });
    assert.deepEqual(test("text()"), { type: "TextTest" });
    assert.deepEqual(test("comment()"), { type: "CommentTest" });
    assert.deepEqual(test("namespace-node()"), { type: "NamespaceNodeTest" });
    assertError(". instance of text(a)", /Expected "\)"/);
  });

  it("parses element tests", () => {
    assert.deepEqual(test("element()"), element(null));
    assert.deepEqual(test("element(*)"), element(null));
    assert.deepEqual(test("element(a)"), element(qn("a")));
    assert.deepEqual(
      test("element(*, xs:untyped)"),
      element(null, qn("untyped", "xs")),
    );
    assert.deepEqual(
      test("element(p:a, t?)"),
      element(qn("a", "p"), qn("t"), true),
    );
    assertError(". instance of element(1)", /Expected a name or "\*"/);
    assertError(". instance of element(a,)", /Expected a type name/);
  });

  it("parses element(*, xs:untyped)? with its occurrence", () => {
    const { sequenceType } = parse(". instance of element(*, xs:untyped)?");
    assert.equal(sequenceType.occurrence, "?");
    assert.equal(sequenceType.itemType.nillable, false);
  });

  it("parses attribute tests, which have no nillable marker", () => {
    assert.deepEqual(test("attribute()"), {
      type: "AttributeTest",
      name: null,
      typeName: null,
    });
    assert.deepEqual(test("attribute(*, xs:ID)"), {
      type: "AttributeTest",
      name: null,
      typeName: qn("ID", "xs"),
    });
    assert.deepEqual(test("attribute(a)"), {
      type: "AttributeTest",
      name: qn("a"),
      typeName: null,
    });
    assertError(". instance of attribute(a, t?)", /Expected "\)"/);
  });

  it("parses schema-element and schema-attribute tests", () => {
    assert.deepEqual(test("schema-element(a)"), {
      type: "SchemaElementTest",
      name: qn("a"),
    });
    assert.deepEqual(test("schema-attribute(p:a)"), {
      type: "SchemaAttributeTest",
      name: qn("a", "p"),
    });
    assertError(". instance of schema-element()", /Expected a name/);
  });

  it("parses document-node tests", () => {
    assert.deepEqual(test("document-node()"), {
      type: "DocumentTest",
      elementTest: null,
    });
    assert.deepEqual(test("document-node(element(a))"), {
      type: "DocumentTest",
      elementTest: element(qn("a")),
    });
    assert.deepEqual(
      test("document-node(schema-element(a))").elementTest.type,
      "SchemaElementTest",
    );
    assertError(
      ". instance of document-node(text())",
      /Expected element\(\.\.\.\) or schema-element/,
    );
  });

  it("parses processing-instruction tests", () => {
    assert.deepEqual(test("processing-instruction()"), {
      type: "PITest",
      target: null,
    });
    assert.deepEqual(test("processing-instruction(xml-stylesheet)"), {
      type: "PITest",
      target: "xml-stylesheet",
    });
    assert.deepEqual(test("processing-instruction(' a ')"), {
      type: "PITest",
      target: "a",
    });
    assertError(
      ". instance of processing-instruction('a b')",
      "XPTY0004",
      /not an NCName/,
    );
    assertError(
      ". instance of processing-instruction(p:a)",
      /Expected an NCName or a string literal/,
    );
  });

  it("does not take prefixed names as kind tests", () => {
    assert.deepEqual(parse("x:node()").type, "FunctionCall");
  });
});
