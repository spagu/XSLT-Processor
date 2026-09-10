/**
 * `format-number()` picture string tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { DEFAULT_DECIMAL_FORMAT, formatNumber } from "./formatNumber.js";

describe("formatNumber", () => {
  const cases = [
    [1234.5, "#,##0.00", "1,234.50"],
    [1.5, "0.0", "1.5"],
    [1, "0.0", "1.0"],
    [0.25, "#%", "25%"],
    [0.25, "#.##%", "25%"],
    [0.1234, "#0.0%", "12.3%"],
    [1234.5678, "###0.###", "1234.568"],
    [1234, "###0.###", "1234"],
    [-1234, "#,##0;(#,##0)", "(1,234)"],
    [1234, "#,##0;(#,##0)", "1,234"],
    [-1234, "#,##0", "-1,234"],
    [0.5, "#.##", ".5"],
    [0, "#", "0"],
    [1234567, "#,##0", "1,234,567"],
    [12, "#,##0", "12"],
    [0.004, "0.0‰", "4.0‰"],
    [5, "€#,##0.00", "€5.00"],
  ];

  for (const [value, pattern, expected] of cases) {
    it(`should format ${value} with "${pattern}" as "${expected}"`, () => {
      assert.strictEqual(formatNumber(value, pattern), expected);
    });
  }

  it("should format NaN with the NaN symbol", () => {
    assert.strictEqual(formatNumber(NaN, "#,##0.00"), "NaN");
  });

  it("should format non numbers with the NaN symbol", () => {
    assert.strictEqual(formatNumber("abc", "#,##0.00"), "NaN");
  });

  it("should format infinity", () => {
    assert.strictEqual(formatNumber(Infinity, "#,##0.00"), "Infinity");
    assert.strictEqual(formatNumber(-Infinity, "#,##0.00"), "-Infinity");
  });

  it("should honour a custom decimal format", () => {
    const format = {
      decimalSeparator: ",",
      groupingSeparator: ".",
      minusSign: "−",
      nan: "nie liczba",
    };

    assert.strictEqual(formatNumber(1234.5, "#.##0,00", format), "1.234,50");
    assert.strictEqual(formatNumber(-1, "0", format), "−1");
    assert.strictEqual(formatNumber(NaN, "0", format), "nie liczba");
  });

  it("should honour a custom zero digit", () => {
    const format = { zeroDigit: "٠" };
    assert.strictEqual(formatNumber(12, "٠٠", format), "١٢");
    assert.strictEqual(formatNumber(5, "٠٠", format), "٠٥");
  });

  it("should expose the default decimal format symbols", () => {
    assert.strictEqual(DEFAULT_DECIMAL_FORMAT.decimalSeparator, ".");
    assert.strictEqual(DEFAULT_DECIMAL_FORMAT.percent, "%");
  });

  it("should clamp the fraction digits of an extreme pattern", () => {
    assert.strictEqual(
      formatNumber(1, `0.${"0".repeat(120)}`).length > 100,
      true,
    );
  });
});
