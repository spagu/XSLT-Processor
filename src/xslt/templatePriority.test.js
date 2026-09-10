/**
 * Tests for default template priorities and union pattern handling.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { calculatePriority } from "./templatePriority.js";
import { XsltEngine } from "./engine.js";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
const { window } = dom;
const parseXML = (s) =>
  new window.DOMParser().parseFromString(s, "application/xml");

describe("calculatePriority", () => {
  it("gives -0.5 to node tests and wildcards on both axes", () => {
    for (const p of [
      "*",
      "@*",
      "node()",
      "text()",
      "comment()",
      "processing-instruction()",
      "child::*",
      "attribute::*",
    ]) {
      assert.strictEqual(calculatePriority(p), -0.5, p);
    }
  });

  it("gives -0.25 to prefix wildcards", () => {
    assert.strictEqual(calculatePriority("foo:*"), -0.25);
    assert.strictEqual(calculatePriority("@foo:*"), -0.25);
  });

  it("gives 0 to qualified names and literal processing instructions", () => {
    for (const p of [
      "item",
      "my-element",
      "ns:item",
      "@id",
      "@ns:id",
      "child::item",
      "attribute::id",
      "processing-instruction('x')",
    ]) {
      assert.strictEqual(calculatePriority(p), 0, p);
    }
  });

  it("gives 0.5 to anything else", () => {
    for (const p of ["/root/item", "item[@id]", "a/b", "//x", null, ""]) {
      assert.strictEqual(calculatePriority(p), 0.5, String(p));
    }
  });
});

describe("union match patterns", () => {
  let engine;
  beforeEach(() => {
    engine = new XsltEngine();
  });

  it("registers one template per alternative with its own priority", () => {
    engine.importStylesheet(
      parseXML(`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:template match="@*|node()"><xsl:copy/></xsl:template>
      </xsl:stylesheet>`),
    );
    const matches = engine.templates
      .filter((t) => t.match)
      .map((t) => [t.match, t.priority]);
    assert.deepStrictEqual(matches, [
      ["@*", -0.5],
      ["node()", -0.5],
    ]);
  });

  it("keeps an explicit priority for every alternative", () => {
    engine.importStylesheet(
      parseXML(`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:template match="a|b" priority="7"/>
      </xsl:stylesheet>`),
    );
    assert.deepStrictEqual(
      engine.templates.map((t) => t.priority),
      [7, 7],
    );
  });

  it("lets a named element template win over the identity template", () => {
    engine.importStylesheet(
      parseXML(`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:template match="FOO"><BAR><xsl:apply-templates select="@*|node()"/></BAR></xsl:template>
        <xsl:template match="@*|node()"><xsl:copy><xsl:apply-templates select="@*|node()"/></xsl:copy></xsl:template>
      </xsl:stylesheet>`),
    );
    const result = engine.transformToString(
      parseXML(`<FOO><i k="a">1</i></FOO>`),
    );
    assert.strictEqual(
      result,
      `<?xml version="1.0" encoding="UTF-8"?>\n<BAR><i k="a">1</i></BAR>`,
    );
  });
});

describe("result document creation without a global document", () => {
  const stylesheet = `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
    <xsl:output omit-xml-declaration="yes"/>
    <xsl:template match="/"><out><xsl:value-of select="root"/></out></xsl:template>
  </xsl:stylesheet>`;

  const withoutGlobalDocument = (fn) => {
    const saved = global.document;
    global.document = undefined;
    try {
      return fn();
    } finally {
      global.document = saved;
    }
  };

  it("uses the DOM implementation of the source document", () => {
    const engine = new XsltEngine();
    engine.importStylesheet(parseXML(stylesheet));
    const xml = parseXML("<root>hi</root>");
    const text = withoutGlobalDocument(() => engine.transformToString(xml));
    assert.strictEqual(text, "<out>hi</out>");
    const doc = withoutGlobalDocument(() => engine.transformToDocument(xml));
    assert.strictEqual(doc.documentElement.outerHTML, "<out>hi</out>");
  });

  it("still throws when no reference node is available either", () => {
    const engine = new XsltEngine();
    assert.throws(
      () => withoutGlobalDocument(() => engine.createDocument()),
      /Document creation not available/,
    );
  });
});
