import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDouble,
  numberToDecimal,
  parseDecimal,
  parseDouble,
  parseFloat32,
  parseInteger,
} from "./numeric.js";

describe("numeric lexical forms", () => {
  it("parses integers", () => {
    assert.equal(parseInteger("+0012"), 12n);
    assert.equal(
      parseInteger("-123456789012345678901234567890"),
      -123456789012345678901234567890n,
    );
    assert.equal(parseInteger("1.0"), null);
    assert.equal(parseInteger(""), null);
  });

  it("parses decimals", () => {
    assert.equal(parseDecimal("-1.50").toString(), "-1.5");
    assert.equal(parseDecimal("1e0"), null);
  });

  it("parses doubles including the special values", () => {
    assert.equal(parseDouble("1e0"), 1);
    assert.equal(parseDouble("-1.5E-7"), -1.5e-7);
    assert.equal(parseDouble(".5"), 0.5);
    assert.equal(parseDouble("5."), 5);
    assert.equal(parseDouble("INF"), Infinity);
    assert.equal(parseDouble("+INF"), Infinity);
    assert.equal(parseDouble("-INF"), -Infinity);
    assert.ok(Number.isNaN(parseDouble("NaN")));
    assert.ok(Object.is(parseDouble("-0"), -0));
    assert.ok(Object.is(parseDouble("-0.0E0"), -0));
    for (const bad of [
      "",
      "e5",
      "1e",
      "inf",
      "nan",
      "0x10",
      "1 0",
      "Infinity",
    ]) {
      assert.equal(parseDouble(bad), null, bad);
    }
  });

  it("parses floats with float rounding", () => {
    assert.equal(parseFloat32("1.1"), Math.fround(1.1));
    assert.equal(parseFloat32("1e40"), Infinity);
    assert.equal(parseFloat32("x"), null);
  });
});

describe("canonical numeric strings (F&O 19.1.2)", () => {
  it("formats doubles", () => {
    const cases = [
      [1e10, "1.0E10"],
      [1.5e-7, "1.5E-7"],
      [1, "1"],
      [0.5, "0.5"],
      [-123.456, "-123.456"],
      [1e6, "1.0E6"],
      [999999, "999999"],
      [0.000001, "0.000001"],
      [0.0000001, "1.0E-7"],
      [1.2345e300, "1.2345E300"],
      [-2.5e-10, "-2.5E-10"],
      [0, "0"],
      [-0, "-0"],
      [Infinity, "INF"],
      [-Infinity, "-INF"],
      [NaN, "NaN"],
      [0.1 + 0.2, "0.30000000000000004"],
    ];
    for (const [n, text] of cases) assert.equal(formatDouble(n), text, text);
  });

  it("formats floats with the shortest float digits", () => {
    assert.equal(formatDouble(Math.fround(1.1), true), "1.1");
    assert.equal(formatDouble(Math.fround(16777216), true), "1.6777216E7");
    assert.equal(formatDouble(Math.fround(1e30), true), "1.0E30");
    assert.equal(formatDouble(Math.fround(3.4028235e38), true), "3.4028235E38");
    assert.equal(formatDouble(Math.fround(-0.1), true), "-0.1");
  });

  it("converts doubles and floats to decimals", () => {
    assert.equal(numberToDecimal(0).toString(), "0");
    assert.equal(numberToDecimal(-0).toString(), "0");
    assert.equal(numberToDecimal(0.1).toString(), "0.1");
    assert.equal(numberToDecimal(1e21).toString(), "1000000000000000000000");
    assert.equal(numberToDecimal(-1.5e-7).toString(), "-0.00000015");
    assert.equal(numberToDecimal(Math.fround(1.1), true).toString(), "1.1");
  });
});
