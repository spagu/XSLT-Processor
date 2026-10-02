import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileRegex, testRegex } from "./compile.js";
import { jsChar } from "./escapes.js";
import { MODIFIERS, stripWhitespace, translateRegex } from "./translate.js";
import { blockRanges } from "./unicodeBlocks.js";
import { throwsCode } from "../testing.test.js";

/** Whether the whole input matches the XPath pattern. */
const full = (pattern, input, flags = "") =>
  testRegex(compileRegex(`^(?:${pattern})$`, flags), input);
const invalid = (pattern, flags) =>
  throwsCode(() => translateRegex(pattern, flags), "FORX0002");

describe("regex translation: atoms, groups and quantifiers", () => {
  it("translates literals, dots and anchors", () => {
    assert.equal(translateRegex("abc").source, "abc");
    assert.equal(jsChar(0x2e), "\\u{2e}");
    assert.ok(full("a.c", "a😀c"));
    assert.ok(!full("a.c", "a\nc"));
    assert.ok(!full("a.c", "a\rc"));
    assert.ok(full("a.c", "a c"));
    assert.ok(full("a.c", "a\nc", "s"));
    assert.ok(full("a/b-c", "a/b-c"));
  });

  it("anchors at line ends with the m flag", () => {
    const m = (pattern, input) => testRegex(compileRegex(pattern, "m"), input);
    assert.ok(m("^b$", "a\nb\nc"));
    assert.ok(!m("^b$", "a\rb\rc"));
    assert.ok(!m("^$", "abcd\ndefg\n"));
    assert.ok(m("^$", "a\n\nb"));
    assert.ok(!testRegex(compileRegex("^b"), "a\nb"));
    assert.ok(testRegex(compileRegex("^*a"), "a"));
  });

  it("supports groups, alternation and back-references", () => {
    const t = translateRegex("((a)|(?:b))(c)\\3");
    assert.equal(t.groups, 3);
    assert.deepEqual(t.parents, [0, 0, 1, 0]);
    assert.ok(full("((a)|(?:b))(c)\\3", "acc"));
    assert.ok(full("(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)\\10", "abcdefghijj"));
    assert.ok(full("(a)\\10", "aa0"));
    assert.ok(full("(a)|b", "b"));
    assert.ok(full("", ""));
  });

  it("supports greedy and reluctant quantifiers", () => {
    assert.ok(full("a{2}", "aa"));
    assert.ok(full("a{2,}", "aaaa"));
    assert.ok(full("a{1,3}?b", "aab"));
    assert.ok(full("a*?b+?c??", "bb"));
    assert.ok(full("a{0,0}", ""));
  });

  it("rejects invalid syntax with FORX0002", () => {
    for (const pattern of [
      "(?=a)",
      "(?!a)",
      "(?<n>a)",
      "a**",
      "a{,2}",
      "a{2,1}",
      "a{2",
      "a{x}",
      "*a",
      "+",
      "?",
      "{1}",
      "a}",
      "a]",
      "(a",
      "a)",
      "\\1(a)",
      "(a\\1)",
      "\\0",
      "\\",
      "\\b",
      "\\x41",
      "\\k",
    ]) {
      invalid(pattern);
    }
    throwsCode(() => translateRegex("a", "g"), "FORX0001");
  });
});

describe("regex translation: escapes and classes", () => {
  it("translates single and multi-character escapes", () => {
    assert.ok(
      full(
        "\\n\\r\\t\\\\\\|\\.\\?\\*\\+\\(\\)\\{\\}\\-\\[\\]\\^\\$",
        "\n\r\t\\|.?*+(){}-[]^$",
      ),
    );
    assert.ok(full("\\s\\S", " x"));
    assert.ok(!full("\\s", " "));
    assert.ok(full("\\d\\D", "٣x"));
    assert.ok(full("\\w\\W", "é!"));
    assert.ok(!full("\\w", " "));
    assert.ok(full("\\i\\c*", "_a-1.b"));
    assert.ok(!full("\\i", "1"));
    assert.ok(full("\\I\\C", "1 "));
  });

  it("translates category and block escapes", () => {
    assert.ok(full("\\p{Lu}\\P{Lu}", "Ab"));
    assert.ok(full("\\p{IsBasicLatin}+", "abc"));
    assert.ok(!full("\\p{IsBasicLatin}", "é"));
    assert.ok(full("\\P{IsBasicLatin}", "é"));
    assert.ok(full("\\p{IsGreek}", "α"));
    assert.ok(full("[\\p{IsPrivateUse}]", "\u{f0000}"));
    assert.ok(full("\\p{Is Basic_Latin}", "a"));
    assert.equal(blockRanges("NoSuchBlock"), undefined);
    for (const pattern of [
      "\\p{Foo}",
      "\\p{IsFoo}",
      "\\pL",
      "\\p{L",
      "\\p{Cs}",
    ]) {
      invalid(pattern);
    }
  });

  it("matches categories by their own case with the i flag", () => {
    assert.equal(full("\\p{Lu}", "m", "i"), !MODIFIERS);
    // Without (?-i:...) (Node.js 22) the i flag folds the category too
    assert.equal(full("[^\\p{Lu}]", "m", "i"), MODIFIERS);
    assert.ok(full("ABC", "abc", "i"));
  });

  it("translates character classes, ranges and subtraction", () => {
    assert.ok(full("[a-z-[aeiou]]+", "bcd"));
    assert.ok(!full("[a-z-[aeiou]]", "e"));
    assert.ok(full("[^a-c]", "d"));
    assert.ok(full("[^\\w]", "!"));
    assert.ok(!full("[^\\w]", "a"));
    assert.ok(full("[\\w-[a]]", "b"));
    assert.ok(full("[-a]", "-"));
    assert.ok(full("[a-]", "-"));
    assert.ok(full("[a-c-x-z]+", "a-z"));
    assert.ok(full("[0-9-.]+", "1-."));
    assert.ok(full("[\\--/]", "."));
    assert.ok(full("[a^]", "^"));
    assert.ok(full("[\\s\\S]", "\n"));
    assert.ok(full("[\\p{Lu}\\w]", "a"));
    assert.ok(full("[😀-😂]", "😁"));
    for (const pattern of [
      "[]",
      "[^]",
      "[a",
      "[a-[b]",
      "[a[b]",
      "[z-a]",
      "[a-\\d]",
      "[\\d-z]",
      "[a-c-e-[b]x]",
      "[a-z-[b]",
      "[a-\\]]",
      "[\\1]",
    ]) {
      invalid(pattern);
    }
  });
});

describe("regex flags x and q", () => {
  it("removes whitespace outside classes with x", () => {
    assert.equal(stripWhitespace("a b\t[ c ]\n"), "ab[ c ]");
    assert.equal(stripWhitespace("hello\\ sworld"), "hello\\sworld");
    assert.equal(stripWhitespace("\\[ a ]"), "\\[a]");
    assert.equal(stripWhitespace("a\\"), "a\\");
    assert.ok(full("hello world", "helloworld", "x"));
    assert.ok(full("[ ]", " ", "x"));
  });

  it("matches literally with q", () => {
    const q = (pattern, input, flags = "q") =>
      testRegex(compileRegex(pattern, flags), input);
    assert.ok(q("a.b*", "xa.b*"));
    assert.ok(!q("a.b", "axb"));
    assert.ok(q("A.B", "a.b", "qi"));
    assert.equal(translateRegex("(", "q").groups, 0);
  });

  it("caches compiled expressions", () => {
    assert.equal(compileRegex("abc", "i"), compileRegex("abc", "i"));
    for (let i = 0; i < 300; i++) compileRegex(`x${i}`);
    assert.ok(compileRegex("abc", "i").regex.flags.includes("i"));
  });
});
