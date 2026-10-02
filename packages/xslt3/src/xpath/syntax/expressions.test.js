import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertError, num, parse, qn, step, varRef } from "./helpers.test.js";
import { parseXPath } from "./index.js";

const binding = (local, expr) => ({ type: "Binding", name: qn(local), expr });

describe("Expr (comma)", () => {
  it("builds a SequenceExpr of two or more items", () => {
    assert.deepEqual(parse("1, 2, 3"), {
      type: "SequenceExpr",
      items: [num("1"), num("2"), num("3")],
    });
  });

  it("returns a single item unwrapped", () => {
    assert.deepEqual(parse("(1)"), num("1"));
  });

  it("spans all items", () => {
    const { start, end } = parseXPath(" 1 , 22 ");
    assert.deepEqual([start, end], [1, 7]);
  });
});

describe("ForExpr", () => {
  it("parses for $x in 1 to 3 return $x", () => {
    assert.deepEqual(parse("for $x in 1 to 3 return $x"), {
      type: "ForExpr",
      bindings: [
        binding("x", { type: "RangeExpr", left: num("1"), right: num("3") }),
      ],
      returnExpr: varRef("x"),
    });
  });

  it("keeps several bindings in one node", () => {
    const ast = parse("for $a in 1, $b in $a return ($a, $b)");
    assert.deepEqual(ast.bindings, [
      binding("a", num("1")),
      binding("b", varRef("a")),
    ]);
    assert.equal(ast.returnExpr.type, "SequenceExpr");
  });

  it("allows EQName variables and whitespace after $", () => {
    assert.deepEqual(
      parse("for $ Q{u}x in 1 return 2").bindings[0].name,
      qn("x", null, "u"),
    );
  });

  it("records the offsets of the expression and its bindings", () => {
    const ast = parseXPath("for $x in 1 return 2");
    assert.deepEqual(
      [ast.start, ast.end, ast.bindings[0].start, ast.bindings[0].end],
      [0, 20, 4, 11],
    );
  });

  it("treats `for` without $ as a name", () => {
    assert.deepEqual(parse("for"), step("for"));
    assert.deepEqual(parse("for/return"), {
      type: "PathExpr",
      absolute: false,
      steps: [step("for"), step("return")],
    });
  });

  it("rejects incomplete for expressions", () => {
    assertError("for $x in 1", /Expected "return"/);
    assertError("for $x 1 return 2", /Expected "in"/);
    assertError("for $1 in 1 return 2", /Expected a variable name/);
    assertError("for $x in 1, return 2", /Expected "\$"/);
  });
});

describe("LetExpr", () => {
  it("parses let bindings with :=", () => {
    assert.deepEqual(parse("let $a := 1, $b := 2 return $a"), {
      type: "LetExpr",
      bindings: [binding("a", num("1")), binding("b", num("2"))],
      returnExpr: varRef("a"),
    });
  });

  it("rejects `in` instead of :=", () => {
    assertError("let $a in 1 return $a", /Expected ":="/);
  });
});

describe("QuantifiedExpr", () => {
  it("parses some and every", () => {
    assert.deepEqual(parse("some $x in (1, 2) satisfies $x"), {
      type: "QuantifiedExpr",
      quantifier: "some",
      bindings: [
        binding("x", { type: "SequenceExpr", items: [num("1"), num("2")] }),
      ],
      satisfies: varRef("x"),
    });
    const every = parse("every $x in 1, $y in 2 satisfies $x = $y");
    assert.equal(every.quantifier, "every");
    assert.equal(every.bindings.length, 2);
    assert.equal(every.satisfies.type, "ComparisonExpr");
  });

  it("requires satisfies", () => {
    assertError("some $x in 1 return 2", /Expected "satisfies"/);
  });
});

describe("IfExpr", () => {
  it("parses if-then-else", () => {
    assert.deepEqual(parse("if ($a, 1) then 2 else if (3) then 4 else 5"), {
      type: "IfExpr",
      condition: { type: "SequenceExpr", items: [varRef("a"), num("1")] },
      thenExpr: num("2"),
      elseExpr: {
        type: "IfExpr",
        condition: num("3"),
        thenExpr: num("4"),
        elseExpr: num("5"),
      },
    });
  });

  it("requires then and else", () => {
    assertError("if (1) 2 else 3", /Expected "then"/);
    assertError("if (1) then 2", /Expected "else"/);
    assertError("if (1 then 2 else 3", /Expected "\)"/);
  });

  it("treats `if` without ( as a name", () => {
    assert.deepEqual(parse("if"), step("if"));
  });

  it("does not allow ExprSingle forms as operands", () => {
    assertError("1 + if (1) then 2 else 3", /Reserved name/);
    assertError("1 + for $x in 1 return 2", /Unexpected token/);
  });
});
