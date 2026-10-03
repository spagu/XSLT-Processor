/**
 * Package-manager smoke test, CommonJS: require the installed package (the
 * `require` condition of its exports), set up jsdom and run an XSLT 1.0
 * transformation. Copied into a temporary project and run there by
 * scripts/package-managers.mjs; prints "ok <version>" on success.
 */

"use strict";

const { JSDOM } = require("jsdom");
const { XSLTProcessor, VERSION } = require("@tradik/xslt-processor");

const { window } = new JSDOM("<!DOCTYPE html><html><body></body></html>");
const parse = (xml) =>
  new window.DOMParser().parseFromString(xml, "application/xml");

const processor = new XSLTProcessor();
processor.importStylesheet(
  parse(`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
    <xsl:output method="xml" omit-xml-declaration="yes"/>
    <xsl:template match="/"><total><xsl:value-of select="sum(//item/@price)"/></total></xsl:template>
  </xsl:stylesheet>`),
);
const result = processor.transformToString(
  parse('<catalog><item price="2"/><item price="3"/></catalog>'),
);

if (!result.includes("<total>5</total>")) {
  throw new Error(`unexpected CommonJS result: ${result}`);
}
process.stdout.write(`ok ${VERSION}\n`);
