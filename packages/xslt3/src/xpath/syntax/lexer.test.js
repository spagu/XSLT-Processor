import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { XPathError } from "../../errors.js";
import { isNCName, normalizeSpace } from "./chars.js";
import { tokenize } from "./lexer.js";

/** Tokens as short strings: "name:p:l", "sym:(", "integer:1"... */
function lex(source) {
  return tokenize(source)
    .slice(0, -1)
    .map((t) => {
      if (t.type === "name" || t.type === "wildcard") {
        const uri = t.uri === null ? "" : `{${t.uri}}`;
        return `${t.type}:${uri}${t.prefix ?? ""}:${t.local ?? "*"}`;
      }
      return `${t.type === "symbol" ? "sym" : t.type}:${t.value}`;
    });
}

function lexError(source, pattern) {
  assert.throws(
    () => tokenize(source),
    (e) =>
      e instanceof XPathError &&
      e.code === "XPST0003" &&
      pattern.test(e.message),
  );
}

describe("lexer", () => {
  it("ends with an eof token at the end offset", () => {
    assert.deepEqual(tokenize("  "), [{ type: "eof", start: 2, end: 2 }]);
  });

  it("records offsets", () => {
    const [a, plus, b] = tokenize("a + bc");
    assert.deepEqual(
      [a.start, a.end, plus.start, b.start, b.end],
      [0, 1, 2, 4, 6],
    );
  });

  it("reads NCNames, QNames and EQNames", () => {
    assert.deepEqual(lex("a p:b Q{http://x}c Q{}d"), [
      "name::a",
      "name:p:b",
      "name:{http://x}:c",
      "name:{}:d",
    ]);
  });

  it("whitespace-normalizes braced URIs", () => {
    assert.deepEqual(lex("Q{ a \n b }c"), ["name:{a b}:c"]);
  });

  it("reads wildcards", () => {
    assert.deepEqual(lex("* p:* *:l Q{u}*"), [
      "sym:*",
      "wildcard:p:*",
      "wildcard::l",
      "wildcard:{u}:*",
    ]);
  });

  it("keeps '-' and '.' inside names (maximal munch)", () => {
    assert.deepEqual(lex("a-b a - b a -b x.y"), [
      "name::a-b",
      "name::a",
      "sym:-",
      "name::b",
      "name::a",
      "sym:-",
      "name::b",
      "name::x.y",
    ]);
  });

  it("reads non-ASCII names", () => {
    assert.deepEqual(lex("été 名前 \u{10000}x"), [
      "name::été",
      "name::名前",
      "name::\u{10000}x",
    ]);
  });

  it("splits a name before '::' and before ':' not followed by a name", () => {
    assert.deepEqual(lex("child::a b :c"), [
      "name::child",
      "sym:::",
      "name::a",
      "name::b",
      "sym::",
      "name::c",
    ]);
    assert.deepEqual(lex("a:1"), ["name::a", "sym::", "integer:1"]);
  });

  it("reads numeric literals keeping the lexical form", () => {
    assert.deepEqual(lex("12 1.50 .5 3. 1e3 1.5E-2 .5e+1"), [
      "integer:12",
      "decimal:1.50",
      "decimal:.5",
      "decimal:3.",
      "double:1e3",
      "double:1.5E-2",
      "double:.5e+1",
    ]);
  });

  it("rejects a numeric literal followed by a name or number (A.2.2)", () => {
    lexError("10div 3", /offset 2/);
    lexError("1e", /Numeric literal/);
    lexError("1.2.3", /Numeric literal/);
  });

  it("reads string literals with doubled-quote escapes", () => {
    assert.deepEqual(lex(`"a""b" 'c''d' "it's" ''`), [
      'string:a"b',
      "string:c'd",
      "string:it's",
      "string:",
    ]);
  });

  it("rejects unterminated strings", () => {
    lexError('"abc', /Unterminated string/);
    lexError("'a''", /Unterminated string/);
  });

  it("reads every symbol, longest first", () => {
    const symbols =
      "!= <= >= << >> => || // :: := .. ! # $ ( ) * + , - . / : < = > ? @ [ ] { } |";
    assert.deepEqual(
      lex(symbols),
      symbols.split(" ").map((s) => `sym:${s}`),
    );
    assert.deepEqual(lex("a!=b"), ["name::a", "sym:!=", "name::b"]);
    assert.deepEqual(lex("$a=>f"), ["sym:$", "name::a", "sym:=>", "name::f"]);
  });

  it("skips nested comments", () => {
    assert.deepEqual(lex("1 (: a (: b :) c :) + (::)2"), [
      "integer:1",
      "sym:+",
      "integer:2",
    ]);
  });

  it("does not see comments inside strings", () => {
    assert.deepEqual(lex('"(: x :)"'), ["string:(: x :)"]);
  });

  it("rejects unclosed comments", () => {
    lexError("1 (: a (: b :)", /Unclosed comment at offset 2/);
  });

  it("rejects malformed braced URIs", () => {
    lexError("Q{abc", /Malformed braced URI/);
    lexError("Q{a{b}c", /Malformed braced URI/);
    lexError("Q{a}1", /Expected a local name/);
  });

  it("rejects unknown characters", () => {
    lexError("1 ; 2", /Unexpected character ";"/);
    lexError("a & b", /Unexpected character "&"/);
    assert.deepEqual(lex("*:"), ["sym:*", "sym::"]);
  });
});

describe("chars", () => {
  it("checks NCNames", () => {
    assert.equal(isNCName("a-b.c"), true);
    assert.equal(isNCName("1a"), false);
    assert.equal(isNCName("a:b"), false);
    assert.equal(isNCName(""), false);
  });

  it("normalizes whitespace", () => {
    assert.equal(normalizeSpace("\t a \r\n b  "), "a b");
  });
});
