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

describe("instance of, treat as", () => {
  it("parses instance of with an occurrence indicator", () => {
    assert.deepEqual(parse("$x instance of xs:integer+"), {
      type: "InstanceOfExpr",
      expr: varRef("x"),
      sequenceType: seqType(atomic("integer"), "+"),
    });
  });

  it("binds the occurrence indicator to the type (A.1.2)", () => {
    assert.deepEqual(parse("4 treat as item() + - 5"), {
      type: "ArithmeticExpr",
      operator: "-",
      left: {
        type: "TreatExpr",
        expr: num("4"),
        sequenceType: seqType({ type: "AnyItemTest" }, "+"),
      },
      right: num("5"),
    });
    assertError("$x instance of xs:integer+ 1", /found "1"/);
    assert.equal(
      parse("($x instance of xs:integer) + 1").type,
      "ArithmeticExpr",
    );
  });

  it("parses instance of element(*, xs:untyped)?", () => {
    assert.deepEqual(
      parse("$x instance of element(*, xs:untyped)?").sequenceType,
      seqType(
        {
          type: "ElementTest",
          name: null,
          typeName: qn("untyped", "xs"),
          nillable: false,
        },
        "?",
      ),
    );
  });

  it("allows each operator once", () => {
    assertError(
      "1 instance of xs:int instance of xs:boolean",
      /found "instance"/,
    );
    assertError("1 cast as xs:int cast as xs:string", /found "cast"/);
  });

  it("requires the second keyword", () => {
    assertError("1 instance xs:int", /Expected "of"/);
    assertError("1 treat of xs:int", /Expected "as"/);
  });
});

describe("castable as, cast as", () => {
  it("parses SingleType with and without ?", () => {
    assert.deepEqual(parse("'1' cast as xs:integer?"), {
      type: "CastExpr",
      expr: str("1"),
      targetType: qn("integer", "xs"),
      emptyAllowed: true,
    });
    assert.deepEqual(parse("$a castable as Q{u}t"), {
      type: "CastableExpr",
      expr: varRef("a"),
      targetType: qn("t", null, "u"),
      emptyAllowed: false,
    });
  });

  it("nests the levels: instance of > treat > castable > cast", () => {
    const ast = parse("1 cast as xs:int castable as xs:int");
    assert.equal(ast.type, "CastableExpr");
    assert.equal(ast.expr.type, "CastExpr");
  });

  it("records the end of the single type", () => {
    assert.equal(parseXPath("1 cast as xs:int ").end, 16);
    assert.equal(parseXPath("1 cast as xs:int? ").end, 17);
  });

  it("requires a type name", () => {
    assertError("1 cast as 2", /Expected a type name/);
    assertError("1 cast as item()", /found "\("/);
  });
});

describe("ArrowExpr", () => {
  it('parses "a" => upper-case()', () => {
    assert.deepEqual(parse('"a" => upper-case()'), {
      type: "ArrowExpr",
      expr: str("a"),
      functionName: qn("upper-case"),
      functionExpr: null,
      arguments: [],
    });
  });

  it("accepts variables and parenthesized expressions, and chains", () => {
    const ast = parse("$s => $f(1) => (g#1)()");
    assert.equal(ast.functionExpr.type, "NamedFunctionRef");
    assert.deepEqual(ast.expr.functionExpr, varRef("f"));
    assert.deepEqual(ast.expr.arguments, [num("1")]);
  });

  it("binds tighter than cast and looser than unary minus", () => {
    const ast = parse("-1 => abs() cast as xs:int");
    assert.equal(ast.type, "CastExpr");
    assert.equal(ast.expr.expr.type, "UnaryExpr");
  });

  it("allows placeholders", () => {
    assert.deepEqual(parse("1 => f(?)").arguments, [
      { type: "ArgumentPlaceholder" },
    ]);
  });

  it("requires a function and an argument list", () => {
    assertError("1 => 2", /Expected a function after "=>"/);
    assertError("1 => f", /Expected "\("/);
  });
});

describe("UnaryExpr", () => {
  it("nests repeated signs", () => {
    assert.deepEqual(parse("-+-1"), {
      type: "UnaryExpr",
      operator: "-",
      operand: {
        type: "UnaryExpr",
        operator: "+",
        operand: { type: "UnaryExpr", operator: "-", operand: num("1") },
      },
    });
  });

  it("binds looser than ! and paths", () => {
    const ast = parse("-a/b");
    assert.equal(ast.operand.type, "PathExpr");
  });
});

describe("SimpleMapExpr", () => {
  it("parses 1!2 and chains to the left", () => {
    assert.deepEqual(parse("1!2"), {
      type: "SimpleMapExpr",
      left: num("1"),
      right: num("2"),
    });
    const ast = parse("a ! b ! c");
    assert.deepEqual(ast.left, {
      type: "SimpleMapExpr",
      left: step("a"),
      right: step("b"),
    });
  });

  it("is not confused with !=", () => {
    assert.equal(parse("a!=b").type, "ComparisonExpr");
  });
});
