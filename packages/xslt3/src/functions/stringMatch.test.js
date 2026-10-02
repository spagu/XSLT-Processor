import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CODEPOINT_COLLATION,
  findSubstring,
  getCollation,
  HTML_ASCII_COLLATION,
} from "./collations.js";
import { stringMatchFunctions } from "./stringMatch.js";
import { call, checkDefinitions, one, throwsCode } from "./testing.test.js";

const f = (local, ...args) => one(call(stringMatchFunctions, local, args));
const UCA = "http://www.w3.org/2013/collation/UCA";
const PRIMARY = `${UCA}?lang=en;strength=primary`;

describe("substring matching functions", () => {
  checkDefinitions(stringMatchFunctions);

  it("matches with the codepoint collation (F&O examples)", () => {
    assert.equal(f("contains", "tattoo", "t"), "true");
    assert.equal(f("contains", "tattoo", "ttt"), "false");
    assert.equal(f("contains", "", null), "true");
    assert.equal(f("contains", null, ""), "true");
    assert.equal(f("starts-with", "tattoo", "tat"), "true");
    assert.equal(f("starts-with", "tattoo", "att"), "false");
    assert.equal(f("ends-with", "tattoo", "tattoo"), "true");
    assert.equal(f("ends-with", "tattoo", "atto"), "false");
    assert.equal(f("substring-before", "tattoo", "attoo"), "t");
    assert.equal(f("substring-before", "tattoo", "tatto"), "");
    assert.equal(f("substring-before", "abc", "x"), "");
    assert.equal(f("substring-after", "tattoo", "tat"), "too");
    assert.equal(f("substring-after", "tattoo", "tattoo"), "");
    assert.equal(f("substring-after", "abc", ""), "abc");
    assert.equal(f("substring-after", "abc", "x"), "");
    assert.equal(f("contains", "abc", "b", CODEPOINT_COLLATION), "true");
  });

  it("matches with the HTML ASCII case-insensitive collation", () => {
    const html = HTML_ASCII_COLLATION;
    assert.equal(f("contains", "Banana", "NAN", html), "true");
    assert.equal(f("starts-with", "Banana", "bA", html), "true");
    assert.equal(f("ends-with", "Banana", "ANA", html), "true");
    assert.equal(f("ends-with", "Banana", "x", html), "false");
    assert.equal(f("starts-with", "Banana", "x", html), "false");
    assert.equal(f("substring-after", "ABcD", "bc", html), "D");
    assert.equal(f("contains", "É", "é", html), "false");
  });

  it("matches with UCA collations by comparing substrings", () => {
    assert.equal(f("contains", "database", "DATA", PRIMARY), "true");
    assert.equal(f("starts-with", "database", "DATA", PRIMARY), "true");
    assert.equal(f("ends-with", "database", "BASE", PRIMARY), "true");
    assert.equal(f("starts-with", "database", "base", PRIMARY), "false");
    assert.equal(f("substring-before", "dâtabase", "TAB", PRIMARY), "dâ");
    assert.equal(f("substring-after", "dâtabase", "TAB", PRIMARY), "ase");
    assert.equal(f("contains", "banana", "x", `${UCA}?lang=en`), "false");
    throwsCode(
      () => f("contains", "Chapter-100", "Chapter-1", `${UCA}?numeric=yes`),
      "FOCH0004",
    );
  });
});

describe("collations", () => {
  it("resolves the supported collations", () => {
    assert.equal(getCollation().uri, CODEPOINT_COLLATION);
    assert.equal(
      getCollation(undefined, { defaultCollation: HTML_ASCII_COLLATION }).uri,
      HTML_ASCII_COLLATION,
    );
    assert.equal(getCollation(HTML_ASCII_COLLATION).compare("ABC", "abc"), 0);
    assert.equal(getCollation(UCA).compare("a", "b"), -1);
    throwsCode(() => getCollation("http://example.com/c"), "FOCH0002");
    const base = { staticBaseUri: "http://www.w3.org/2005/xpath-functions/" };
    assert.equal(
      getCollation("collation/codepoint", base).uri,
      CODEPOINT_COLLATION,
    );
    throwsCode(() => getCollation("collation/codepoint"), "FOCH0002");
  });

  it("honours the UCA parameters Intl.Collator supports", () => {
    const c = (params, a, b) => getCollation(`${UCA}?${params}`).compare(a, b);
    assert.equal(c("lang=en;strength=secondary", "a", "A"), 0);
    assert.equal(c("lang=en;strength=3", "a", "A"), -1);
    assert.equal(c("lang=en;strength=1", "á", "A"), 0);
    assert.equal(c("lang=en;strength=2", "á", "a"), 1);
    assert.equal(c("lang=en;numeric=yes", "Chap2", "Chap10"), -1);
    assert.equal(c("lang=en;caseFirst=upper", "a", "A"), 1);
    assert.equal(c("lang=en;caseFirst=lower", "a", "A"), -1);
    assert.equal(c("lang=en;caseFirst=off", "a", "A"), -1);
    assert.equal(
      c("lang=en;alternate=shifted;strength=primary", "a-b", "ab"),
      0,
    );
    const space = (params) => c(`lang=en;${params}`, "database", "data base");
    assert.equal(space("alternate=blanked;strength=quaternary"), 0);
    assert.notEqual(space("alternate=blanked;strength=identical"), 0);
    assert.notEqual(space("alternate=shifted;strength=4"), 0);
    assert.notEqual(space("alternate=shifted;strength=5"), 0);
    assert.equal(space("alternate=shifted;strength=tertiary"), 0);
    assert.equal(c("lang=@*!+%", "a", "b"), -1);
    assert.equal(c("fallback=no;lang=en", "a", "b"), -1);
    throwsCode(
      () => getCollation(`${UCA}?fallback=no;backwards=yes`),
      "FOCH0002",
    );
  });

  it("finds substrings under a collation", () => {
    const codepoint = getCollation();
    assert.deepEqual(findSubstring(codepoint, "abcabc", "bc"), [1, 3]);
    assert.deepEqual(findSubstring(codepoint, "abc", "ab", "start"), [0, 2]);
    assert.deepEqual(findSubstring(codepoint, "abc", "bc", "end"), [1, 3]);
    assert.equal(findSubstring(codepoint, "abc", "x"), null);
    const primary = getCollation(PRIMARY);
    assert.deepEqual(findSubstring(primary, "aBc", "B"), [1, 2]);
    assert.deepEqual(findSubstring(primary, "aBc", "", "end"), [3, 3]);
    assert.equal(findSubstring(primary, "abc", "x", "end"), null);
  });
});
