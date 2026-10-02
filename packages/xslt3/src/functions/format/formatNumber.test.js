import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_DECIMAL_FORMAT, getDecimalFormat } from "./decimalFormat.js";
import { formatNumber, formatNumberFunctions } from "./formatNumber.js";
import { analyzePicture } from "./numberPicture.js";
import { call, checkDefinitions, one, throwsCode, v } from "../testing.test.js";

const D = DEFAULT_DECIMAL_FORMAT;
const fn = (type, text, picture, format = D) =>
  formatNumber(v(type, text), picture, format);
const dbl = (text, picture, format) => fn("double", text, picture, format);

describe("format-number", () => {
  checkDefinitions(formatNumberFunctions);

  it("formats the F&O examples", () => {
    assert.equal(dbl("12345.6", "#,###.00"), "12,345.60");
    assert.equal(dbl("12345678.9", "9,999.99"), "12,345,678.90");
    assert.equal(dbl("123.9", "9999"), "0124");
    assert.equal(dbl("0.14", "01%"), "14%");
    assert.equal(fn("integer", "-6", "000"), "-006");
    const ch = { ...D, groupingSeparator: "ʹ", decimalSeparator: "·" };
    assert.equal(dbl("1234.5678", "#ʹ##0·00", ch), "1ʹ234·57");
    const fortran = { ...D, exponentSeparator: "E" };
    assert.equal(dbl("1234.5678", "00.000E0", fortran), "12.346E2");
    assert.equal(dbl("0.234", "0.0E0", fortran), "2.3E-1");
    assert.equal(dbl("0.234", "#.00E0", fortran), "0.23E0");
    assert.equal(dbl("0.234", ".00E0", fortran), ".23E0");
  });

  it("applies the adjustments of the analysis phase", () => {
    assert.equal(dbl("0.23", "#"), "0");
    assert.equal(dbl("0.123", "#.e9"), "0.1e0");
    assert.equal(dbl("0.1", ".9e9"), ".1e0");
    assert.equal(dbl("0.1", "#.9e9"), "0.1e0");
    assert.equal(dbl("0.2", "#e0"), "0.2e0");
    assert.equal(dbl("0.99999999", "0.0e0"), "10.0e-1");
    assert.equal(dbl("0", "0.0e0"), "0.0e0");
    assert.equal(dbl("0.5", ".#"), ".5");
    assert.equal(dbl("0", "#.#"), ".0");
    assert.equal(dbl("1234567.891", "#,##0.0##,#"), "1,234,567.891");
    assert.equal(dbl("1.5", "0.000,0"), "1.500,0");
  });

  it("chooses sub-pictures and handles special values", () => {
    assert.equal(dbl("-5", "0;(0)"), "(5)");
    assert.equal(dbl("-0", "0"), "-0");
    assert.equal(fn("decimal", "-0", "0"), "0");
    assert.equal(fn("decimal", "-1.5", "0.0"), "-1.5");
    assert.equal(dbl("NaN", "0"), "NaN");
    assert.equal(dbl("INF", "0;(0)"), "Infinity");
    assert.equal(dbl("-1e308", "0%"), "-Infinity%");
    assert.equal(fn("float", "1.5", "0.0‰"), "1500.0‰");
    assert.equal(fn("float", "3.4E38", "0%"), "Infinity%");
    assert.equal(formatNumber(undefined, "0", D), "NaN");
    assert.equal(fn("integer", "5", "٠", { ...D, zeroDigit: "٠" }), "٥");
  });

  it("rejects invalid pictures with FODF1310", () => {
    for (const picture of [
      "0;0;0",
      "0.0.0",
      "0%%",
      "0%‰",
      "abc",
      "0a0",
      "#,.0",
      "0,",
      "#,,#",
      "0#",
      ".#0",
      "0e0e0",
      "0e0%",
      "0e#",
      "0e,0",
    ]) {
      throwsCode(() => analyzePicture(picture, D), "FODF1310");
    }
    assert.equal(analyzePicture("e0", D).positive.prefix, "e");
  });

  it("uses decimal formats from the context", () => {
    const formats = new Map([
      ["", { decimalSeparator: ",", groupingSeparator: " " }],
      ["eu", { decimalSeparator: ",", groupingSeparator: "." }],
    ]);
    const context = { decimalFormats: formats };
    const f = (...args) =>
      one(call(formatNumberFunctions, "format-number", args, context));
    assert.equal(f(1.5, "0,0"), "1,5");
    assert.equal(f(1234n, "#.##0", " eu "), "1.234");
    assert.equal(f(null, "0"), "NaN");
    assert.equal(f(1.5, "0,0", null), "1,5");
    throwsCode(() => f(1n, "0", "nope"), "FODF1280");
    assert.equal(getDecimalFormat(undefined, {}).nan, "NaN");
    throwsCode(() => getDecimalFormat("x", {}), "FODF1280");
  });
});
