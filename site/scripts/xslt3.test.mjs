// The playground's XSLT 3.0 mode: every example run with @tradik/xslt3
// under jsdom, xsl:message and xsl:result-document output, errors with their
// code and line, and parameters.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import * as lib from "../../packages/xslt3/src/index.js";
import {
  errorMessage,
  lineHint,
  messageText,
  transform3,
  untypedParams,
} from "../templates/xslt-site/js/xslt3-core.js";
import { xslt3Presets } from "../templates/xslt-site/js/xslt3-presets.js";
import { presets as xslt1Presets } from "../templates/xslt-site/js/presets.js";

const { DOMParser } = new JSDOM("").window;
const env = { lib, DOMParser };
const preset = (id) => xslt3Presets.find((p) => p.id === id);
/** Run an example; it must succeed without errors. */
const run = (id, params = preset(id).params) => {
  const result = transform3({ ...preset(id), params }, env);
  const errors = result.messages.filter((m) => m.level === "error");
  assert.deepEqual(errors, [], id);
  assert.equal(typeof result.output, "string", id);
  return result;
};
/** The text content of every match of a regular expression with one group. */
const all = (text, regex) => [...text.matchAll(regex)].map((m) => m[1]);
const xsl3 = (body, top = "") =>
  `<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">${top}
<xsl:template match="/">
  ${body}
</xsl:template>
</xsl:stylesheet>`;

describe("XSLT 3.0 examples", () => {
  it("has unique ids and labels, each with a stylesheet and XML", () => {
    assert.equal(new Set(xslt3Presets.map((p) => p.id)).size, 12);
    assert.equal(new Set(xslt3Presets.map((p) => p.label)).size, 12);
    for (const p of xslt3Presets) assert.ok(p.xml && p.xsl && p.params);
  });

  it("group-by: totals per city, sorted, with products per city", () => {
    const { output, method, declared } = run("group-by");
    assert.equal(method, "html");
    assert.equal(declared, true);
    assert.deepEqual(all(output, /<h2>([^<]+)<\/h2>/g), [
      "Gdańsk: 93.40",
      "Kraków: 75.00",
      "Wrocław: 31.50",
    ]);
    assert.match(output, /<li>Green tea × 2<\/li>/);
  });

  it("group-adjacent: neighbouring items become one list", () => {
    const { output } = run("group-adjacent");
    assert.equal((output.match(/<ul>/g) ?? []).length, 2);
    assert.equal((output.match(/<p>/g) ?? []).length, 3);
    assert.match(output, /<li>two minutes\.<\/li>\s*<\/ul>\s*<p>Black tea/);
  });

  it("analyze-string: log fields from regex-group()", () => {
    const { output } = run("analyze-string");
    assert.deepEqual(all(output, /<td>(ERROR|WARN|INFO)<\/td>/g), [
      "INFO",
      "ERROR",
      "WARN",
    ]);
    assert.match(output, /<td>payment<\/td>\s*<td>Card declined/);
    assert.match(output, /Not a log line: malformed entry/);
  });

  it("function: typed parameters, and the rate from the parameter row", () => {
    const { output } = run("function");
    assert.match(output, /<invoice vat-rate="0\.08">/);
    assert.match(output, /<line sku="TEA-GRN-100" gross="20\.52"\/>/);
    assert.match(output, /<total>110\.05<\/total>/);
    assert.match(run("function", []).output, /<total>125\.34<\/total>/);
  });

  it("tvt: text value templates and literal braces", () => {
    const { output, method } = run("tvt");
    assert.equal(method, "text");
    assert.match(output, /Dear Ben Okafor,/);
    assert.match(output, /order 1002 of 2nd April 2026\./);
    assert.match(output, /6 × Black tea, 500 g = 126\.00 EUR/);
    assert.match(output, /ships within 3 working days/);
    assert.match(output, /Template syntax: \{expression\}/);
  });

  it("iterate: a running balance and a closing row", () => {
    const { output } = run("iterate");
    assert.deepEqual(all(output, /<td>(\d+\.\d\d)<\/td>\s*<\/tr>/g), [
      "74.80",
      "1574.80",
      "754.80",
      "689.90",
    ]);
    assert.match(output, /Closing balance<\/th>\s*<th>689\.90<\/th>/);
  });

  it("json: a map with arrays written as JSON", () => {
    const { output, method } = run("json");
    assert.equal(method, "text");
    assert.deepEqual(JSON.parse(output), {
      orders: 3,
      revenue: 256.4,
      customers: [
        { name: "Ana Silva", orders: [1001, 1003] },
        { name: "Ben Okafor", orders: [1002] },
      ],
    });
  });

  it("try: bad values are caught with their error code", () => {
    const { output } = run("try");
    assert.match(output, /<ok sku="TEA-GRN-100">19<\/ok>/);
    assert.match(
      output,
      /<rejected sku="CUP-CER-02" code="err:FORG0001">"18,00" is not a valid xs:decimal<\/rejected>/,
    );
    assert.equal((output.match(/<rejected /g) ?? []).length, 2);
  });

  it("merge: two sorted sources in one stream", () => {
    assert.equal(
      run("merge").output,
      "09:05  Kraków 12, Gdańsk 0\n10:15  Kraków 0, Gdańsk 64.9\n11:40  Kraków 38, Gdańsk 19\n16:20  Kraków 7.5, Gdańsk 0\n",
    );
  });

  it("accumulator: figures numbered across chapters", () => {
    const { output } = run("accumulator");
    assert.deepEqual(all(output, /<p>Figure (\d):/g), ["1", "2", "3"]);
    assert.match(output, /<p>3 figures in total\.<\/p>/);
  });

  it("result-document: two secondary results and a message", () => {
    const { output, secondary, messages } = run("result-document");
    assert.match(output, /3 orders exported/);
    assert.deepEqual(
      secondary.map(({ href, method }) => `${href} ${method}`),
      ["orders.csv text", "summary.json text"],
    );
    assert.match(
      secondary[0].output,
      /^id,customer,total\n1001,Ana Silva,37\.00\n/,
    );
    assert.deepEqual(JSON.parse(secondary[1].output), {
      orders: 3,
      revenue: 256.4,
    });
    assert.deepEqual(messages, [
      { level: "message", text: "Wrote orders.csv and summary.json" },
    ]);
  });

  it("muenchian: the 3.0 rewrite groups like the 1.0 stylesheet", () => {
    const heads = (output) =>
      all(output, /<h2>([^<]+)<\/h2>/g).map((h) =>
        h.replace(/\s+/g, " ").trim(),
      );
    const rewritten = heads(run("muenchian").output);
    assert.deepEqual(rewritten, [
      "Engineering (3)",
      "Sales (2)",
      "Support (1)",
    ]);
    const original = xslt1Presets.find((p) => p.id === "grouping");
    const result = transform3(original, env);
    assert.deepEqual(heads(result.output), rewritten);
  });
});

describe("XSLT 3.0 errors", () => {
  it("reports static errors with their code and line", () => {
    const xsl = xsl3("<xsl:bogus/>");
    const { output, messages } = transform3({ xml: "<a/>", xsl }, env);
    assert.equal(output, null);
    assert.deepEqual(messages, [
      {
        level: "error",
        code: "XTSE0010",
        text: "xsl:bogus is not allowed in a sequence constructor (near stylesheet line 3)",
      },
    ]);
  });

  it("reports XPath syntax errors at the expression's line", () => {
    const xsl = xsl3('<xsl:value-of select="1 + "/>');
    const [error] = transform3({ xml: "<a/>", xsl }, env).messages;
    assert.equal(error.code, "XPST0003");
    assert.match(error.text, /\(near stylesheet line 3\)$/);
  });

  it("reports dynamic and type errors", () => {
    const cast = xsl3("<xsl:value-of select=\"xs:integer('a')\"/>").replace(
      "<xsl:stylesheet ",
      '<xsl:stylesheet xmlns:xs="http://www.w3.org/2001/XMLSchema" ',
    );
    assert.equal(
      transform3({ xml: "<a/>", xsl: cast }, env).messages[0].code,
      "FORG0001",
    );
    const type = xsl3(
      '<xsl:value-of select="$n + 1"/>',
      '<xsl:param name="n" as="xs:integer" select="1" xmlns:xs="http://www.w3.org/2001/XMLSchema"/>',
    );
    const typed = transform3(
      { xml: "<a/>", xsl: type, params: [{ name: "n", value: "x" }] },
      env,
    );
    assert.equal(typed.messages[0].code, "XTTE0590");
  });

  it("keeps xsl:message output before a terminating message", () => {
    const xsl = xsl3(
      '<xsl:message>first</xsl:message><xsl:message terminate="yes">stop</xsl:message>',
    );
    const { messages, output } = transform3({ xml: "<a/>", xsl }, env);
    assert.equal(output, null);
    assert.deepEqual(messages.slice(0, 2), [
      { level: "message", text: "first" },
      { level: "message", text: "stop" },
    ]);
    assert.equal(messages[2].code, "XTMM9000");
  });

  it("reports malformed XML and stylesheets", () => {
    const xml = transform3({ xml: "<a>", xsl: xsl3("") }, env);
    assert.match(xml.messages[0].text, /^XML source: /);
    const xsl = transform3({ xml: "<a/>", xsl: "<xsl:stylesheet" }, env);
    assert.match(xsl.messages[0].text, /^XSLT stylesheet: /);
    assert.equal(xsl.output, null);
  });

  it("describes errors without a code as they are", () => {
    assert.deepEqual(errorMessage(new Error("plain"), ""), {
      level: "error",
      code: undefined,
      text: "plain",
    });
  });

  it("finds a line only when the quoted text is on exactly one line", () => {
    const xsl = '<a>\n<xsl:if test="$x"/>\n<xsl:if/>';
    assert.equal(lineHint('Bad expression "$x"', xsl), 2);
    assert.equal(lineHint("xsl:if is wrong", xsl), null);
    assert.equal(lineHint("The variable $x is not declared", xsl), 2);
    assert.equal(lineHint("Nothing quoted", xsl), null);
  });
});

describe("XSLT 3.0 helpers", () => {
  it("reads message documents and sequences", () => {
    const doc = new DOMParser().parseFromString("<m>hi</m>", "application/xml");
    assert.equal(messageText(doc), "hi");
    assert.equal(messageText([doc.documentElement, { value: 42n }]), "hi 42");
  });

  it("passes parameters as xs:untypedAtomic and skips rows without a name", () => {
    const params = untypedParams(
      [
        { name: " rate ", value: "0.5" },
        { name: "", value: "x" },
      ],
      lib,
    );
    assert.deepEqual(Object.keys(params), ["rate"]);
    assert.equal(params.rate[0].type.prefixedName, "xs:untypedAtomic");
    assert.equal(params.rate[0].value, "0.5");
  });

  it("times the transformation with the given clock", () => {
    let tick = 0;
    const result = transform3(
      { xml: "<a/>", xsl: xsl3("<x/>") },
      { ...env, now: () => (tick += 3) },
    );
    assert.equal(result.ms, 3);
    assert.equal(result.method, "xml");
    assert.equal(result.declared, false);
  });
});
