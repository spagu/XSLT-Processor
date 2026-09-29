// The playground core and its examples, run with the library under jsdom.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import * as lib from "../../src/index.js";
import {
  captureConsole,
  outputMethod,
  parseError,
  previewDocument,
  transform,
} from "../templates/xslt-site/js/playground-core.js";
import { presets } from "../templates/xslt-site/js/presets.js";

const { DOMParser } = new JSDOM("").window;
// The library reports through the global console, which transform() captures.
const env = { lib, DOMParser };
const preset = (id) => presets.find((p) => p.id === id);
const run = (id, params = preset(id).params) =>
  transform({ xml: preset(id).xml, xsl: preset(id).xsl, params }, env);

describe("playground examples", () => {
  it("catalog: sorts, filters by parameter and declares html", () => {
    const result = run("catalog");
    assert.equal(result.method, "html");
    assert.equal(result.declared, true);
    assert.deepEqual(result.messages, []);
    assert.match(result.output, /<h1>Albums under 10\.00<\/h1>/);
    assert.match(result.output, /Hide your heart/);
    assert.doesNotMatch(result.output, /Empire Burlesque/);
    assert.ok(result.output.indexOf("1982") < result.output.indexOf("1988"));
  });

  it("catalog: parameter defaults apply without parameters", () => {
    const result = run("catalog", []);
    assert.match(result.output, /My CD collection/);
    assert.match(result.output, /Empire Burlesque/);
    assert.match(result.output, /5 of\s+5 albums/);
  });

  it("grouping: one heading per department with counts", () => {
    const result = run("grouping");
    assert.equal(result.messages.length, 0);
    const headings = [
      ...result.output.matchAll(/<h2>\s*(\w+)\s*\((\d)\)\s*<\/h2>/g),
    ].map((m) => `${m[1]} ${m[2]}`);
    assert.deepEqual(headings, ["Engineering 3", "Sales 2", "Support 1"]);
  });

  it("exslt: tokenize, node-set, distinct and max", () => {
    const result = run("exslt");
    assert.equal(result.method, "xml");
    assert.match(result.output, /<report largest="63\.2" orders="3">/);
    assert.match(result.output, /<tag name="sale" uses="2"\/>/);
    assert.equal((result.output.match(/<tag /g) ?? []).length, 4);
  });

  it("csv: text output with a parameter", () => {
    const result = run("csv");
    assert.equal(result.method, "text");
    assert.match(
      result.output,
      /^title,artist,price\nEmpire Burlesque,Bob Dylan,10\.90\n/,
    );
  });
});

describe("playground errors and messages", () => {
  const xsl = (body) =>
    `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:template match="/">${body}</xsl:template></xsl:stylesheet>`;

  it("reports malformed XML and stylesheets", () => {
    const bad = transform({ xml: "<a>", xsl: xsl("") }, env);
    assert.equal(bad.output, null);
    assert.match(bad.messages[0].text, /^XML source: /);
    const badXsl = transform({ xml: "<a/>", xsl: "<xsl:stylesheet" }, env);
    assert.match(badXsl.messages[0].text, /^XSLT stylesheet: /);
  });

  it("reports a stylesheet that is not XSLT", () => {
    const result = transform({ xml: "<a/>", xsl: "<not-xslt/>" }, env);
    assert.equal(result.output, null);
    assert.equal(result.messages[0].level, "error");
  });

  it("collects xsl:message output", () => {
    const result = transform(
      { xml: "<a/>", xsl: xsl("<xsl:message>hello</xsl:message><out/>") },
      env,
    );
    assert.deepEqual(result.messages, [{ level: "message", text: "hello" }]);
    assert.match(result.output, /<out\/>/);
  });

  it("reports a terminating message as a failure", () => {
    const result = transform(
      {
        xml: "<a/>",
        xsl: xsl('<xsl:message terminate="yes">stop</xsl:message>'),
      },
      env,
    );
    assert.equal(result.output, null);
    assert.ok(result.messages.some((m) => m.level === "error"));
  });

  it("reports a failure the library did not explain", () => {
    class Silent {
      importStylesheet() {}
      transformToString() {
        return null;
      }
    }
    const result = transform(
      { xml: "<a/>", xsl: "<b/>" },
      { ...env, lib: { XSLTProcessor: Silent } },
    );
    assert.deepEqual(result.messages, [
      { level: "error", text: "The transformation failed." },
    ]);
  });

  it("ignores parameter rows without a name", () => {
    const result = transform(
      { xml: "<a/>", xsl: xsl("<x/>"), params: [{ name: " ", value: "1" }] },
      env,
    );
    assert.match(result.output, /<x\/>/);
  });
});

describe("playground helpers", () => {
  it("detects parse errors", () => {
    const parser = new DOMParser();
    assert.equal(
      parseError(parser.parseFromString("<a/>", "application/xml")),
      null,
    );
    assert.ok(parseError(parser.parseFromString("<a>", "application/xml")));
  });

  it("strips Chrome's wrapper text from parse errors", () => {
    const parser = new DOMParser();
    const chrome = parser.parseFromString(
      "<parsererror>This page contains the following errors:<div>error on line 1</div>Below is a rendering of the page up to the first error.</parsererror>",
      "application/xml",
    );
    assert.equal(parseError(chrome), "error on line 1");
    const empty = parser.parseFromString("<parsererror/>", "application/xml");
    assert.equal(parseError(empty), "Not well-formed XML");
  });

  it("derives the output method", () => {
    assert.deepEqual(outputMethod({ method: "text" }, ""), {
      method: "text",
      declared: true,
    });
    assert.deepEqual(
      outputMethod({}, "<!DOCTYPE html>\n<html><body/></html>"),
      { method: "html", declared: false },
    );
    assert.deepEqual(outputMethod({ method: "auto" }, "<root/>"), {
      method: "xml",
      declared: false,
    });
    assert.deepEqual(
      outputMethod(undefined, '<html xmlns="http://www.w3.org/1999/xhtml"/>'),
      { method: "xml", declared: false },
    );
  });

  it("restores the console after capturing", () => {
    const target = { log: () => "original", warn() {}, error() {} };
    const { value, messages } = captureConsole(target, () => {
      target.warn("careful");
      target.error(new Error("boom"));
      return 42;
    });
    assert.equal(value, 42);
    assert.deepEqual(messages, [
      { level: "warning", text: "careful" },
      { level: "error", text: "boom" },
    ]);
    assert.equal(target.log(), "original");
  });

  it("previews HTML as HTML and everything else as escaped source", () => {
    assert.equal(previewDocument("<p>x</p>", "html"), "<p>x</p>");
    assert.equal(previewDocument("<p>x</p>", "xhtml"), "<p>x</p>");
    assert.match(
      previewDocument("<a>&</a>", "xml"),
      /&lt;a&gt;&amp;&lt;\/a&gt;/,
    );
  });

  it("times the transformation with the given clock", () => {
    let tick = 0;
    const result = transform(
      { xml: "<a/>", xsl: preset("csv").xsl },
      { ...env, now: () => (tick += 5) },
    );
    assert.equal(result.ms, 5);
  });
});
