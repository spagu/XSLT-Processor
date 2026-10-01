import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertError, num, parse, str, varRef } from "./helpers.test.js";
import { parseXPath } from "./index.js";

describe("PostfixExpr", () => {
  it("parses filters on primary expressions", () => {
    assert.deepEqual(parse("(1, 2)[. = 1]"), {
      type: "FilterExpr",
      base: { type: "SequenceExpr", items: [num("1"), num("2")] },
      predicate: {
        type: "ComparisonExpr",
        kind: "general",
        operator: "=",
        left: { type: "ContextItemExpr" },
        right: num("1"),
      },
    });
  });

  it("parses $f(?, 2) as a dynamic partial application", () => {
    assert.deepEqual(parse("$f(?, 2)"), {
      type: "DynamicFunctionCall",
      functionExpr: varRef("f"),
      arguments: [{ type: "ArgumentPlaceholder" }, num("2")],
    });
  });

  it('parses map{"a":1}?a', () => {
    assert.deepEqual(parse('map{"a":1}?a'), {
      type: "Lookup",
      base: {
        type: "MapConstructor",
        entries: [{ type: "MapEntry", key: str("a"), value: num("1") }],
      },
      keyKind: "name",
      key: "a",
    });
  });

  it("parses every lookup key", () => {
    assert.deepEqual(parse("$a?1"), {
      type: "Lookup",
      base: varRef("a"),
      keyKind: "integer",
      key: "1",
    });
    assert.deepEqual(parse("$a?*"), {
      type: "Lookup",
      base: varRef("a"),
      keyKind: "wildcard",
      key: null,
    });
    assert.deepEqual(parse("$a?($k)"), {
      type: "Lookup",
      base: varRef("a"),
      keyKind: "expr",
      key: varRef("k"),
    });
    assert.deepEqual(parse("$a?()").key, { type: "EmptySequence" });
  });

  it("chains postfixes left to right", () => {
    const ast = parse("$f(1)[2]?x(3)");
    assert.equal(ast.type, "DynamicFunctionCall");
    assert.equal(ast.functionExpr.type, "Lookup");
    assert.equal(ast.functionExpr.base.type, "FilterExpr");
    assert.equal(ast.functionExpr.base.base.type, "DynamicFunctionCall");
  });

  it("records the offsets", () => {
    const ast = parseXPath("$m?(1)[2] ");
    assert.deepEqual([ast.start, ast.end, ast.base.end], [0, 9, 6]);
  });

  it("rejects bad keys and unterminated postfixes", () => {
    assertError("$a?-1", /Expected a key/);
    assertError("$a?", /Expected a key.*, found end of expression/);
    assertError("$f(1", /Expected "\)"/);
  });
});
