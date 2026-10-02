import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { arithmetic, unaryArithmetic } from "./arithmetic.js";
import { canonicalString, fromLexical } from "./lexical.js";
import { types } from "./types.js";

const L = (type, text) => fromLexical(type, text);
const int = (text) => L("xs:integer", text);
const dec = (text) => L("xs:decimal", text);
const dbl = (text) => L("xs:double", text);
const flt = (text) => L("xs:float", text);
const calc = (a, op, b) => arithmetic(a, op, b);
const show = (item) => `${item.type.localName} ${canonicalString(item)}`;

describe("numeric arithmetic", () => {
  it("keeps integers exact", () => {
    assert.equal(
      show(calc(int("9007199254740993"), "+", int("1"))),
      "integer 9007199254740994",
    );
    assert.equal(show(calc(int("5"), "-", int("7"))), "integer -2");
    assert.equal(
      show(calc(L("xs:byte", "100"), "*", L("xs:byte", "100"))),
      "integer 10000",
    );
    assert.equal(show(calc(int("10"), "div", int("4"))), "decimal 2.5");
    assert.equal(
      show(calc(int("1"), "div", int("3"))),
      "decimal 0.333333333333333333",
    );
    assert.equal(show(calc(int("-7"), "idiv", int("2"))), "integer -3");
    assert.equal(show(calc(int("-7"), "mod", int("2"))), "integer -1");
  });

  it("computes with decimals", () => {
    assert.equal(show(calc(dec("0.1"), "+", dec("0.2"))), "decimal 0.3");
    assert.equal(show(calc(dec("1.5"), "-", int("2"))), "decimal -0.5");
    assert.equal(show(calc(dec("1.5"), "*", dec("1.5"))), "decimal 2.25");
    assert.equal(show(calc(dec("7.5"), "div", dec("2.5"))), "decimal 3");
    assert.equal(show(calc(dec("7.5"), "idiv", dec("2"))), "integer 3");
    assert.equal(show(calc(dec("7.5"), "mod", dec("2"))), "decimal 1.5");
  });

  it("raises FOAR0001 for division by zero of integers and decimals", () => {
    for (const op of ["div", "idiv", "mod"]) {
      assert.throws(
        () => calc(int("1"), op, int("0")),
        { code: "FOAR0001" },
        op,
      );
      assert.throws(
        () => calc(dec("1.5"), op, dec("0.0")),
        { code: "FOAR0001" },
        op,
      );
    }
    assert.throws(() => calc(dbl("1"), "idiv", dbl("0")), { code: "FOAR0001" });
  });

  it("follows IEEE 754 for doubles and floats", () => {
    assert.equal(show(calc(dbl("1"), "div", dbl("0"))), "double INF");
    assert.equal(show(calc(dbl("-1"), "div", dbl("0"))), "double -INF");
    assert.equal(show(calc(dbl("0"), "div", dbl("0"))), "double NaN");
    assert.equal(show(calc(dbl("5"), "mod", dbl("0"))), "double NaN");
    assert.equal(show(calc(dbl("-5"), "mod", dbl("3"))), "double -2");
    assert.equal(show(calc(dbl("1.5"), "+", int("1"))), "double 2.5");
    assert.equal(show(calc(dbl("1.5"), "-", flt("1"))), "double 0.5");
    assert.equal(show(calc(dbl("1.5"), "*", dec("2"))), "double 3");
    assert.equal(show(calc(flt("0.1"), "+", flt("0.2"))), "float 0.3");
    assert.equal(show(calc(flt("1"), "div", dec("3"))), "float 0.33333334");
    assert.equal(show(calc(flt("3e38"), "*", int("10"))), "float INF");
    assert.equal(show(calc(dbl("1e308"), "*", int("10"))), "double INF");
    assert.equal(show(calc(dbl("7.5"), "idiv", dbl("2"))), "integer 3");
    assert.equal(show(calc(flt("-7.5"), "idiv", flt("2"))), "integer -3");
    assert.equal(show(calc(dbl("5"), "idiv", dbl("INF"))), "integer 0");
  });

  it("raises FOAR0002 for idiv of NaN or infinity", () => {
    assert.throws(() => calc(dbl("NaN"), "idiv", dbl("1")), {
      code: "FOAR0002",
    });
    assert.throws(() => calc(dbl("INF"), "idiv", dbl("1")), {
      code: "FOAR0002",
    });
    assert.throws(() => calc(dbl("1"), "idiv", dbl("NaN")), {
      code: "FOAR0002",
    });
  });

  it("casts untyped operands to xs:double", () => {
    assert.equal(
      show(calc(L("xs:untypedAtomic", "2"), "+", int("1"))),
      "double 3",
    );
    assert.throws(() => calc(L("xs:untypedAtomic", "x"), "+", int("1")), {
      code: "FORG0001",
    });
  });

  it("raises XPTY0004 for non-numeric operands", () => {
    assert.throws(() => calc(L("xs:string", "1"), "+", int("1")), {
      code: "XPTY0004",
    });
  });
});

describe("unary arithmetic", () => {
  it("negates and keeps the primitive numeric type", () => {
    assert.equal(show(unaryArithmetic("-", L("xs:byte", "5"))), "integer -5");
    assert.equal(show(unaryArithmetic("-", dec("1.5"))), "decimal -1.5");
    assert.equal(show(unaryArithmetic("-", dbl("0"))), "double -0");
    assert.equal(show(unaryArithmetic("-", flt("2"))), "float -2");
    assert.equal(show(unaryArithmetic("+", L("xs:short", "5"))), "integer 5");
    assert.equal(unaryArithmetic("+", dbl("1")).type, types.double);
    assert.equal(
      show(unaryArithmetic("-", L("xs:untypedAtomic", "3"))),
      "double -3",
    );
  });

  it("raises XPTY0004 for non-numeric operands", () => {
    assert.throws(() => unaryArithmetic("-", L("xs:string", "1")), {
      code: "XPTY0004",
    });
  });
});
