import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertError, num, parse, step, varRef } from "./helpers.test.js";

const bin = (type, operator, left, right) =>
  operator === null ? { type, left, right } : { type, operator, left, right };

describe("logical operators", () => {
  it("binds and tighter than or, left-associative", () => {
    assert.deepEqual(
      parse("1 or 2 and 3 or 4"),
      bin(
        "LogicalExpr",
        "or",
        bin(
          "LogicalExpr",
          "or",
          num("1"),
          bin("LogicalExpr", "and", num("2"), num("3")),
        ),
        num("4"),
      ),
    );
  });
});

describe("ComparisonExpr", () => {
  const cases = {
    "=": "general",
    "!=": "general",
    "<": "general",
    "<=": "general",
    ">": "general",
    ">=": "general",
    eq: "value",
    ne: "value",
    lt: "value",
    le: "value",
    gt: "value",
    ge: "value",
    is: "node",
    "<<": "node",
    ">>": "node",
  };
  for (const [operator, kind] of Object.entries(cases)) {
    it(`parses ${operator} as a ${kind} comparison`, () => {
      assert.deepEqual(parse(`$a ${operator} $b`), {
        type: "ComparisonExpr",
        kind,
        operator,
        left: varRef("a"),
        right: varRef("b"),
      });
    });
  }

  it("is non-associative", () => {
    assertError("1 = 2 = 3", /Unexpected token, found "="/);
    assertError("1 eq 2 lt 3", /found "lt"/);
  });

  it("binds looser than ||", () => {
    const ast = parse("'a' || 'b' = 'ab'");
    assert.equal(ast.type, "ComparisonExpr");
    assert.equal(ast.left.type, "StringConcatExpr");
  });
});

describe("StringConcatExpr and RangeExpr", () => {
  it("chains || to the left and binds looser than to", () => {
    assert.deepEqual(
      parse("1 || 2 to 3 || 4"),
      bin(
        "StringConcatExpr",
        null,
        bin(
          "StringConcatExpr",
          null,
          num("1"),
          bin("RangeExpr", null, num("2"), num("3")),
        ),
        num("4"),
      ),
    );
  });

  it("does not chain `to`", () => {
    assertError("1 to 2 to 3", /found "to"/);
  });
});

describe("arithmetic", () => {
  it("binds * div idiv mod tighter than + -", () => {
    assert.deepEqual(
      parse("1 + 2 * 3 - 4 div 5 idiv 6 mod 7"),
      bin(
        "ArithmeticExpr",
        "-",
        bin(
          "ArithmeticExpr",
          "+",
          num("1"),
          bin("ArithmeticExpr", "*", num("2"), num("3")),
        ),
        bin(
          "ArithmeticExpr",
          "mod",
          bin(
            "ArithmeticExpr",
            "idiv",
            bin("ArithmeticExpr", "div", num("4"), num("5")),
            num("6"),
          ),
          num("7"),
        ),
      ),
    );
  });

  it("reads `div div div` as an element divided by itself", () => {
    assert.deepEqual(
      parse("div div div"),
      bin("ArithmeticExpr", "div", step("div"), step("div")),
    );
  });

  it("tells a - b and a -b (subtraction) from a-b (a name)", () => {
    const minus = bin("ArithmeticExpr", "-", step("a"), step("b"));
    assert.deepEqual(parse("a - b"), minus);
    assert.deepEqual(parse("a -b"), minus);
    assert.deepEqual(parse("a-b"), step("a-b"));
    assert.deepEqual(
      parse("$a - -1"),
      bin("ArithmeticExpr", "-", varRef("a"), {
        type: "UnaryExpr",
        operator: "-",
        operand: num("1"),
      }),
    );
  });

  it("reads $a-$b as the name a- followed by an error (maximal munch)", () => {
    assertError("$a-$b", /Unexpected token, found "\$" at offset 3/);
    assert.equal(parse("$a - $b").operator, "-");
  });

  it("reads `to to to` as a range between two elements", () => {
    assert.deepEqual(
      parse("to to to"),
      bin("RangeExpr", null, step("to"), step("to")),
    );
  });

  it("reads * after an operand as multiplication", () => {
    assert.deepEqual(
      parse("* * *"),
      bin(
        "ArithmeticExpr",
        "*",
        ...[0, 0].map(() => ({
          type: "AxisStep",
          axis: "child",
          nodeTest: { type: "Wildcard", prefix: null, local: null, uri: null },
          predicates: [],
        })),
      ),
    );
  });

  it("does not take a prefixed name as an operator", () => {
    assertError("1 fn:div 2", /found "fn:div"/);
  });
});

describe("set operators", () => {
  it("stores | as union and binds intersect/except tighter", () => {
    assert.deepEqual(
      parse("a | b union c intersect d except e"),
      bin(
        "SetExpr",
        "union",
        bin("SetExpr", "union", step("a"), step("b")),
        bin(
          "SetExpr",
          "except",
          bin("SetExpr", "intersect", step("c"), step("d")),
          step("e"),
        ),
      ),
    );
  });

  it("binds union tighter than multiplication", () => {
    const ast = parse("2 * a | b");
    assert.equal(ast.operator, "*");
    assert.equal(ast.right.operator, "union");
  });
});
