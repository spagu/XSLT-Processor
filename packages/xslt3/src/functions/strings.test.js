import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { roundHalfUp, selectRange, stringFunctions } from "./strings.js";
import { coreStringFunctions } from "./stringsCore.js";
import {
  call,
  checkDefinitions,
  one,
  strings,
  throwsCode,
  v,
} from "./testing.test.js";

const f = (local, ...args) => call(stringFunctions, local, args);
const UCA = "http://www.w3.org/2013/collation/UCA?lang=en;strength=primary";

describe("string functions: definitions", () => {
  checkDefinitions(stringFunctions);
  checkDefinitions(coreStringFunctions);
});

describe("codepoints-to-string and string-to-codepoints", () => {
  it("converts both ways (F&O examples)", () => {
    assert.equal(one(f("codepoints-to-string", [66n, 65n, 67n, 72n])), "BACH");
    assert.equal(one(f("codepoints-to-string", [2309n, 2358n])), "अश");
    assert.equal(one(f("codepoints-to-string", [])), "");
    assert.equal(one(f("codepoints-to-string", [0x1f600n])), "😀");
    assert.deepEqual(strings(f("string-to-codepoints", "Thérèse")), [
      "84",
      "104",
      "233",
      "114",
      "232",
      "115",
      "101",
    ]);
    assert.deepEqual(f("string-to-codepoints", null), []);
    assert.deepEqual(strings(f("string-to-codepoints", "😀")), ["128512"]);
  });

  it("rejects codepoints that are not XML characters", () => {
    for (const cp of [0n, 8n, 11n, 0x1fn, 0xd800n, 0xfffen, 0x110000n]) {
      throwsCode(() => f("codepoints-to-string", [cp]), "FOCH0001");
    }
    assert.equal(
      one(f("codepoints-to-string", [0xe000n, 0x10ffffn])).length,
      3,
    );
    assert.equal(
      one(f("codepoints-to-string", [9n, 10n, 13n, 32n])),
      "\t\n\r ",
    );
  });
});

describe("compare and codepoint-equal", () => {
  it("compares by codepoints or a collation", () => {
    assert.equal(one(f("compare", "abc", "abc")), "0");
    assert.equal(one(f("compare", "abc", "abd")), "-1");
    assert.equal(one(f("compare", "b", "a")), "1");
    assert.deepEqual(f("compare", null, "a"), []);
    assert.deepEqual(f("compare", "a", null), []);
    assert.equal(one(f("compare", "Strasse", "strasse", UCA)), "0");
    throwsCode(
      () => f("compare", "a", "b", "http://example.com/x"),
      "FOCH0002",
    );
  });

  it("tests codepoint equality", () => {
    assert.equal(one(f("codepoint-equal", "abcd", "abcd")), "true");
    assert.equal(one(f("codepoint-equal", "abcd", "abcd ")), "false");
    assert.deepEqual(f("codepoint-equal", "", null), []);
    assert.deepEqual(f("codepoint-equal", null, ""), []);
  });
});

describe("substring", () => {
  const sub = (...args) => one(f("substring", ...args));
  it("follows the rounding rules of the F&O examples", () => {
    assert.equal(sub("motor car", 6), " car");
    assert.equal(sub("metadata", 4, 3), "ada");
    assert.equal(sub("12345", 1.5, 2.6), "234");
    assert.equal(sub("12345", 0, 3), "12");
    assert.equal(sub("12345", 5, -3), "");
    assert.equal(sub("12345", -3, 5), "1");
    assert.equal(sub("12345", NaN, 3), "");
    assert.equal(sub("12345", 1, NaN), "");
    assert.equal(sub(null, 1, 3), "");
    assert.equal(sub("12345", -42, Infinity), "12345");
    assert.equal(sub("12345", -Infinity, Infinity), "");
    assert.equal(sub("a😀b", 2, 1), "😀");
  });

  it("exports the shared rounding helpers", () => {
    assert.equal(roundHalfUp(2.5), 3);
    assert.equal(roundHalfUp(-2.5), -2);
    assert.equal(roundHalfUp(0.49999999999999994), 0);
    assert.deepEqual(selectRange(5, 2), [1, 5]);
    assert.deepEqual(selectRange(5, 9, 1), [0, 0]);
  });
});

describe("normalize-space and normalize-unicode", () => {
  it("collapses XML whitespace only", () => {
    assert.equal(
      one(f("normalize-space", " The  wealthy curled darlings\n\t ")),
      "The wealthy curled darlings",
    );
    assert.equal(one(f("normalize-space", null)), "");
    assert.equal(one(f("normalize-space", " a ")), " a ");
  });

  it("uses the context item for the zero-argument form", () => {
    const ctx = { contextItem: v("string", "  a  b ") };
    assert.equal(one(call(stringFunctions, "normalize-space", [], ctx)), "a b");
    throwsCode(
      () => call(stringFunctions, "normalize-space", [], {}),
      "XPDY0002",
    );
    throwsCode(
      () => call(stringFunctions, "normalize-space", [], { contextItem: null }),
      "XPDY0002",
    );
  });

  it("normalizes to the four forms and FULLY-NORMALIZED", () => {
    const decomposed = "é";
    assert.equal(one(f("normalize-unicode", decomposed)), "é");
    assert.equal(one(f("normalize-unicode", "é", " nfd ")), decomposed);
    assert.equal(one(f("normalize-unicode", "ﬁ", "NFKC")), "fi");
    assert.equal(one(f("normalize-unicode", "ﬁ", "NFKD")), "fi");
    assert.equal(one(f("normalize-unicode", decomposed, "")), decomposed);
    assert.equal(one(f("normalize-unicode", null)), "");
    assert.equal(one(f("normalize-unicode", "́a", "FULLY-NORMALIZED")), " ́a");
    assert.equal(
      one(f("normalize-unicode", "blah", "fully-normalized")),
      "blah",
    );
    throwsCode(() => f("normalize-unicode", "a", "NFX"), "FOCH0003");
  });
});

describe("case mapping and translate", () => {
  it("maps case with the Unicode rules", () => {
    assert.equal(one(f("upper-case", "abCd0")), "ABCD0");
    assert.equal(one(f("lower-case", "ABc!D")), "abc!d");
    assert.equal(one(f("upper-case", "straße")), "STRASSE");
    assert.equal(one(f("upper-case", null)), "");
    assert.equal(one(f("lower-case", null)), "");
  });

  it("translates codepoints (F&O examples)", () => {
    assert.equal(one(f("translate", "bar", "abc", "ABC")), "BAr");
    assert.equal(one(f("translate", "--aaa--", "abc-", "ABC")), "AAA");
    assert.equal(one(f("translate", "abcdabc", "abc", "AB")), "ABdAB");
    assert.equal(one(f("translate", "aa", "aa", "xy")), "xx");
    assert.equal(one(f("translate", "a😀b", "😀", "-")), "a-b");
    assert.equal(one(f("translate", null, "a", "b")), "");
  });
});

describe("contains-token", () => {
  it("finds whitespace-separated tokens (F&O examples)", () => {
    const ct = (...args) => one(f("contains-token", ...args));
    assert.equal(ct("red green blue ", "red"), "true");
    assert.equal(ct(["red", "green", "blue"], " red "), "true");
    assert.equal(ct("red, green, blue", "red"), "false");
    assert.equal(
      ct(
        "red green blue",
        "RED",
        "http://www.w3.org/2005/xpath-functions/collation/html-ascii-case-insensitive",
      ),
      "true",
    );
    assert.equal(ct("a b", "  "), "false");
    assert.equal(ct([], "a"), "false");
  });
});

describe("concat, string-join and string-length (core overlap)", () => {
  const g = (local, args, ctx) => call(coreStringFunctions, local, args, ctx);
  it("concatenates atomic values", () => {
    assert.equal(one(g("concat", ["un", "grateful"])), "ungrateful");
    assert.equal(
      one(g("concat", ["Thy ", null, "old ", "groans", "", 1n])),
      "Thy old groans1",
    );
    assert.equal(one(g("concat", [v("double", "1e0"), true])), "1true");
  });

  it("joins with an optional separator", () => {
    assert.equal(one(g("string-join", [[1n, 2n, 3n]])), "123");
    assert.equal(one(g("string-join", [["a", "b"], ", "])), "a, b");
    assert.equal(one(g("string-join", [[], "x"])), "");
  });

  it("counts codepoints", () => {
    assert.equal(one(g("string-length", ["Harp not on that string"])), "23");
    assert.equal(one(g("string-length", [null])), "0");
    assert.equal(one(g("string-length", ["😀"])), "1");
    assert.equal(
      one(g("string-length", [], { contextItem: v("integer", "123") })),
      "3",
    );
  });
});
