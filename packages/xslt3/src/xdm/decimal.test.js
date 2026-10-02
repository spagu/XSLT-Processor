import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Decimal, DIVISION_SCALE } from "./decimal.js";

const d = (text) => Decimal.parse(text);

describe("Decimal", () => {
  it("parses and prints canonical forms", () => {
    assert.equal(d("1.0").toString(), "1");
    assert.equal(d("+001.500").toString(), "1.5");
    assert.equal(d("-.5").toString(), "-0.5");
    assert.equal(d("-0.0").toString(), "0");
    assert.equal(d("5.").toString(), "5");
    assert.equal(d("0.000123").toString(), "0.000123");
    assert.equal(
      d("12345678901234567890.123456789").toString(),
      "12345678901234567890.123456789",
    );
  });

  it("rejects non-decimal text", () => {
    for (const text of ["", ".", "+", "1e5", "1.2.3", " 1", "INF", "-"]) {
      assert.equal(Decimal.parse(text), null, text);
    }
  });

  it("normalizes with Decimal.of", () => {
    assert.equal(Decimal.of(1500n, 3).toString(), "1.5");
    assert.equal(Decimal.of(15n, -2).toString(), "1500");
    assert.equal(Decimal.of(0n, 5).scale, 0);
    assert.equal(Decimal.ZERO.toString(), "0");
  });

  it("does exact arithmetic", () => {
    assert.equal(d("0.1").add(d("0.2")).toString(), "0.3");
    assert.equal(d("1").sub(d("0.0001")).toString(), "0.9999");
    assert.equal(d("1.5").mul(d("-2")).toString(), "-3");
    assert.equal(d("-1.5").neg().toString(), "1.5");
  });

  it("divides to DIVISION_SCALE digits, rounding half-down", () => {
    assert.equal(DIVISION_SCALE, 18);
    assert.equal(d("1").div(d("3")).toString(), "0.333333333333333333");
    assert.equal(d("2").div(d("3")).toString(), "0.666666666666666667");
    assert.equal(d("-2").div(d("3")).toString(), "-0.666666666666666667");
    assert.equal(d("2").div(d("-3")).toString(), "-0.666666666666666667");
    assert.equal(d("10").div(d("4")).toString(), "2.5");
    // exact tie at digit 19 rounds toward zero
    assert.equal(
      d("0.0000000000000000005").div(d("1")).toString(),
      "0.0000000000000000005",
    );
    assert.equal(d("1").div(d("2000000000000000000")).toString(), "0");
    assert.equal(d("-1").div(d("2000000000000000000")).toString(), "0");
    assert.equal(
      d("3").div(d("2000000000000000000")).toString(),
      "0.000000000000000001",
    );
    assert.equal(
      d("3.0000001").div(d("2000000000000000000")).toString(),
      "0.000000000000000002",
    );
    assert.equal(d("1.00000000000000000000001").div(d("1")).scale, 23);
  });

  it("computes idiv and mod with truncation", () => {
    assert.equal(d("10").idiv(d("3")), 3n);
    assert.equal(d("-10").idiv(d("3")), -3n);
    assert.equal(d("10.5").mod(d("3")).toString(), "1.5");
    assert.equal(d("-10.5").mod(d("3")).toString(), "-1.5");
    assert.equal(d("10").mod(d("-3")).toString(), "1");
  });

  it("compares, truncates and floors", () => {
    assert.equal(d("1.10").compare(d("1.1")), 0);
    assert.equal(d("1.09").compare(d("1.1")), -1);
    assert.equal(d("2").compare(d("1.999")), 1);
    assert.equal(d("-1.5").trunc(), -1n);
    assert.equal(d("-1.5").floor(), -2n);
    assert.equal(d("-2").floor(), -2n);
    assert.equal(d("1.5").floor(), 1n);
    assert.equal(d("-3").sign(), -1);
    assert.equal(d("0").sign(), 0);
    assert.equal(d("0.1").sign(), 1);
    assert.equal(d("3").isInteger(), true);
    assert.equal(d("3.5").isInteger(), false);
    assert.equal(d("0.1").toNumber(), 0.1);
  });
});
