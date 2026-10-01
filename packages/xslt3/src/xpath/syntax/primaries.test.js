import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertError, num, parse, qn, str, varRef } from "./helpers.test.js";
import { parseXPath } from "./index.js";
import { RESERVED_FUNCTION_NAMES } from "./primaries.js";

describe("literals", () => {
  it("keeps numeric literals as lexical forms with their kind", () => {
    assert.deepEqual(parse("0012"), num("0012"));
    assert.deepEqual(
      parse("1.10000000000000000001"),
      num("1.10000000000000000001", "decimal"),
    );
    assert.deepEqual(parse("1E3"), num("1E3", "double"));
  });

  it("unescapes string literals", () => {
    assert.deepEqual(parse(`'it''s'`), str("it's"));
  });
});

describe("VarRef and ContextItemExpr", () => {
  it("parses variables with QNames", () => {
    assert.deepEqual(parse("$p:v"), { type: "VarRef", name: qn("v", "p") });
    const ast = parseXPath("$ v");
    assert.deepEqual([ast.start, ast.end], [0, 3]);
  });

  it("parses .", () => {
    assert.deepEqual(parse("."), { type: "ContextItemExpr" });
  });

  it("requires a variable name", () => {
    assertError("$", /Expected a variable name/);
    assertError("$*", /Expected a variable name, found "\*"/);
  });
});

describe("ParenthesizedExpr", () => {
  it("gives an EmptySequence for ()", () => {
    assert.deepEqual(parse("( )"), { type: "EmptySequence" });
    const ast = parseXPath("( )");
    assert.deepEqual([ast.start, ast.end], [0, 3]);
  });

  it("requires the closing parenthesis", () => {
    assertError("(1, 2", /Expected "\)", found end of expression/);
  });
});

describe("FunctionCall", () => {
  it("parses calls with arguments", () => {
    assert.deepEqual(parse("fn:concat('a', $b)"), {
      type: "FunctionCall",
      name: qn("concat", "fn"),
      arguments: [str("a"), varRef("b")],
    });
    assert.deepEqual(parse("Q{u}f()").name, qn("f", null, "u"));
  });

  it("allows keywords as function names", () => {
    assert.equal(parse("div(1)").type, "FunctionCall");
    assert.equal(parse("for(1)").type, "FunctionCall");
  });

  it("parses argument placeholders (partial application)", () => {
    assert.deepEqual(parse("f(?, 1, ?)").arguments, [
      { type: "ArgumentPlaceholder" },
      num("1"),
      { type: "ArgumentPlaceholder" },
    ]);
  });

  it("reads ?key in an argument as a unary lookup", () => {
    assert.equal(parse("f(?a)").arguments[0].type, "UnaryLookup");
  });

  it("rejects reserved function names (A.3)", () => {
    assert.equal(RESERVED_FUNCTION_NAMES.size, 18);
    // Kind-test names make kind tests, `function(` an inline function and
    // `if (` an IfExpr at the start of an ExprSingle; the others fail.
    for (const name of [
      "array",
      "empty-sequence",
      "if",
      "item",
      "map",
      "switch",
      "typeswitch",
    ]) {
      assertError(`a/${name}(1)`, /Reserved name used as a function name/);
    }
    assertError("item#0", /Reserved name/);
    assertError("element#1", /Reserved name/);
    assert.equal(parse("fn:map(1)").type, "FunctionCall");
  });

  it("rejects malformed argument lists", () => {
    assertError("f(1,)", /Expected an expression/);
    assertError("f(1 2)", /Expected "\)"/);
  });
});

describe("NamedFunctionRef", () => {
  it("parses name#arity", () => {
    assert.deepEqual(parse("fn:abs#1"), {
      type: "NamedFunctionRef",
      name: qn("abs", "fn"),
      arity: 1,
    });
    assert.deepEqual(parse("f # 0").arity, 0);
  });

  it("requires an integer arity", () => {
    assertError("f#a", /Expected the arity/);
    assertError("f#1.0", /Expected the arity/);
  });
});

describe("UnaryLookup", () => {
  it("parses every key specifier", () => {
    assert.deepEqual(parse("?name"), {
      type: "UnaryLookup",
      keyKind: "name",
      key: "name",
    });
    assert.deepEqual(parse("?2"), {
      type: "UnaryLookup",
      keyKind: "integer",
      key: "2",
    });
    assert.deepEqual(parse("?*"), {
      type: "UnaryLookup",
      keyKind: "wildcard",
      key: null,
    });
    assert.deepEqual(parse("?('a', 'b')").key, {
      type: "SequenceExpr",
      items: [str("a"), str("b")],
    });
  });

  it("rejects other keys", () => {
    assertError("?p:a", /Expected a key/);
    assertError("?'a'", /Expected a key/);
  });

  it("records the offsets", () => {
    const ast = parseXPath("?(1) ");
    assert.deepEqual([ast.start, ast.end], [0, 4]);
  });
});

describe("primary errors", () => {
  it("reports unexpected tokens", () => {
    assertError(
      "",
      /Expected an expression, found end of expression at offset 0/,
    );
    assertError(")", /Expected an expression, found "\)"/);
    assertError("1 + ]", /Expected an expression, found "]" at offset 4/);
  });
});
