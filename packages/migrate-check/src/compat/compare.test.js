import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { createDomTools } from "./dom.js";
import {
  compareOutputs,
  firstDifference,
  normalizeOutput,
  outputMethod,
  snippet,
} from "./compare.js";
import { describeNode, isCharsetMeta, stepOf } from "./nodes.js";

const tools = createDomTools(JSDOM);
const sheet = (attributes) =>
  `<xsl:stylesheet><xsl:output ${attributes}/></xsl:stylesheet>`;

describe("outputMethod", () => {
  it("reads xsl:output, else looks at the result", () => {
    assert.equal(outputMethod(sheet('method="HTML"'), ""), "html");
    assert.equal(outputMethod(sheet('method="text"'), ""), "text");
    assert.equal(outputMethod(sheet('method="xml"'), "<html/>"), "xml");
    assert.equal(outputMethod(sheet('method="xhtml"'), ""), "xml");
    assert.equal(
      outputMethod(sheet('indent="yes"'), "<!DOCTYPE html>\n<HTML>"),
      "html",
    );
    assert.equal(
      outputMethod("<xsl:stylesheet/>", '<?xml version="1.0"?>\n<html>'),
      "html",
    );
    assert.equal(outputMethod(sheet('method="q:x"'), "<out/>"), "xml");
  });
});

describe("normalizeOutput and snippet", () => {
  it("drops the declaration, CR and outer whitespace", () => {
    assert.equal(
      normalizeOutput('<?xml version="1.0"?>\r\n<a/>\r\n\n'),
      "<a/>",
    );
    assert.equal(snippet("1\n2\n3"), "1\n2\n3");
    assert.equal(snippet("1\n2\n3\n4"), "1\n2\n3\n…");
  });
});

describe("compareOutputs, XML", () => {
  it("ignores attribute order, indentation and the declaration", () => {
    const expected = '<?xml version="1.0"?>\n<r b="2" a="1">\n  <x/>\n</r>\n';
    const actual =
      '<?xml version="1.0" encoding="UTF-8"?><r a="1" b="2"><x></x></r>';
    assert.deepEqual(compareOutputs(expected, actual, "xml", tools), {
      status: "MATCH",
    });
  });

  it("reports the first differing node with its parent", () => {
    const result = compareOutputs(
      "<doc><p>1</p><p><total>123.00</total></p></doc>",
      "<doc><p>1</p><p><total>123</total></p></doc>",
      "xml",
      tools,
    );
    assert.deepEqual(result, {
      status: "DIFFERENT",
      path: "/doc/p[2]/total/text()",
      expected: "<total>123.00</total>",
      actual: "<total>123</total>",
    });
  });

  it("compares fragments, attributes, missing nodes, comments and PIs", () => {
    const diff = (a, b) => compareOutputs(a, b, "xml", tools);
    assert.equal(diff("<a/><b/>", "<a/><b/>").status, "MATCH");
    assert.equal(diff("<a/>text", "<a/>other").expected, "text");
    assert.deepEqual(
      [
        diff("<a x='1'/>", "<a x='2'/>").path,
        diff("<a x='1'/>", "<a x='2'/>").actual,
      ],
      ["/a", '<a x="2"/>'],
    );
    assert.equal(diff("<a><b/></a>", "<a/>").actual, "(nothing)");
    assert.equal(diff("<a/>", "<a><b/></a>").path, "/a/b");
    assert.equal(
      diff("<a><!--x--></a>", "<a><!--y--></a>").path,
      "/a/comment()",
    );
    assert.equal(
      diff("<a><?p x?></a>", "<a><?q x?></a>").path,
      "/a/processing-instruction(p)",
    );
    assert.equal(
      diff('<!DOCTYPE a SYSTEM "a.dtd"><a/>', "<a/>").status,
      "MATCH",
    );
    assert.equal(diff("<a/>", "<b/>").path, "/a");
  });

  it("falls back to lines when a result is not well-formed", () => {
    assert.deepEqual(compareOutputs("<a>", "<b>", "xml", tools), {
      status: "DIFFERENT",
      path: "line 1",
      expected: "<a>",
      actual: "<b>",
    });
  });
});

describe("compareOutputs, HTML and text", () => {
  it("ignores the charset meta libxml2 adds", () => {
    const expected =
      '<html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><title>t</title></head><body><p>x</p></body></html>';
    const actual =
      '<html><head><meta charset="utf-8"><title>t</title></head><body><p>x</p>\n</body></html>';
    assert.deepEqual(compareOutputs(expected, actual, "html", tools), {
      status: "MATCH",
    });
    const different = compareOutputs(
      "<html><body><p>x</p></body></html>",
      "<html><body><p>y</p></body></html>",
      "html",
      tools,
    );
    assert.equal(different.path, "/html/body/p/text()");
    assert.equal(different.expected, "<p>x</p>");
  });

  it("compares text line by line", () => {
    assert.deepEqual(compareOutputs("a  \nb", "a\nb\n", "text", tools), {
      status: "MATCH",
    });
    assert.deepEqual(compareOutputs("a\nb", "a\nc\nd\ne\nf", "text", tools), {
      status: "DIFFERENT",
      path: "line 2",
      expected: "b",
      actual: "c\nd\ne",
    });
    const longer = compareOutputs("a", "a\nb", "text", tools);
    assert.deepEqual(
      [longer.path, longer.expected, longer.actual],
      ["line 2", "(nothing)", "b"],
    );
  });
});

describe("node helpers", () => {
  it("names steps, finds no difference in equal trees and shows nodes", () => {
    const doc = tools.parse("<a><b/><b/>t<!--c--></a>", "xml");
    const root = doc.documentElement.firstChild;
    const [first, second] = root.childNodes;
    assert.equal(stepOf(second, [first, second]), "b[2]");
    assert.equal(firstDifference(root, root, "/a"), null);
    assert.equal(describeNode(null, tools.serialize), "(nothing)");
    assert.equal(
      describeNode(root.lastChild, tools.serialize),
      "<a><b/><b/>t<!--c--></a>",
    );
    const top = tools.parse("<!--c-->", "xml").documentElement.firstChild;
    assert.equal(describeNode(top, tools.serialize), "c");
    assert.equal(isCharsetMeta(first), false);
  });
});
