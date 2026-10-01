import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertError, dos, num, parse, step, varRef } from "./helpers.test.js";
import { parseXPath } from "./index.js";

const path = (absolute, ...steps) => ({ type: "PathExpr", absolute, steps });

describe("PathExpr", () => {
  it("parses a lone slash", () => {
    assert.deepEqual(parse("/"), path(true));
    assert.deepEqual(parse("(/)"), path(true));
  });

  it("parses absolute and relative paths", () => {
    assert.deepEqual(parse("/a/b"), path(true, step("a"), step("b")));
    assert.deepEqual(parse("a/b"), path(false, step("a"), step("b")));
  });

  it("expands // to descendant-or-self::node()", () => {
    assert.deepEqual(parse("//a"), path(true, dos(), step("a")));
    assert.deepEqual(parse("a//b"), path(false, step("a"), dos(), step("b")));
  });

  it("returns a single step without a PathExpr", () => {
    assert.deepEqual(parse("a"), step("a"));
  });

  it("takes / followed by a step start as a path (leading-lone-slash)", () => {
    assertError("/ * 5", /found "5"/);
    assertError("/ div 3", /found "3"/);
    const multiply = parse("(/) * 5");
    assert.deepEqual(multiply, {
      type: "ArithmeticExpr",
      operator: "*",
      left: path(true),
      right: num("5"),
    });
    for (const start of [
      "@a",
      ".",
      "..",
      "$v",
      "(1)",
      "?a",
      "[1]",
      "'s'",
      "1",
      "p:*",
      "*",
    ]) {
      assert.equal(parse(`/${start}`).steps.length, 1, start);
    }
  });

  it("keeps / alone before an operator that cannot start a step", () => {
    assert.deepEqual(parse("/ = 1").left, path(true));
    assert.deepEqual(parse("/ < a").left, path(true));
    assert.deepEqual(parse("/ | a").left, path(true));
  });

  it("requires a step after //", () => {
    assertError("//", /Expected an expression/);
    assertError("a/", /Expected an expression/);
  });

  it("accepts any step expression in a path", () => {
    assert.deepEqual(parse("$d/a"), path(false, varRef("d"), step("a")));
    assert.equal(parse("a/(b, c)/f()").steps[2].type, "FunctionCall");
  });

  it("records the offsets of the path and of the // step", () => {
    const ast = parseXPath(" a//b ");
    assert.deepEqual([ast.start, ast.end], [1, 5]);
    assert.deepEqual([ast.steps[1].start, ast.steps[1].end], [2, 4]);
    const root = parseXPath("/");
    assert.deepEqual([root.start, root.end], [0, 1]);
  });

  it("binds tighter than !", () => {
    assert.equal(parse("a/b ! c").type, "SimpleMapExpr");
  });
});
