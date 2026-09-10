/**
 * XSLTProcessor Serialization Tests
 *
 * Tests for transformToString on both XSLTProcessor and XsltEngine, covering
 * the xsl:output settings of XSLT 1.0 section 16 end to end.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { XSLTProcessor } from "./XSLTProcessor.js";
import { XsltEngine } from "./xslt/engine.js";

/**
 * Install a JSDOM based DOM implementation into the global scope.
 * @returns {JSDOM} The created JSDOM instance
 */
function setupDOM() {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    contentType: "text/html",
  });

  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
  global.XMLSerializer = dom.window.XMLSerializer;

  return dom;
}

/**
 * Parse an XML string into a Document.
 * @param {string} xmlString - XML source text
 * @returns {Document} Parsed document
 */
function parseXML(xmlString) {
  const parser = new DOMParser();
  return parser.parseFromString(xmlString, "application/xml");
}

/**
 * Build a stylesheet document around a template body.
 * @param {string} output - xsl:output element markup
 * @param {string} body - Template body markup
 * @returns {Document} Parsed stylesheet document
 */
function stylesheet(output, body) {
  return parseXML(`<?xml version="1.0"?>
    <xsl:stylesheet version="1.0"
        xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
      ${output}
      <xsl:template match="/">${body}</xsl:template>
    </xsl:stylesheet>`);
}

/**
 * Create a processor with an imported stylesheet.
 * @param {string} output - xsl:output element markup
 * @param {string} body - Template body markup
 * @returns {XSLTProcessor} Ready to use processor
 */
function processorFor(output, body) {
  const processor = new XSLTProcessor();
  processor.importStylesheet(stylesheet(output, body));
  return processor;
}

describe("XSLTProcessor.transformToString", () => {
  beforeEach(() => {
    setupDOM();
  });

  describe("argument validation", () => {
    it("should throw when source is missing", () => {
      const processor = processorFor("", "<out/>");

      assert.throws(() => processor.transformToString(), TypeError);
    });

    it("should throw when no stylesheet has been imported", () => {
      const processor = new XSLTProcessor();

      assert.throws(
        () => processor.transformToString(parseXML("<root/>")),
        /No stylesheet has been imported/,
      );
    });

    it("should throw for an invalid source node type", () => {
      const processor = processorFor("", "<out/>");
      const text = parseXML("<root/>").createTextNode("x");

      assert.throws(() => processor.transformToString(text), TypeError);
    });

    it("should return null on transformation error", () => {
      const processor = processorFor(
        "",
        '<xsl:message terminate="yes">Force error</xsl:message>',
      );

      assert.strictEqual(
        processor.transformToString(parseXML("<root/>")),
        null,
      );
    });
  });

  describe("xsl:output", () => {
    it("should indent xml output (DesignLiquido #219)", () => {
      const processor = processorFor(
        '<xsl:output method="xml" indent="yes"/>',
        "<BAR><QUX/></BAR>",
      );

      assert.strictEqual(
        processor.transformToString(parseXML("<root/>")),
        '<?xml version="1.0" encoding="UTF-8"?>\n<BAR>\n  <QUX/>\n</BAR>',
      );
    });

    it("should omit the xml declaration on request", () => {
      const processor = processorFor(
        '<xsl:output method="xml" indent="yes" omit-xml-declaration="yes"/>',
        "<BAR><QUX/></BAR>",
      );

      assert.strictEqual(
        processor.transformToString(parseXML("<root/>")),
        "<BAR>\n  <QUX/>\n</BAR>",
      );
    });

    it("should serialize html output with void elements and a doctype", () => {
      const processor = processorFor(
        '<xsl:output method="html" doctype-public="-//W3C//DTD HTML 4.01//EN"' +
          ' doctype-system="http://www.w3.org/TR/html4/strict.dtd"/>',
        "<html><body><br/><p>hi</p></body></html>",
      );

      assert.strictEqual(
        processor.transformToString(parseXML("<root/>")),
        '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" ' +
          '"http://www.w3.org/TR/html4/strict.dtd">\n' +
          "<html><body><br><p>hi</p></body></html>",
      );
    });

    it("should serialize text output", () => {
      const processor = processorFor(
        '<xsl:output method="text"/>',
        '<out>Total: <xsl:value-of select="count(//item)"/></out>',
      );

      assert.strictEqual(
        processor.transformToString(parseXML("<root><item/><item/></root>")),
        "Total: 2",
      );
    });

    it("should wrap cdata-section-elements", () => {
      const processor = processorFor(
        '<xsl:output method="xml" omit-xml-declaration="yes"' +
          ' cdata-section-elements="code"/>',
        "<out><code>a &lt; b</code></out>",
      );

      assert.strictEqual(
        processor.transformToString(parseXML("<root/>")),
        "<out><code><![CDATA[a < b]]></code></out>",
      );
    });

    it("should honor disable-output-escaping on xsl:text", () => {
      const processor = processorFor(
        '<xsl:output method="xml" omit-xml-declaration="yes"/>',
        '<out><xsl:text disable-output-escaping="yes">&lt;b&gt;bold&lt;/b&gt;' +
          "</xsl:text></out>",
      );

      assert.strictEqual(
        processor.transformToString(parseXML("<root/>")),
        "<out><b>bold</b></out>",
      );
    });

    it("should honor disable-output-escaping on xsl:value-of", () => {
      const processor = processorFor(
        '<xsl:output method="xml" omit-xml-declaration="yes"/>',
        '<out><xsl:value-of select="/root/raw"' +
          ' disable-output-escaping="yes"/></out>',
      );

      assert.strictEqual(
        processor.transformToString(
          parseXML("<root><raw>&lt;i&gt;x&lt;/i&gt;</raw></root>"),
        ),
        "<out><i>x</i></out>",
      );
    });

    it("should escape without disable-output-escaping", () => {
      const processor = processorFor(
        '<xsl:output method="xml" omit-xml-declaration="yes"/>',
        '<out><xsl:value-of select="/root/raw"/></out>',
      );

      assert.strictEqual(
        processor.transformToString(
          parseXML("<root><raw>&lt;i&gt;x&lt;/i&gt;</raw></root>"),
        ),
        "<out>&lt;i>x&lt;/i></out>",
      );
    });

    it("should not change transformToDocument", () => {
      const processor = processorFor(
        '<xsl:output method="xml" indent="yes"/>',
        "<BAR><QUX/></BAR>",
      );
      const result = processor.transformToDocument(parseXML("<root/>"));

      assert.strictEqual(result.documentElement.nodeName, "BAR");
      assert.strictEqual(result.documentElement.childNodes.length, 1);
    });
  });
});

describe("XsltEngine.transformToString", () => {
  beforeEach(() => {
    setupDOM();
  });

  it("should serialize using the stylesheet output settings", () => {
    const engine = new XsltEngine();
    engine.importStylesheet(
      stylesheet('<xsl:output method="xml" indent="yes"/>', "<a><b/></a>"),
    );

    assert.strictEqual(
      engine.transformToString(parseXML("<root/>")),
      '<?xml version="1.0" encoding="UTF-8"?>\n<a>\n  <b/>\n</a>',
    );
  });

  it("should keep outputSettings untouched", () => {
    const engine = new XsltEngine();
    engine.importStylesheet(
      stylesheet('<xsl:output method="text"/>', "<a>x</a>"),
    );

    assert.strictEqual(engine.transformToString(parseXML("<root/>")), "x");
    assert.strictEqual(engine.outputSettings.method, "text");
  });
});
