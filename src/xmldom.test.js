/**
 * The library with @xmldom/xmldom used as library users use it: its own
 * DOMParser (which throws on malformed XML), no global `document`, no
 * global DOMParser unless a test installs one. The DOM test matrix
 * (`npm run test:dom`) runs the other suites with xmldom as well; this file
 * keeps the xmldom specific paths covered by the default `npm test`.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { DOMImplementation, DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { XSLTProcessor } from "./index.js";
import { XHTML_NAMESPACE } from "./xslt/resultTree.js";

const parse = (xml) => new DOMParser().parseFromString(xml, "text/xml");
const serialize = (node) => new XMLSerializer().serializeToString(node);

/**
 * A processor for a stylesheet body.
 *
 * @param {string} body - Top-level elements
 * @param {string} [output] - Attributes of xsl:output
 * @returns {XSLTProcessor} The processor
 */
function processorFor(body, output = 'omit-xml-declaration="yes"') {
  const processor = new XSLTProcessor();
  processor.importStylesheet(
    parse(
      `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">` +
        `<xsl:output ${output}/>${body}</xsl:stylesheet>`,
    ),
  );
  return processor;
}

/** Source with an XML declaration and whitespace between top-level nodes. */
const DECLARED =
  '<?xml version="1.0"?>\n<!--c-->\n<r><a x="1">2</a><a>3</a></r>\n';

afterEach(() => {
  delete globalThis.DOMParser;
});

describe("xmldom documents", () => {
  it("has no global document in these tests", () => {
    assert.strictEqual(typeof globalThis.document, "undefined");
  });

  it("ignores the XML declaration and top-level whitespace on every axis", () => {
    const processor = processorFor(
      `<xsl:output method="text"/><xsl:template match="/">` +
        `<xsl:value-of select="concat(count(/node()), count(//node()), count(/r/preceding-sibling::node()), count(/comment()/following-sibling::node()), count(//a[2]/preceding::node()), count(/comment()/following::node()), count(/descendant::processing-instruction()), name(/node()[2]))"/>` +
        `</xsl:template>`,
    );
    assert.strictEqual(
      processor.transformToString(parse(DECLARED)),
      "2611350r",
    );
  });

  it("does not copy the XML declaration", () => {
    const processor = processorFor(
      '<xsl:template match="/"><xsl:copy-of select="."/></xsl:template>',
    );
    assert.strictEqual(
      processor.transformToString(parse(DECLARED)),
      '<!--c-->\n<r><a x="1">2</a><a>3</a></r>',
    );
  });

  it("sorts unions of elements and attributes in document order", () => {
    const processor = processorFor(
      '<xsl:template match="/"><o><xsl:for-each select="//a[2] | //@x | //a[1]"><i><xsl:value-of select="."/></i></xsl:for-each></o></xsl:template>',
    );
    assert.strictEqual(
      processor.transformToString(parse(DECLARED)),
      "<o><i>2</i><i>1</i><i>3</i></o>",
    );
  });

  it("copies result tree fragments and strips whitespace", () => {
    const processor = processorFor(
      '<xsl:strip-space elements="*"/><xsl:variable name="v"><x/><xsl:comment>c</xsl:comment></xsl:variable>' +
        '<xsl:template match="/"><o n="{count(r/node())}"><xsl:copy-of select="$v"/><xsl:copy-of select="//processing-instruction()"/></o></xsl:template>',
    );
    assert.strictEqual(
      processor.transformToString(parse("<r> <?p d?> </r>")),
      '<o n="1"><x/><!--c--><?p d?></o>',
    );
  });
});

describe("xmldom results", () => {
  it("builds fragments and documents without a global document", () => {
    const processor = processorFor(
      '<xsl:template match="/"><o/></xsl:template>',
    );
    const owner = new DOMImplementation().createDocument(null, "x", null);
    const fragment = processor.transformToFragment(parse("<r/>"), owner);
    assert.strictEqual(fragment.ownerDocument, owner);
    assert.strictEqual(serialize(fragment), "<o/>");
    const doc = processor.transformToDocument(parse("<r/>"));
    assert.strictEqual(serialize(doc), "<o/>");
  });

  it("sets Document.doctype for doctype-system", () => {
    const processor = processorFor(
      '<xsl:template match="/"><o/></xsl:template>',
      'doctype-system="o.dtd"',
    );
    const doc = processor.transformToDocument(parse("<r/>"));
    assert.strictEqual(doc.doctype.systemId, "o.dtd");
    assert.strictEqual(doc.documentElement.nodeName, "o");
  });

  it("wraps text output in an XHTML page", () => {
    const processor = processorFor(
      '<xsl:template match="/">a &lt; b</xsl:template>',
      'method="text"',
    );
    const doc = processor.transformToDocument(parse("<r/>"));
    assert.strictEqual(doc.doctype.name, "html");
    assert.strictEqual(doc.documentElement.namespaceURI, XHTML_NAMESPACE);
    assert.strictEqual(doc.getElementsByTagName("pre")[0].textContent, "a < b");
  });

  it("keeps the XML result of html output without an HTML parser", () => {
    const processor = processorFor(
      '<xsl:template match="/"><html><body><p>x</p></body></html></xsl:template>',
      'method="html"',
    );
    const doc = processor.transformToDocument(parse("<r/>"));
    assert.notStrictEqual(doc.contentType, "text/html");
    assert.strictEqual(doc.documentElement.localName, "html");
  });

  it("parses html output with a global xmldom DOMParser", () => {
    globalThis.DOMParser = DOMParser;
    const processor = processorFor(
      '<xsl:template match="/"><html><body><p>x<br/>y</p></body></html></xsl:template>',
      'method="html"',
    );
    const doc = processor.transformToDocument(parse("<r/>"));
    assert.strictEqual(doc.contentType, "text/html");
    assert.strictEqual(doc.getElementsByTagName("p")[0].textContent, "xy");
  });

  it("keeps the XML result when the HTML parser reports an error", () => {
    globalThis.DOMParser = class {
      parseFromString() {
        return parse("<parsererror>no</parsererror>");
      }
    };
    const processor = processorFor(
      '<xsl:template match="/"><html/></xsl:template>',
      'method="html"',
    );
    const doc = processor.transformToDocument(parse("<r/>"));
    assert.strictEqual(doc.documentElement.localName, "html");
  });
});

describe("xmldom parse errors", () => {
  it("reports the ParseError of a loaded stylesheet", () => {
    globalThis.DOMParser = DOMParser;
    const processor = new XSLTProcessor();
    processor.setStylesheetLoader(() => "<xsl:stylesheet");
    assert.throws(
      () =>
        processor.importStylesheet(
          parse(
            '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:include href="bad.xsl"/></xsl:stylesheet>',
          ),
          "http://x/main.xsl",
        ),
      /XML parse error/,
    );
  });
});
