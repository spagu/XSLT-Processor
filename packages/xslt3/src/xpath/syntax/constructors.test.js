import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertError,
  atomic,
  num,
  parse,
  qn,
  seqType,
  step,
  str,
  varRef,
} from "./helpers.test.js";
import { parseXPath } from "./index.js";

describe("InlineFunctionExpr", () => {
  it("parses typed parameters and a return type", () => {
    assert.deepEqual(parse("function($a as xs:int, $b) as item()* { $a }"), {
      type: "InlineFunctionExpr",
      params: [
        { type: "Param", name: qn("a"), sequenceType: seqType(atomic("int")) },
        { type: "Param", name: qn("b"), sequenceType: null },
      ],
      returnType: seqType({ type: "AnyItemTest" }, "*"),
      body: varRef("a"),
    });
  });

  it("gives an empty body an EmptySequence", () => {
    const ast = parse("function() {}");
    assert.deepEqual(ast, {
      type: "InlineFunctionExpr",
      params: [],
      returnType: null,
      body: { type: "EmptySequence" },
    });
    const full = parseXPath("function() { }");
    assert.deepEqual([full.start, full.end, full.body.start], [0, 14, 11]);
  });

  it("records parameter offsets", () => {
    const [plain, typed] = parseXPath("function($a, $b as xs:int) {1}").params;
    assert.deepEqual(
      [plain.start, plain.end, typed.start, typed.end],
      [9, 11, 13, 25],
    );
  });

  it("rejects malformed functions", () => {
    assertError("function(a) {1}", /Expected "\$"/);
    assertError("function($a) 1", /Expected "\{"/);
    assertError("function($a) {1", /Expected "\}"/);
    assertError("function($a,) {1}", /Expected "\$"/);
  });
});

describe("MapConstructor", () => {
  it("parses entries", () => {
    assert.deepEqual(parse("map { 'a' : 1, $k : (2, 3) }"), {
      type: "MapConstructor",
      entries: [
        { type: "MapEntry", key: str("a"), value: num("1") },
        {
          type: "MapEntry",
          key: varRef("k"),
          value: { type: "SequenceExpr", items: [num("2"), num("3")] },
        },
      ],
    });
    assert.deepEqual(parse("map{}"), { type: "MapConstructor", entries: [] });
  });

  it("reads map{a:b} as a QName key, so a space is needed (A.2)", () => {
    assertError("map{a:b}", /Expected ":"/);
    assert.deepEqual(parse("map{a :b}").entries[0], {
      type: "MapEntry",
      key: step("a"),
      value: step("b"),
    });
    assert.deepEqual(parse("map{a:1}").entries[0].key, step("a"));
  });

  it("allows nested maps", () => {
    assert.equal(
      parse("map{1: map{2: 3}}").entries[0].value.type,
      "MapConstructor",
    );
  });

  it("rejects malformed maps", () => {
    assertError("map{1}", /Expected ":"/);
    assertError("map{1:2", /Expected "\}"/);
  });
});

describe("ArrayConstructor", () => {
  it("parses square arrays, one member per ExprSingle", () => {
    assert.deepEqual(parse("[1, (2, 3), []]"), {
      type: "SquareArrayConstructor",
      members: [
        num("1"),
        { type: "SequenceExpr", items: [num("2"), num("3")] },
        { type: "SquareArrayConstructor", members: [] },
      ],
    });
  });

  it("parses curly arrays over one expression", () => {
    assert.deepEqual(parse("array { 1, 2 }"), {
      type: "CurlyArrayConstructor",
      expr: { type: "SequenceExpr", items: [num("1"), num("2")] },
    });
    assert.deepEqual(parse("array{}"), {
      type: "CurlyArrayConstructor",
      expr: { type: "EmptySequence" },
    });
  });

  it("rejects unterminated arrays", () => {
    assertError("[1, 2", /Expected "\]"/);
    assertError("array{1", /Expected "\}"/);
  });
});
