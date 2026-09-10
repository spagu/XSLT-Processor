/**
 * `xsl:number` formatting tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { formatXsltNumber, toRoman } from "./numberFormat.js";

describe("formatXsltNumber", () => {
  it("should format decimal numbers by default", () => {
    assert.strictEqual(formatXsltNumber([7]), "7");
  });

  it("should pad with leading zeros", () => {
    assert.strictEqual(formatXsltNumber([7], "01"), "07");
    assert.strictEqual(formatXsltNumber([123], "01"), "123");
  });

  it("should format alphabetic sequences", () => {
    assert.strictEqual(formatXsltNumber([1], "a"), "a");
    assert.strictEqual(formatXsltNumber([26], "a"), "z");
    assert.strictEqual(formatXsltNumber([27], "a"), "aa");
    assert.strictEqual(formatXsltNumber([2], "A"), "B");
  });

  it("should format Roman numerals", () => {
    assert.strictEqual(formatXsltNumber([4], "i"), "iv");
    assert.strictEqual(formatXsltNumber([2024], "I"), "MMXXIV");
  });

  it("should fall back to decimals for unknown tokens", () => {
    assert.strictEqual(formatXsltNumber([42], "x"), "42");
  });

  it("should fall back to decimals for non positive numbers", () => {
    assert.strictEqual(formatXsltNumber([0], "a"), "0");
    assert.strictEqual(formatXsltNumber([-3], "I"), "-3");
  });

  it("should join multi level numbers with the format separator", () => {
    assert.strictEqual(formatXsltNumber([2, 3], "1.1"), "2.3");
    assert.strictEqual(formatXsltNumber([1, 2, 3], "1.1"), "1.2.3");
    assert.strictEqual(formatXsltNumber([1, 2], "A-1"), "A-2");
  });

  it("should honour prefix and suffix", () => {
    assert.strictEqual(formatXsltNumber([3], "(1)"), "(3)");
    assert.strictEqual(formatXsltNumber([1, 2], "[1.1]"), "[1.2]");
  });

  it("should default the separator when the format has none", () => {
    assert.strictEqual(formatXsltNumber([1, 2], "1"), "1.2");
  });

  it("should default the token when the format has none", () => {
    assert.strictEqual(formatXsltNumber([3], "-"), "-3");
    assert.strictEqual(formatXsltNumber([3], ""), "3");
  });

  it("should return an empty string for an empty sequence", () => {
    assert.strictEqual(formatXsltNumber([], "1"), "");
  });
});

describe("toRoman", () => {
  it("should convert numbers to Roman numerals", () => {
    assert.strictEqual(toRoman(1), "I");
    assert.strictEqual(toRoman(1999), "MCMXCIX");
  });
});
