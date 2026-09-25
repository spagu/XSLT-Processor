/**
 * Regression tests for copying source nodes (xsl:copy-of, XSLT 1.0 section
 * 11.3; xsl:copy, section 7.5) and for text runs: adjacent text and CDATA
 * nodes form one XPath text node everywhere the engine reads source text.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { run, stylesheet, parseXML, dom } from "./harness.test.js";
import { cloneNode, copyOf } from "./copying.js";
import { WhitespaceFilter, stripWhitespaceNodes } from "./whitespace.js";

const xml = (body) => stylesheet(body, "xml");

describe("xsl:copy-of", () => {
  it("copies the children of the root node", () => {
    const xsl = xml(
      `<xsl:template match="/"><xsl:copy-of select="/"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl, "<d a='1'>t</d>"), '<d a="1">t</d>');
  });

  it("copies the root node when selected as the context node", () => {
    const xsl = xml(
      `<xsl:template match="/"><o><xsl:copy-of select="."/></o></xsl:template>`,
    );
    assert.strictEqual(run(xsl, "<d/>"), "<o><d/></o>");
  });

  it("adds copied attributes to the current result element", () => {
    const xsl = xml(
      `<xsl:template match="d"><xsl:copy><xsl:copy-of select="@*"/></xsl:copy></xsl:template>`,
    );
    assert.strictEqual(run(xsl, "<d a='1' b='2'/>"), '<d a="1" b="2"/>');
  });

  it("keeps the namespace of copied attributes", () => {
    const xsl = xml(
      `<xsl:template match="/"><o><xsl:copy-of select="*/*"/></o></xsl:template>`,
    );
    assert.strictEqual(
      run(xsl, `<r xmlns:xl="urn:xl"><e xl:href="h"/></r>`),
      '<o><e xmlns:xl="urn:xl" xl:href="h"/></o>',
    );
  });

  it("keeps the namespace of an attribute copied on its own", () => {
    const xsl = xml(
      `<xsl:template match="/"><o><xsl:copy-of select="*/@*"/></o></xsl:template>`,
    );
    assert.strictEqual(
      run(xsl, `<r xmlns:xl="urn:xl" xl:href="h"/>`),
      '<o xmlns:xl="urn:xl" xl:href="h"/>',
    );
  });

  it("copies namespace declarations of copied elements", () => {
    const xsl = xml(
      `<xsl:template match="/"><xsl:copy-of select="*"/></xsl:template>`,
    );
    assert.strictEqual(
      run(xsl, `<r xmlns:q="urn:q"><e/></r>`),
      '<r xmlns:q="urn:q"><e/></r>',
    );
  });

  it("ignores an attribute copied after child nodes", () => {
    const xsl = xml(
      `<xsl:template match="/"><o><c/><xsl:copy-of select="*/@a"/></o></xsl:template>`,
    );
    assert.strictEqual(run(xsl, "<d a='1'/>"), "<o><c/></o>");
  });

  it("writes non node-set values as text", () => {
    const xsl = xml(
      `<xsl:template match="/"><o><xsl:copy-of select="1 + 1"/><xsl:copy-of select="''"/><xsl:copy-of select="1 = 1"/></o></xsl:template>`,
    );
    assert.strictEqual(run(xsl), "<o>2true</o>");
  });

  it("copies a result tree fragment, comments and processing instructions", () => {
    const xsl = xml(
      `<xsl:variable name="v"><x>1</x><xsl:comment>c</xsl:comment></xsl:variable>
       <xsl:template match="/"><o><xsl:copy-of select="$v"/><xsl:copy-of select="//processing-instruction()"/></o></xsl:template>`,
    );
    assert.strictEqual(
      run(xsl, "<d><?p data?></d>"),
      "<o><x>1</x><!--c--><?p data?></o>",
    );
  });
});

describe("xsl:copy", () => {
  it("copies namespaced attributes with their namespace", () => {
    const xsl = xml(
      `<xsl:template match="/"><o><xsl:for-each select="*/@*"><xsl:copy/></xsl:for-each></o></xsl:template>`,
    );
    assert.strictEqual(
      run(xsl, `<r xmlns:xl="urn:xl" xl:href="h" a="1"/>`),
      '<o xmlns:xl="urn:xl" xl:href="h" a="1"/>',
    );
  });

  it("copies the namespace declarations of an element", () => {
    const xsl = xml(`<xsl:template match="*"><xsl:copy/></xsl:template>`);
    assert.strictEqual(
      run(xsl, `<r xmlns:q="urn:q"/>`),
      '<r xmlns:q="urn:q"/>',
    );
  });
});

describe("text runs (XPath data model 5.7)", () => {
  const source = "<r>a<![CDATA[b]]>c</r>";

  it("applies templates to a text run once", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><xsl:apply-templates/></xsl:template>`,
    );
    assert.strictEqual(run(xsl, source), "abc");
  });

  it("gives a text() template the whole run through the built-in rule", () => {
    const xsl = stylesheet(
      `<xsl:template match="text()">[<xsl:value-of select="."/>]</xsl:template>`,
    );
    assert.strictEqual(run(xsl, source), "[abc]");
  });

  it("copies a text run with copy-of and copy", () => {
    const copyOfXsl = stylesheet(
      `<xsl:template match="/"><xsl:copy-of select="r/text()"/></xsl:template>`,
    );
    assert.strictEqual(run(copyOfXsl, source), "abc");
    const copyXsl = stylesheet(
      `<xsl:template match="/"><xsl:for-each select="r/text()"><xsl:copy/></xsl:for-each></xsl:template>`,
    );
    assert.strictEqual(run(copyXsl, source), "abc");
  });

  it("copies an element containing a text run as one text node", () => {
    const xsl = xml(
      `<xsl:template match="/"><xsl:copy-of select="r"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl, source), "<r>abc</r>");
  });

  it("strips a whitespace-only run as a unit and keeps mixed runs", () => {
    const doc = parseXML(
      "<r><a> <![CDATA[ ]]> </a><b>a<![CDATA[ ]]>b</b><c><![CDATA[ ]]>x</c></r>",
    );
    const stripped = stripWhitespaceNodes(
      doc,
      new WhitespaceFilter(["*"]),
      doc.implementation.createDocument(null, null, null),
    );
    const [a, b, c] = stripped.documentElement.childNodes;
    assert.strictEqual(a.childNodes.length, 0);
    assert.strictEqual(b.textContent, "a b");
    assert.strictEqual(c.textContent, " x");
  });

  it("treats a stylesheet text run as one text node", () => {
    const xsl = stylesheet(
      `<xsl:template match="/">a<![CDATA[ ]]>b<xsl:text>|</xsl:text><![CDATA[ ]]> </xsl:template>`,
    );
    assert.strictEqual(run(xsl), "a b|");
  });
});

describe("copying module", () => {
  const doc = dom.window.document.implementation.createDocument(
    null,
    null,
    null,
  );
  const stringValue = (node) => node.nodeValue;

  it("returns null for nodes that cannot be children", () => {
    assert.strictEqual(
      cloneNode(parseXML("<r/>").createAttribute("a"), doc, stringValue),
      null,
    );
  });

  it("skips null values and namespace declaration attributes", () => {
    const output = doc.createElement("o");
    const host = {
      doc,
      stringValue,
      toString: String,
      canAddAttribute: () => true,
    };
    copyOf(null, output, host);
    copyOf(undefined, output, host);
    const source = parseXML(`<r xmlns:q="urn:q"/>`).documentElement;
    copyOf(Array.from(source.attributes), output, host);
    assert.strictEqual(output.attributes.length, 0);
    assert.strictEqual(output.childNodes.length, 0);
  });
});
