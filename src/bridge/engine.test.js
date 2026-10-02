/**
 * XSLT 2.0/3.0 stylesheets through the XSLT 1.0 API with
 * `xsltVersion: "auto"`: the asynchronous API, XSLTProcessor.preload() and
 * the synchronous API, parameters, loaders and the result shapes.
 */

import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert";
import {
  domEnvironment,
  findFirst,
  jsdomOnly,
  parseXmlDocument as parseXML,
  serializeNode,
} from "../domEnvironment.test.js";
import { XSLTProcessor } from "../XSLTProcessor.js";
import { XsltEngine } from "../xslt/engine.js";
import { Xslt3Engine } from "./engine.js";

const { window } = domEnvironment;
const XSL = 'xmlns:xsl="http://www.w3.org/1999/XSL/Transform"';
const stylesheet = (body, version = "2.0") =>
  `<xsl:stylesheet version="${version}" ${XSL}>${body}</xsl:stylesheet>`;
const NO_DECLARATION = '<xsl:output omit-xml-declaration="yes"/>';
const grouping = stylesheet(
  `${NO_DECLARATION}<xsl:param name="title" select="'none'"/>` +
    '<xsl:template match="/"><groups title="{$title}">' +
    '<xsl:for-each-group select="//i" group-by="@k">' +
    '<g k="{current-grouping-key()}" n="{count(current-group())}"/>' +
    "</xsl:for-each-group></groups></xsl:template>",
);
const SOURCE = '<r><i k="a"/><i k="b"/><i k="a"/></r>';
const GROUPS = '<g k="a" n="2"/><g k="b" n="1"/>';

/**
 * A processor in auto mode with a stylesheet imported synchronously.
 *
 * @param {string} xsl - Stylesheet markup
 * @param {object} [options] - More options
 * @returns {XSLTProcessor} The processor
 */
function auto(xsl, options = {}) {
  const processor = new XSLTProcessor({ xsltVersion: "auto", ...options });
  processor.importStylesheet(parseXML(xsl), "file:///xsl/main.xsl");
  return processor;
}

before(async () => {
  globalThis.DOMParser = window.DOMParser;
  await XSLTProcessor.preload();
});

after(() => {
  delete globalThis.DOMParser;
});

describe("xsltVersion auto", () => {
  it("runs xsl:for-each-group through the asynchronous API", async () => {
    const processor = new XSLTProcessor({ xsltVersion: "auto" });
    const result = await processor.transformAsync(SOURCE, {
      stylesheet: grouping,
    });
    assert.strictEqual(result, `<groups title="none">${GROUPS}</groups>`);
    assert.ok(processor.engine instanceof Xslt3Engine);
  });

  it("preloads xsl:include and document() for the asynchronous API", async () => {
    const files = {
      "https://x.test/inc.xsl": stylesheet(
        '<xsl:variable name="v" select="2 * 3"/>',
      ),
      "https://x.test/d.xml": "<d>doc</d>",
    };
    const main = stylesheet(
      `${NO_DECLARATION}<xsl:include href="inc.xsl"/><xsl:template match="/">` +
        '<o v="{$v}" d="{document(\'d.xml\')}"/></xsl:template>',
    );
    const processor = new XSLTProcessor({ xsltVersion: "auto" });
    await processor.importStylesheetAsync(main, "https://x.test/main.xsl", {
      loader: async (uri) => files[uri],
    });
    const result = await processor.transformAsync("<r/>");
    assert.strictEqual(result, '<o v="6" d="doc"/>');
  });

  it("runs the synchronous API after XSLTProcessor.preload()", () => {
    const processor = auto(grouping);
    const source = parseXML(SOURCE);
    processor.setParameter(null, "title", "Report");
    assert.strictEqual(processor.getParameter(null, "title"), "Report");
    const expected = `<groups title="Report">${GROUPS}</groups>`;
    assert.strictEqual(processor.transformToString(source), expected);
    const doc = processor.transformToDocument(source);
    assert.strictEqual(serializeNode(doc.documentElement), expected);
    const fragment = processor.transformToFragment(source, parseXML("<o/>"));
    assert.strictEqual(serializeNode(fragment.firstChild), expected);
    processor.removeParameter(null, "title");
    assert.match(processor.transformToString(source), /title="none"/);
    processor.setParameter(null, "title", "Again");
    processor.clearParameters();
    assert.match(processor.transformToString(source), /title="none"/);
    processor.reset();
    assert.throws(() => processor.transformToString(source), /No stylesheet/);
  });

  it("keeps the default 1.0 mode in forwards-compatible processing", () => {
    const fallback = stylesheet(
      `${NO_DECLARATION}<xsl:template match="/"><o>` +
        '<xsl:for-each-group select="//i" group-by="@k">' +
        "<xsl:fallback>1.0</xsl:fallback></xsl:for-each-group></o></xsl:template>",
    );
    const processor = new XSLTProcessor();
    processor.importStylesheet(parseXML(fallback));
    assert.ok(processor.engine instanceof XsltEngine);
    assert.strictEqual(
      processor.transformToString(parseXML(SOURCE)),
      "<o>1.0</o>",
    );
    assert.strictEqual(
      auto(fallback).transformToString(parseXML(SOURCE)),
      "<o/>",
    );
  });

  it("passes parameters set before the import, node lists and names in a namespace", () => {
    const processor = new XSLTProcessor({ xsltVersion: "auto" });
    processor.setParameter("urn:p", "n", 2);
    const source = parseXML(SOURCE);
    processor.setParameter(null, "items", source.getElementsByTagName("i"));
    processor.importStylesheet(
      parseXML(
        stylesheet(
          `${NO_DECLARATION}<xsl:param name="p:n" xmlns:p="urn:p" select="0"/>` +
            '<xsl:param name="items" select="()"/>' +
            '<xsl:template match="/"><o n="{$p:n * 2}" c="{count($items)}" xmlns:p="urn:p"/></xsl:template>',
        ),
      ),
    );
    assert.match(processor.transformToString(source), /n="4" c="3"/);
  });

  it("uses the synchronous loaders, set before or after the import", () => {
    const main = stylesheet(
      `${NO_DECLARATION}<xsl:include href="inc.xsl"/><xsl:template match="/">` +
        '<o v="{$v}" d="{doc(\'d.xml\')}"/></xsl:template>',
    );
    const processor = new XSLTProcessor({ xsltVersion: "auto" });
    processor.setStylesheetLoader(() =>
      stylesheet('<xsl:variable name="v" select="7"/>'),
    );
    processor.importStylesheet(parseXML(main), "file:///xsl/main.xsl");
    processor.setStylesheetLoader(null);
    processor.setDocumentLoader((uri) => `<d>${uri}</d>`);
    assert.strictEqual(
      processor.transformToString(parseXML("<r/>")),
      '<o v="7" d="file:///xsl/d.xml"/>',
    );
  });

  it("logs xsl:message, uses the clock and returns null on errors", () => {
    const log = mock.method(console, "log", () => {});
    const error = mock.method(console, "error", () => {});
    try {
      const processor = auto(
        stylesheet(
          `${NO_DECLARATION}<xsl:param name="fail" select="false()"/>` +
            '<xsl:template match="/"><xsl:message>hello</xsl:message>' +
            '<o y="{year-from-dateTime(current-dateTime())}"/>' +
            '<xsl:if test="$fail"><xsl:sequence select="error()"/></xsl:if></xsl:template>',
        ),
        { clock: () => new Date("2001-02-03T04:05:06Z") },
      );
      const source = parseXML("<r/>");
      assert.strictEqual(processor.transformToString(source), '<o y="2001"/>');
      assert.deepStrictEqual(log.mock.calls[0].arguments, [
        "XSLT Message:",
        "hello",
      ]);
      processor.setParameter(null, "fail", true);
      assert.strictEqual(processor.transformToString(source), null);
      assert.strictEqual(processor.transformToDocument(source), null);
      assert.strictEqual(error.mock.callCount(), 2);
    } finally {
      log.mock.restore();
      error.mock.restore();
    }
  });

  it("streams the serialized result", async () => {
    const processor = auto(grouping);
    const chunks = [];
    for await (const chunk of processor.transformToStream(SOURCE)) {
      chunks.push(chunk);
    }
    assert.strictEqual(
      chunks.join(""),
      `<groups title="none">${GROUPS}</groups>`,
    );
  });

  it("honors output settings changed on the engine (CLI flags)", () => {
    const processor = auto(grouping);
    processor.engine.outputSettings.omitXmlDeclaration = "no";
    processor.engine.outputSettings.method = "text";
    assert.strictEqual(processor.engine.outputSettings.encoding, "UTF-8");
    assert.strictEqual(processor.transformToString(parseXML(SOURCE)), "");
  });
});

describe("xsltVersion auto result shapes", () => {
  const text = stylesheet(
    '<xsl:output method="text"/><xsl:template match="/">a &lt; b</xsl:template>',
  );
  const html = stylesheet(
    '<xsl:template match="/"><html><body><p>x</p></body></html></xsl:template>',
  );

  it("wraps text output in a pre element", () => {
    const doc = auto(text).transformToDocument(parseXML("<r/>"));
    assert.strictEqual(findFirst(doc, "pre").textContent, "a < b");
  });

  it("adds the doctype of xsl:output to xml documents", () => {
    const doc = auto(
      stylesheet(
        '<xsl:output doctype-system="o.dtd"/><xsl:template match="/"><o/></xsl:template>',
      ),
    ).transformToDocument(parseXML("<r/>"));
    assert.strictEqual(doc.doctype.systemId, "o.dtd");
  });

  it("parses html output into an HTML document", () => {
    const doc = auto(html).transformToDocument(parseXML("<r/>"));
    assert.strictEqual(findFirst(doc, "p").textContent, "x");
  });

  it(
    "parses html output into HTML elements of an HTML owner",
    jsdomOnly("HTML documents"),
    () => {
      const owner = window.document;
      const fragment = auto(html).transformToFragment(parseXML("<r/>"), owner);
      assert.ok(
        findFirst(fragment, "p") instanceof window.HTMLParagraphElement,
      );
    },
  );
});
