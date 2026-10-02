import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertError, num, parse, qn, step, testStep } from "./helpers.test.js";
import { parseXPath } from "./index.js";

const wildcard = (prefix, local, uri) => ({
  type: "Wildcard",
  prefix,
  local,
  uri,
});

describe("AxisStep", () => {
  const axes = [
    "child",
    "descendant",
    "attribute",
    "self",
    "descendant-or-self",
    "following-sibling",
    "following",
    "namespace",
    "parent",
    "ancestor",
    "preceding-sibling",
    "preceding",
    "ancestor-or-self",
  ];
  for (const axis of axes) {
    it(`parses the ${axis} axis`, () => {
      assert.deepEqual(parse(`${axis}::x`), step("x", axis));
    });
  }

  it("allows whitespace and comments around ::", () => {
    assert.deepEqual(parse("child (: c :) :: x"), step("x"));
  });

  it("rejects unknown and prefixed axes", () => {
    assertError("sibling::x", /Unknown axis/);
    assertError("fn:child::x", /Unknown axis/);
  });

  it("parses the abbreviations @ and ..", () => {
    assert.deepEqual(parse("@id"), step("id", "attribute"));
    assert.deepEqual(parse(".."), testStep("parent", { type: "AnyKindTest" }));
    assert.deepEqual(
      parse("..[1]"),
      testStep("parent", { type: "AnyKindTest" }, [num("1")]),
    );
  });

  it("parses wildcards", () => {
    assert.deepEqual(parse("*").nodeTest, wildcard(null, null, null));
    assert.deepEqual(parse("p:*").nodeTest, wildcard("p", null, null));
    assert.deepEqual(parse("*:l").nodeTest, wildcard(null, "l", null));
    assert.deepEqual(parse("Q{u}*").nodeTest, wildcard(null, null, "u"));
    assert.deepEqual(parse("@*").nodeTest, wildcard(null, null, null));
  });

  it("parses EQName name tests", () => {
    assert.deepEqual(parse("Q{http://x}a"), {
      type: "AxisStep",
      axis: "child",
      nodeTest: { type: "NameTest", name: qn("a", null, "http://x") },
      predicates: [],
    });
  });

  it("chooses the default axis from the kind test", () => {
    assert.equal(parse("attribute()").axis, "attribute");
    assert.equal(parse("schema-attribute(a)").axis, "attribute");
    assert.equal(parse("namespace-node()").axis, "namespace");
    assert.equal(parse("text()").axis, "child");
    assert.equal(parse("child::attribute()").axis, "child");
  });

  it("parses kind tests after an axis", () => {
    assert.deepEqual(
      parse("self::node()"),
      testStep("self", { type: "AnyKindTest" }),
    );
  });

  it("reads keywords as names in step position", () => {
    assert.deepEqual(parse("map"), step("map"));
    assert.deepEqual(parse("array/function"), {
      type: "PathExpr",
      absolute: false,
      steps: [step("array"), step("function")],
    });
  });

  it("collects predicates", () => {
    assert.deepEqual(
      parse("a[1][b]"),
      step("a", "child", [num("1"), step("b")]),
    );
    const ast = parseXPath("a[1] ");
    assert.deepEqual([ast.start, ast.end], [0, 4]);
  });

  it("requires a node test", () => {
    assertError("child::1", /Expected a node test/);
    assertError("@", /Expected a node test, found end of expression/);
    assertError("a[1", /Expected "\]"/);
  });

  it("does not allow lookups or calls on axis steps", () => {
    assertError("a?b", /Unexpected token/);
  });
});
