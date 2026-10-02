import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import { evaluateXPath } from "../../xpath/index.js";
import { serialize, serializeChunks } from "../index.js";

const doc = new DOMParser().parseFromString(
  '<r a="1&lt;"><!--c--><?p d?><e>x<f>y</f>&amp;</e></r>',
  "text/xml",
);
const run = (expr, params) => serialize(evaluateXPath(expr, doc), params);
const code = (fn) => {
  try {
    fn();
    return null;
  } catch (error) {
    return error.code;
  }
};

describe("the text output method", () => {
  it("writes the text of the normalized sequence", () => {
    assert.equal(run("(/, 1, 2)", { method: "text" }), "xy&1 2");
    assert.equal(run("(1, 2)", { method: "text", itemSeparator: "," }), "1,2");
    assert.equal(run("/r/comment()", { method: "text" }), "");
    const mixed = new DOMParser().parseFromString(
      "<r><!--c--><a>x<![CDATA[y]]><!--d--></a></r>",
      "text/xml",
    );
    assert.equal(
      serialize([mixed.documentElement.firstChild, mixed], { method: "text" }),
      "xy",
    );
    assert.equal(
      run("'$'", { method: "text", useCharacterMaps: { $: "£" } }),
      "£",
    );
    assert.equal(
      code(() => run("'é'", { method: "text", encoding: "US-ASCII" })),
      "SERE0008",
    );
  });

  it("streams long texts", () => {
    const long = "x".repeat(40000);
    const tree = new DOMParser().parseFromString(
      `<r><a>${long}</a><b>${long}</b></r>`,
      "text/xml",
    );
    assert.equal(serialize(tree, { method: "text" }).length, 80000);
    const chunks = [
      ...serializeChunks([tree, tree], { method: "text" }, { chunkSize: 100 }),
    ];
    assert.equal(chunks.length, 4);
  });
});

describe("the json output method", () => {
  const json = (expr, params) => run(expr, { method: "json", ...params });

  it("writes maps, arrays and atomic values", () => {
    assert.equal(json("()"), "null");
    assert.equal(
      json("[1, 2.5, 1e3, true(), 'a\"\\/', xs:date('2011-04-06'), ()]"),
      '[1,2.5,1000,true,"a\\"\\\\\\/","2011-04-06",null]',
    );
    assert.equal(json("map { 'a': map {}, 'b': [] }"), '{"a":{},"b":[]}');
    assert.equal(
      json("codepoints-to-string((10, 13, 9, 128))"),
      '"\\n\\r\\t\\u0080"',
    );
    assert.equal(
      json("codepoints-to-string((119070, 233))", { encoding: "US-ASCII" }),
      '"\\uD834\\uDD1E\\u00E9"',
    );
    assert.equal(json("'a$'", { useCharacterMaps: { $: "£" } }), '"a£"');
    assert.equal(json("'é€'", { encoding: "ISO-8859-1" }), '"é\\u20AC"');
  });

  it("indents", () => {
    assert.equal(
      json("map { 'a': [1, 2] }", { indent: true }),
      '{\n  "a": [\n    1,\n    2\n  ]\n}',
    );
  });

  it("writes nodes with json-node-output-method", () => {
    assert.equal(
      json("[/r/e, /r/comment()]"),
      '["<e>x<f>y<\\/f>&amp;<\\/e>","<!--c-->"]',
    );
    assert.equal(json("/r/e", { jsonNodeOutputMethod: "text" }), '"xy&"');
  });

  it("reports what JSON cannot hold", () => {
    assert.equal(
      code(() => json("(1, 2)")),
      "SERE0023",
    );
    assert.equal(
      code(() => json("[(1, 2)]")),
      "SERE0023",
    );
    assert.equal(
      code(() => json("xs:double('NaN')")),
      "SERE0020",
    );
    assert.equal(
      code(() => json("[xs:float('-INF')]")),
      "SERE0020",
    );
    assert.equal(
      code(() => json("count#1")),
      "SERE0021",
    );
    assert.equal(
      code(() => json("map { 'a': 1, xs:QName('a'): 2 }")),
      "SERE0022",
    );
    assert.equal(
      json("map { 'a': 1, xs:QName('a'): 2 }", { allowDuplicateNames: true }),
      '{"a":1,"a":2}',
    );
  });
});
