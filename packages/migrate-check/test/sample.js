/**
 * Shared test helper: the sample project of the docs (two scripts, one
 * page, three rendered XML documents, four stylesheets, a package.json).
 * Holds no tests of its own.
 */

const XSL = 'xmlns:xsl="http://www.w3.org/1999/XSL/Transform"';

/** A rendered XML document pointing at a stylesheet in ../styles. */
const rendered = (sheet, body) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet type="text/xsl" href="../styles/${sheet}"?>\n${body}\n`;

/** An XSLT 1.0 stylesheet with HTML output and one template for "/". */
const sheet1 = (body) =>
  `<?xml version="1.0"?>\n<xsl:stylesheet version="1.0" ${XSL}>\n  <xsl:output method="html"/>\n  <xsl:template match="/">\n    ${body}\n  </xsl:template>\n</xsl:stylesheet>\n`;

/** The sample project, relative path to content. */
export const SAMPLE_PROJECT = Object.freeze({
  "package.json":
    '{\n  "name": "sample",\n  "version": "1.0.0",\n  "private": true,\n  "dependencies": {\n    "express": "^4.21.0"\n  }\n}\n',
  "src/report.js":
    '/**\n * Renders the report page.\n */\n\nimport { load } from "./load.js";\n\nexport async function render() {\n  const processor = new XSLTProcessor();\n  processor.importStylesheet(await load("report.xsl"));\n  return processor.transformToFragment(await load("data.xml"), document);\n}\n',
  "src/legacy.js":
    '"use strict";\r\nconst { readXml } = require("./xml");\r\n\r\nmodule.exports = function transform(xml, xsl) {\r\n  const processor = new XSLTProcessor();\r\n  processor.importStylesheet(xsl);\r\n  return processor.transformToDocument(xml);\r\n};\r\n',
  "public/index.html":
    '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8">\n    <title>Orders</title>\n  </head>\n  <body>\n    <div id="out"></div>\n    <script>\n      const processor = new XSLTProcessor();\n    </script>\n  </body>\n</html>\n',
  "public/invoice.xml": rendered(
    "invoice.xsl",
    '<invoice>\n  <line price="100"/>\n  <line price="23"/>\n</invoice>',
  ),
  "public/orders.xml": rendered(
    "orders.xsl",
    '<orders>\n  <order id="1">Tea</order>\n  <order id="2">Milk</order>\n</orders>',
  ),
  "public/catalog.xml": rendered(
    "catalog.xsl",
    "<catalog>\n  <book>XSLT</book>\n</catalog>",
  ),
  "styles/invoice.xsl": sheet1(
    "<html><body><p>Total: <total><xsl:value-of select=\"format-number(sum(//line/@price), '0.00')\"/></total></p></body></html>",
  ),
  "styles/orders.xsl": sheet1(
    '<html><body><ul><xsl:for-each select="//order"><li id="o{@id}"><xsl:value-of select="."/></li></xsl:for-each></ul></body></html>',
  ),
  "styles/catalog.xsl": sheet1(
    '<html><body><h1>Catalog</h1><xsl:apply-templates select="//book"/></body></html>',
  ),
  "styles/modern.xsl": `<?xml version="1.0"?>\n<xsl:stylesheet version="2.0" ${XSL}>\n  <xsl:template match="/">\n    <out><xsl:value-of select="upper-case('x')"/></out>\n  </xsl:template>\n</xsl:stylesheet>\n`,
});
