// The playground's XPath 3.1 mode: every example run with @tradik/xslt3
// under jsdom, the result descriptions, the variable and namespace lines,
// and the mode selection.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import * as lib from "../../packages/xslt3/src/index.js";
import {
  evaluate,
  parseBindings,
  variableValue,
} from "../templates/xslt-site/js/xpath-core.js";
import {
  describeItem,
  nodeType,
  nodeValue,
} from "../templates/xslt-site/js/xpath-items.js";
import { xpathPresets } from "../templates/xslt-site/js/xpath-presets.js";

const { DOMParser, XMLSerializer } = new JSDOM("").window;
const env = { lib, DOMParser, XMLSerializer };
const preset = (id) => xpathPresets.find((p) => p.id === id);
/** Run an example and return its items as "type value" strings. */
const run = (id) => {
  const result = evaluate(preset(id), env);
  assert.equal(result.error, null, `${id}: ${JSON.stringify(result.error)}`);
  return result.items.map(({ type, value }) => `${type} ${value}`);
};
/** Evaluate an expression without a document. */
const xp = (expression, extra = {}) =>
  evaluate({ xml: "", expression, ...extra }, env);

describe("XPath examples", () => {
  it("has unique ids and labels", () => {
    assert.equal(new Set(xpathPresets.map((p) => p.id)).size, 9);
    assert.equal(new Set(xpathPresets.map((p) => p.label)).size, 9);
  });

  it("flwor: revenue per customer with distinct-values and sum", () => {
    assert.deepEqual(run("flwor"), [
      "xs:string Ana Silva: 130.4 from 2 orders",
      "xs:string Ben Okafor: 126 from 1 order",
      "xs:string Chen Wei: 31.5 from 1 order",
    ]);
  });

  it("sort: the $top largest orders as elements", () => {
    const items = evaluate(preset("sort"), env).items;
    assert.deepEqual(
      items.map((item) => item.type),
      ["element(order)", "element(order)"],
    );
    assert.match(items[0].value, /^<order id="1002"/);
    assert.match(items[1].value, /^<order id="1003"/);
  });

  it("maps: a merged map, a lookup, a size and an array lookup", () => {
    const items = run("maps");
    assert.match(items[0], /^map map \{\n {2}"Ana Silva": \("TEA-GRN-100", /);
    assert.match(items[0], /"Chen Wei": "TEA-OOL-250"\n\}$/);
    assert.deepEqual(items.slice(1), [
      "xs:string TEA-GRN-100",
      "xs:string CUP-CER-02",
      "xs:string POT-IRN-08",
      "xs:string TEA-GRN-100",
      "xs:integer 3",
      "xs:string second",
    ]);
  });

  it("strings: tokenize and string-join", () => {
    assert.deepEqual(run("strings"), [
      "xs:string 1001: PRIORITY | GIFT",
      "xs:string 1002: WHOLESALE",
      "xs:string 1003: GIFT",
      "xs:string 1004: PRIORITY",
    ]);
  });

  it("regex: matches and replace with groups", () => {
    assert.deepEqual(run("regex"), [
      "xs:string TEA-GRN-100 = 100 g of tea GRN",
      "xs:string TEA-BLK-500 = 500 g of tea BLK",
      "xs:string TEA-OOL-250 = 250 g of tea OOL",
    ]);
  });

  it("format: format-date and format-number", () => {
    assert.deepEqual(run("format"), [
      "xs:string Saturday, 14th March 2026: 37.00",
      "xs:string Thursday, 2nd April 2026: 126.00",
      "xs:string Wednesday, 20th May 2026: 93.40",
      "xs:string Sunday, 7th June 2026: 31.50",
    ]);
  });

  it("arrow: a => chain", () => {
    assert.deepEqual(run("arrow"), ["xs:string CUP, POT, TEA"]);
  });

  it("fold: fold-left builds a map of totals", () => {
    assert.deepEqual(run("fold"), [
      'map map {\n  "Ana Silva": 130.4,\n  "Ben Okafor": 126,\n  "Chen Wei": 31.5\n}',
    ]);
  });

  it("namespaces: a prefix and a string variable", () => {
    assert.deepEqual(run("namespaces"), [
      'map map {\n  "title": "1.2.0: xsl:number and EXSLT dates",\n  "updated": xs:dateTime("2026-09-30T10:00:00Z")\n}',
    ]);
  });
});

describe("XPath results", () => {
  it("describes atomic values by their string value", () => {
    const { items } = xp(
      "1, 2.5, 1e6, true(), 'a', xs:date('2026-01-02'), xs:QName('xs:int')",
    );
    assert.deepEqual(
      items.map(({ type, value }) => `${type} ${value}`),
      [
        "xs:integer 1",
        "xs:decimal 2.5",
        "xs:double 1.0E6",
        "xs:boolean true",
        "xs:string a",
        "xs:date 2026-01-02",
        "xs:QName xs:int",
      ],
    );
  });

  it("writes maps and arrays in XPath syntax", () => {
    const { items } = xp(
      "map {}, [], [1, (), (true(), 'x'), xs:untypedAtomic('u'), 2.5e0], [[1], map { 1: xs:time('10:00:00') }]",
    );
    assert.deepEqual(
      items.map((item) => item.value),
      [
        "map {}",
        "[]",
        '[1, (), (true(), "x"), "u", 2.5]',
        '[[1], map { 1: xs:time("10:00:00") }]',
      ],
    );
    assert.deepEqual(
      items.map((item) => item.type),
      ["map", "array", "array", "array"],
    );
  });

  it("names function items", () => {
    const { items } = xp(
      "sum#1, function($a, $b) { $a }, [function() { 1 }], map { 'f': concat#3 }",
    );
    assert.deepEqual(items, [
      { type: "function", value: "fn:sum#1" },
      { type: "function", value: "function#2" },
      { type: "array", value: "[function#0]" },
      { type: "map", value: 'map { "f": fn:concat#3 }' },
    ]);
  });

  it("serializes nodes of every kind", () => {
    const xml =
      '<?xml version="1.0"?><!--c--><?pi data?><r xmlns:p="urn:p" a="1"><p:x>t</p:x><![CDATA[cd]]></r>';
    const { items } = evaluate(
      {
        xml,
        expression:
          "/, /comment(), /processing-instruction(), /r/@a, //p:x, //p:x/text(), /r/text(), /r/namespace::p, /r/namespace::xml, [/r/@a]",
        namespaces: "p=urn:p",
      },
      env,
    );
    assert.deepEqual(
      items.map((item) => item.type),
      [
        "document-node()",
        "comment()",
        "processing-instruction(pi)",
        "attribute(a)",
        "element(p:x)",
        "text()",
        "text()",
        "namespace-node()",
        "namespace-node()",
        "array",
      ],
    );
    assert.match(items[0].value, /<r xmlns:p="urn:p" a="1">/);
    assert.equal(items[1].value, "<!--c-->");
    assert.equal(items[2].value, "<?pi data?>");
    assert.equal(items[3].value, 'a="1"');
    assert.equal(items[4].value, '<p:x xmlns:p="urn:p">t</p:x>');
    assert.equal(items[5].value, "t");
    assert.equal(items[6].value, "cd");
    assert.equal(items[7].value, 'xmlns:p="urn:p"');
    assert.equal(
      items[8].value,
      'xmlns:xml="http://www.w3.org/XML/1998/namespace"',
    );
    assert.equal(items[9].value, '[a="1"]');
  });

  it("names node types directly", () => {
    assert.equal(nodeType({ nodeType: 4 }), "text()");
    assert.equal(nodeType({ nodeType: 13 }), "namespace-node()");
    assert.equal(nodeValue({ nodeType: 4, data: "x" }), "x");
    assert.equal(
      nodeValue({ nodeType: 13, nodeName: "", nodeValue: "urn:d" }),
      'xmlns="urn:d"',
    );
  });

  it("describes items given directly", () => {
    const [item] = lib.evaluateXPath("42", null);
    assert.deepEqual(describeItem(item, { lib }), {
      type: "xs:integer",
      value: "42",
    });
  });

  it("returns an empty sequence as no items", () => {
    assert.deepEqual(xp("()").items, []);
  });

  it("times the evaluation with the given clock", () => {
    let tick = 0;
    const result = evaluate(
      { xml: "", expression: "1" },
      { ...env, now: () => (tick += 4) },
    );
    assert.equal(result.ms, 4);
  });
});

describe("XPath errors", () => {
  it("reports static and dynamic errors with their code", () => {
    assert.deepEqual(xp("1 +").error.code, "XPST0003");
    assert.match(xp("1 +").error.message, /^Expected an expression/);
    assert.deepEqual(xp("$nope").error.code, "XPST0008");
    assert.deepEqual(xp("1 div 0").error.code, "FOAR0001");
    assert.equal(xp("1 +").items, null);
  });

  it("reports malformed XML", () => {
    const result = evaluate({ xml: "<a>", expression: "1" }, env);
    assert.equal(result.error.code, null);
    assert.match(result.error.message, /^XML source: /);
  });

  it("reports malformed variable and namespace lines", () => {
    assert.equal(
      xp("1", { variables: "a=1\nnot a binding" }).error.message,
      "Variables, line 2: expected name=value",
    );
    assert.equal(
      xp("1", { namespaces: "=urn:x" }).error.message,
      "Namespaces, line 1: expected name=value",
    );
  });

  it("reports errors without a code as they are", () => {
    const broken = {
      evaluateXPath() {
        throw new Error("no code");
      },
    };
    const result = evaluate(
      { xml: "", expression: "1" },
      { ...env, lib: broken },
    );
    assert.deepEqual(result.error, { code: null, message: "no code" });
  });
});

describe("XPath variables and namespaces", () => {
  it("parses name=value lines, skipping blanks and comments", () => {
    assert.deepEqual(
      parseBindings("# note\n\n $a = 1 \r\nb= x = y", "Variables"),
      {
        bindings: [
          { name: "a", value: "1" },
          { name: "b", value: "x = y" },
        ],
        error: null,
      },
    );
  });

  it("types variable values", () => {
    assert.equal(variableValue("42"), 42n);
    assert.equal(variableValue("-7"), -7n);
    assert.equal(variableValue("2.5"), 2.5);
    assert.equal(variableValue(".5e1"), 5);
    assert.equal(variableValue("'42'"), "42");
    assert.equal(variableValue('"a b"'), "a b");
    assert.equal(variableValue("text"), "text");
  });

  it("passes typed variables to the expression", () => {
    const { items } = xp("$n + 1, $d * 2, $s || '!'", {
      variables: "n=41\nd=1.25\ns='x'",
    });
    assert.deepEqual(
      items.map(({ type, value }) => `${type} ${value}`),
      ["xs:integer 42", "xs:double 2.5", "xs:string x!"],
    );
  });
});
