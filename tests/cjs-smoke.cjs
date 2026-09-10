/**
 * CommonJS smoke test.
 *
 * Replicates the Node.js flow reported by consumers of the package: require the
 * CommonJS bundle, set up a DOM with jsdom, run a transformation and print the
 * serialized result. Executed from `src/index.test.js` in a child process so the
 * bundle is exercised exactly as an npm consumer would use it.
 */

"use strict";

const { JSDOM } = require("jsdom");
const { XSLTProcessor, VERSION } = require("../dist/xslt-processor.cjs");

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  contentType: "text/html",
});

global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;
global.XMLSerializer = dom.window.XMLSerializer;

const parser = new dom.window.DOMParser();
const serializer = new dom.window.XMLSerializer();
const parse = (xml) => parser.parseFromString(xml, "application/xml");

const stylesheet = parse(`<?xml version="1.0"?>
  <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
    <xsl:key name="byType" match="item" use="@type"/>
    <xsl:template match="/">
      <report>
        <total><xsl:value-of select="format-number(sum(//item/@price),'#,##0.00')"/></total>
        <grouped><xsl:value-of select="count(key('byType','a'))"/></grouped>
        <external><xsl:value-of select="document('rates.xml')/rates/rate"/></external>
      </report>
    </xsl:template>
  </xsl:stylesheet>`);

const source = parse(
  '<catalog><item type="a" price="1200.5"/><item type="a" price="34"/><item type="b" price="0.5"/></catalog>',
);

const processor = new XSLTProcessor();
processor.setDocumentLoader((uri) =>
  uri === "rates.xml" ? "<rates><rate>1.09</rate></rates>" : null,
);
processor.importStylesheet(stylesheet);

const fragment = processor.transformToFragment(source, dom.window.document);

process.stdout.write(
  `${VERSION}|${serializer.serializeToString(fragment.firstChild)}`,
);
