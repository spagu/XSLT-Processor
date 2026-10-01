import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { code, xs } from "../../xpath/testing.test.js";
import { unescapeJsonChars } from "./jsonChars.js";
import { parseJsonText } from "./jsonParser.js";
import { escapeChar, escapeJsonString, stringDecoder } from "./jsonStrings.js";

const ch = (...cps) => String.fromCodePoint(...cps);
const REPLACEMENT = ch(0xfffd);

describe("the JSON parser", () => {
  it("parses values", () => {
    assert.deepEqual(parseJsonText(' [1, -2.5e3, true, false, null, "a"] '), {
      kind: "array",
      members: [
        { kind: "number", text: "1" },
        { kind: "number", text: "-2.5e3" },
        { kind: "boolean", value: true },
        { kind: "boolean", value: false },
        { kind: "null" },
        { kind: "string", chars: [{ cp: 97 }] },
      ],
    });
    assert.deepEqual(parseJsonText(`${ch(0xfeff)}{}`), {
      kind: "object",
      entries: [],
    });
    assert.equal(parseJsonText('{"a":{"b":[]}}').entries[0][1].kind, "object");
  });

  it("keeps the escape sequences of strings", () => {
    const text = `"\\n\\/\\u00e9\\uD834\\uDD1E${ch(0x1f600)}x"`;
    assert.deepEqual(parseJsonText(text).chars, [
      { cp: 10, escape: "\\n" },
      { cp: 0x2f, escape: "\\/" },
      { cp: 0xe9, escape: "\\u00e9" },
      { cp: 0x1d11e, escape: "\\uD834\\uDD1E" },
      { cp: 0x1f600 },
      { cp: 120 },
    ]);
    assert.equal(parseJsonText('"\\uDD1E\\uD834"').chars.length, 2);
  });

  it("rejects what is not JSON (FOJS0001)", () => {
    for (const text of [
      "",
      "[1,]",
      "[01]",
      "[.3]",
      "[+1]",
      "1.e3",
      "314eg",
      "[1 2]",
      "{1:2}",
      '{"a" 1}',
      '{"a":1,}',
      '"abc',
      '"a\tb"',
      '"\\x20"',
      '"\\u12"',
      "[true1]",
      "nul",
      "constructor",
      "[] []",
      "'a'",
    ]) {
      assert.throws(
        () => parseJsonText(text),
        (e) => e.code === "FOJS0001",
        text,
      );
    }
  });

  it("reads escaped strings of xml-to-json (FOJS0007)", () => {
    assert.deepEqual(unescapeJsonChars('a"\\t'), [
      { cp: 97 },
      { cp: 34 },
      { cp: 9, escape: "\\t" },
    ]);
    assert.throws(
      () => unescapeJsonChars("\\q"),
      (e) => e.code === "FOJS0007",
    );
    assert.throws(
      () => unescapeJsonChars("\\"),
      (e) => e.code === "FOJS0007",
    );
  });
});

describe("JSON strings", () => {
  it("escapes characters", () => {
    assert.equal(escapeChar(8), "\\b");
    assert.equal(escapeChar(0x7f), "\\u007F");
    assert.equal(escapeChar(0x1d11e), "\\uD834\\uDD1E");
    assert.equal(
      escapeJsonString(`a"/\\\n${ch(0x85, 0xe9)}`),
      `a\\"\\/\\\\\\n\\u0085${ch(0xe9)}`,
    );
  });

  it("decodes under the escape and fallback options", () => {
    const chars = [
      { cp: 0x5c },
      { cp: 0, escape: "\\u0000" },
      { cp: 0xdead },
      { cp: 9 },
    ];
    assert.equal(
      stringDecoder({ escape: true })(chars),
      "\\\\\\u0000\\uDEAD\\t",
    );
    assert.equal(
      stringDecoder({ escape: false })(chars),
      `\\${REPLACEMENT}${REPLACEMENT}\t`,
    );
  });
});

describe("fn:parse-json", () => {
  it("returns maps, arrays and atomic values", () => {
    assert.equal(xs(`parse-json('{"a":[1,true,null,"x"]}')?a?*`), "1 true x");
    assert.equal(xs("parse-json('1.5') instance of xs:double"), "true");
    assert.equal(xs("parse-json(()), parse-json((), map{})"), "");
    assert.equal(xs("parse-json('null')"), "");
    assert.equal(xs(`parse-json('{"a":1,"a":2}')?a`), "1");
    assert.equal(
      xs(`parse-json('{"a":1,"a":2}', map{"duplicates":"use-last"})?a`),
      "2",
    );
    assert.equal(
      code(`parse-json('{"a":1,"a":2}', map{"duplicates":"reject"})`),
      "FOJS0003",
    );
    assert.equal(
      xs(`parse-json('["\\u0000"]', map{"liberal":true(), "other":1})?1`),
      REPLACEMENT,
    );
  });

  it("applies the escape and fallback options", () => {
    assert.equal(
      xs(`parse-json('"a\\nb\\\\"', map{"escape":true()})`),
      "a\\nb\\\\",
    );
    assert.equal(
      xs(
        `parse-json('"\\uDEAD"', map{"fallback":function($s){"[" || $s || "]"}})`,
      ),
      "[\\uDEAD]",
    );
    assert.equal(
      xs(`parse-json('"\\u0007"', map{"fallback":upper-case#1})`),
      "\\U0007",
    );
  });

  it("checks the options", () => {
    assert.equal(code("parse-json('1', map{'liberal':'yes'})"), "XPTY0004");
    assert.equal(code("parse-json('1', map{'duplicates':'x'})"), "FOJS0005");
    assert.equal(code("parse-json('1', map{'fallback':abs#1})"), null);
    assert.equal(
      code(`parse-json('"\\u0000"', map{"fallback":abs#1})`),
      "XPTY0004",
    );
    assert.equal(
      code("parse-json('1', map{'escape':true(), 'fallback':upper-case#1})"),
      "FOJS0005",
    );
  });

  it("reads documents with json-doc", () => {
    const options = { textLoader: () => '{"a":[1]}' };
    assert.equal(xs("json-doc('http://x/a.json')?a?1", null, options), "1");
    assert.equal(
      xs("json-doc('http://x/a.json', map{})?a?1, json-doc(())", null, options),
      "1",
    );
    assert.equal(xs("json-doc((), map{})"), "");
    assert.equal(code("json-doc('http://x/none.json')"), "FOUT1170");
  });
});
