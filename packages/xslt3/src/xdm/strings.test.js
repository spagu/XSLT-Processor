import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareCodepoints,
  normalizeWhitespace,
  parseBoolean,
} from "./strings.js";

describe("string helpers", () => {
  it("applies the whiteSpace facet", () => {
    const text = "\t a \r\n b  ";
    assert.equal(normalizeWhitespace(text, "preserve"), text);
    assert.equal(normalizeWhitespace(text, "replace"), "  a    b  ");
    assert.equal(normalizeWhitespace(text, "collapse"), "a b");
    // non-XML whitespace is kept
    assert.equal(normalizeWhitespace(" a", "collapse"), " a");
  });

  it("parses booleans", () => {
    assert.equal(parseBoolean("true"), true);
    assert.equal(parseBoolean("1"), true);
    assert.equal(parseBoolean("false"), false);
    assert.equal(parseBoolean("0"), false);
    assert.equal(parseBoolean("TRUE"), null);
  });

  it("compares by codepoints, not UTF-16 units", () => {
    assert.equal(compareCodepoints("a", "a"), 0);
    assert.equal(compareCodepoints("a", "b"), -1);
    assert.equal(compareCodepoints("b", "a"), 1);
    assert.equal(compareCodepoints("ab", "a"), 1);
    assert.equal(compareCodepoints("a", "ab"), -1);
    // U+10000 is above U+FFFF although its first UTF-16 unit is lower
    assert.equal(compareCodepoints("\u{10000}", "￿"), 1);
    assert.equal(compareCodepoints("\u{10000}a", "\u{10000}b"), -1);
  });
});
