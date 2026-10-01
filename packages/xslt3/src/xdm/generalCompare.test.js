import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AtomicValue } from "./atomic.js";
import { generalCompare, toNumber } from "./generalCompare.js";
import { fromLexical } from "./lexical.js";
import { types } from "./types.js";

const L = (type, text) => fromLexical(type, text);
const u = (text) => L("xs:untypedAtomic", text);
const int = (text) => L("xs:integer", text);
const element = (value) => ({
  nodeType: 1,
  nodeValue: null,
  childNodes: [{ nodeType: 3, nodeValue: value, childNodes: [] }],
});
const gc = (a, op, b, options) => generalCompare(a, op, b, options);
const compat = { backwardsCompatible: true };

describe("generalCompare (XPath 3.1 mode)", () => {
  it("is existentially quantified", () => {
    assert.equal(gc([int("1"), int("2")], "=", [int("2"), int("3")]), true);
    assert.equal(gc([int("1"), int("2")], "!=", [int("1")]), true);
    assert.equal(gc([int("1")], "!=", [int("1")]), false);
    assert.equal(gc([], "=", [int("1")]), false);
    assert.equal(gc([int("1")], "<", [int("2")]), true);
    assert.equal(gc([int("2")], "<=", [int("2")]), true);
    assert.equal(gc([int("3")], ">", [int("2")]), true);
    assert.equal(gc([int("1")], ">=", [int("2")]), false);
  });

  it("casts untyped values by the type of the other operand", () => {
    assert.equal(gc([u("1.0")], "=", [int("1")]), true);
    assert.equal(gc([int("1")], "=", [u("1.0")]), true);
    assert.equal(gc([u("1.0")], "=", [u("1")]), false);
    assert.equal(gc([u("a")], "=", [L("xs:string", "a")]), true);
    assert.equal(
      gc([u("PT1H")], "=", [L("xs:dayTimeDuration", "PT60M")]),
      true,
    );
    assert.equal(
      gc([u("P1Y")], "<", [L("xs:yearMonthDuration", "P13M")]),
      true,
    );
    assert.equal(
      gc([u("2000-01-01")], "<", [L("xs:date", "2000-01-02")]),
      true,
    );
    assert.equal(gc([element("5")], ">", [L("xs:double", "4.5")]), true);
    assert.equal(gc([u("1")], "=", [L("xs:boolean", "true")]), true);
  });

  it("raises FORG0001 when an untyped value cannot be cast", () => {
    assert.throws(() => gc([u("abc")], "=", [int("1")]), { code: "FORG0001" });
  });

  it("raises XPTY0004 for incomparable types", () => {
    assert.throws(() => gc([L("xs:string", "1")], "=", [int("1")]), {
      code: "XPTY0004",
    });
  });

  it("rejects unknown operators", () => {
    assert.throws(() => gc([int("1")], "eq", [int("1")]), TypeError);
  });
});

describe("generalCompare (XPath 1.0 compatibility mode)", () => {
  it("compares with booleans by effective boolean value", () => {
    const t = L("xs:boolean", "true");
    assert.equal(gc([L("xs:string", "x")], "=", [t], compat), true);
    assert.equal(gc([t], "=", [L("xs:string", "")], compat), false);
    assert.equal(gc([t], "=", [element("")], compat), true);
    assert.equal(gc([t], "=", [t], compat), true);
  });

  it("converts to numbers for relational operators", () => {
    assert.equal(
      gc([L("xs:string", "10")], ">", [L("xs:string", "9")], compat),
      true,
    );
    assert.equal(gc([L("xs:string", "abc")], "<", [int("1")], compat), false);
    assert.equal(gc([u("2")], ">=", [u("10")], compat), false);
  });

  it("converts to numbers when one value is numeric", () => {
    assert.equal(gc([L("xs:string", "1.0")], "=", [int("1")], compat), true);
    assert.equal(gc([L("xs:string", "abc")], "!=", [int("1")], compat), true);
  });

  it("compares as strings when one is a string or both are untyped", () => {
    assert.equal(gc([u("1.0")], "=", [L("xs:string", "1")], compat), false);
    assert.equal(gc([u("a")], "=", [u("a")], compat), true);
    assert.equal(
      gc([L("xs:anyURI", "a")], "=", [L("xs:string", "a")], compat),
      true,
    );
  });

  it("casts untyped values to the dynamic type of the other", () => {
    const date = L("xs:date", "2000-01-01");
    assert.equal(gc([u("2000-01-01")], "=", [date], compat), true);
    assert.equal(gc([date], "!=", [u("2000-01-01")], compat), false);
    assert.equal(gc([date], "=", [date], compat), true);
  });
});

describe("toNumber", () => {
  it("returns doubles or NaN", () => {
    assert.equal(toNumber(L("xs:string", " 12 ")).value, 12);
    assert.ok(Number.isNaN(toNumber(L("xs:string", "x")).value));
    assert.ok(Number.isNaN(toNumber(L("xs:date", "2000-01-01")).value));
    assert.equal(toNumber(L("xs:boolean", "true")).value, 1);
    assert.throws(
      () => toNumber(new AtomicValue(types.decimal, null)),
      TypeError,
    );
  });
});
