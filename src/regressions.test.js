/**
 * Regression tests for reported GitHub issues, exercised through the public
 * XSLTProcessor API.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { XSLTProcessor } from "./index.js";

const { window } = new JSDOM("");
const parseXML = (s) =>
  new window.DOMParser().parseFromString(s, "application/xml");

/**
 * Run a stylesheet body against an XML string and return the text output.
 *
 * @param {string} xml - Source document
 * @param {string} body - Top-level stylesheet content
 * @returns {string|null} Serialized result
 */
function run(xml, body) {
  const processor = new XSLTProcessor();
  processor.importStylesheet(
    parseXML(`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
      <xsl:output method="text"/>
      ${body}
    </xsl:stylesheet>`),
  );
  return processor.transformToString(parseXML(xml));
}

describe("issue #9: operator names before a parenthesis", () => {
  const xml = `<userCourses>
    <Course><Licence Valid="1" ShowExpiryWarning="0"/></Course>
    <Course><Licence Valid="1" ShowExpiryWarning="1"/></Course>
  </userCourses>`;

  it("evaluates (a) or (b) in xsl:if", () => {
    const result = run(
      xml,
      `<xsl:template match="/">
        <xsl:if test="(userCourses/Course/Licence[@Valid != '1']) or (userCourses/Course/Licence[@ShowExpiryWarning = '1'])">warn</xsl:if>
      </xsl:template>`,
    );
    assert.strictEqual(result, "warn");
  });

  it("evaluates (a) and (b), div and mod before a parenthesis", () => {
    const result = run(
      xml,
      `<xsl:template match="/">
        <xsl:value-of select="(1 = 1) and (2 = 2)"/>|<xsl:value-of select="(9) div (3)"/>|<xsl:value-of select="(count(//Course)) mod (2)"/>
      </xsl:template>`,
    );
    assert.strictEqual(result, "true|3|0");
  });

  it("keeps working with the forms without parentheses", () => {
    const result = run(
      xml,
      `<xsl:template match="/">
        <xsl:value-of select="count(userCourses/Course/Licence[@Valid != '1' or @ShowExpiryWarning = '1'])"/>
      </xsl:template>`,
    );
    assert.strictEqual(result, "1");
  });
});

describe("large documents", () => {
  it("transforms node-sets larger than the standalone XPath limit", () => {
    const items = Array.from({ length: 12000 }, (_, i) => `<p id="${i}"/>`);
    const result = run(
      `<catalog>${items.join("")}</catalog>`,
      `<xsl:template match="/"><xsl:value-of select="count(//p)"/></xsl:template>`,
    );
    assert.strictEqual(result, "12000");
  });
});

describe("long XPath expressions", () => {
  it("evaluates a 300-term sum inside a stylesheet", () => {
    const sum = Array.from({ length: 300 }, () => "1").join(" + ");
    const result = run(
      "<r/>",
      `<xsl:template match="/"><xsl:value-of select="${sum}"/></xsl:template>`,
    );
    assert.strictEqual(result, "300");
  });
});

describe("top-level elements", () => {
  it("ignores user data elements and unknown XSLT elements at the top level", () => {
    const result = run(
      "<r/>",
      `<my:months xmlns:my="urn:my"><my:m>Jan</my:m></my:months>
       <xsl:unknown-declaration/>
       <xsl:template match="/">
         <xsl:value-of select="document('')/*/*[local-name() = 'months']/*"/>
       </xsl:template>`,
    );
    assert.strictEqual(result, "Jan");
  });
});

describe("issue #11: empty variable-binding elements", () => {
  const body = (content) => `
    <xsl:param name="g"/>
    <xsl:param name="gs">  </xsl:param>
    <xsl:variable name="v"/>
    <xsl:variable name="rtf"><xsl:if test="false()">x</xsl:if></xsl:variable>
    <xsl:template match="/">${content}</xsl:template>
    <xsl:template name="t"><xsl:param name="p"/><xsl:if test="$p">T</xsl:if>-<xsl:value-of select="string-length($p)"/></xsl:template>`;

  it("gives an empty string to params and variables without select or content", () => {
    const result = run(
      "<r/>",
      body(
        `<xsl:if test="$g">G</xsl:if><xsl:if test="$gs">S</xsl:if><xsl:if test="$v">V</xsl:if>|<xsl:value-of select="boolean($g)"/>|<xsl:value-of select="$g = ''"/>`,
      ),
    );
    assert.strictEqual(result, "|false|true");
  });

  it("gives an empty string to template params and empty with-params", () => {
    const result = run(
      "<r/>",
      body(
        `<xsl:call-template name="t"/>,<xsl:call-template name="t"><xsl:with-param name="p"/></xsl:call-template>`,
      ),
    );
    assert.strictEqual(result, "-0,-0");
  });

  it("keeps a variable whose content produces no nodes a (true) result tree fragment", () => {
    const result = run("<r/>", body(`<xsl:if test="$rtf">RTF</xsl:if>`));
    assert.strictEqual(result, "RTF");
  });

  it("still lets setParameter override an empty param", () => {
    const processor = new XSLTProcessor();
    processor.importStylesheet(
      parseXML(`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:output method="text"/><xsl:param name="g"/>
        <xsl:template match="/"><xsl:if test="$g">set:<xsl:value-of select="$g"/></xsl:if></xsl:template>
      </xsl:stylesheet>`),
    );
    processor.setParameter(null, "g", "yes");
    assert.strictEqual(
      processor.transformToString(parseXML("<r/>")),
      "set:yes",
    );
  });
});

describe("XHTML empty elements (issue #11 attachment)", () => {
  it("writes XHTML elements with end tags and void elements with ' />'", () => {
    const processor = new XSLTProcessor();
    processor.importStylesheet(
      parseXML(`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:output method="xml" omit-xml-declaration="yes"
          doctype-public="-//W3C//DTD XHTML 1.0 Strict//EN"
          doctype-system="http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd"/>
        <xsl:template match="/">
          <html xmlns="http://www.w3.org/1999/xhtml"><head><script src="a.js"/><meta charset="UTF-8"/></head><body><div/><br/><x:data xmlns:x="urn:x"/></body></html>
        </xsl:template>
      </xsl:stylesheet>`),
    );
    const out = processor.transformToString(parseXML("<r/>"));
    assert.match(out, /<script src="a.js"><\/script>/);
    assert.match(out, /<meta charset="UTF-8" \/>/);
    assert.match(out, /<div><\/div><br \/>/);
    assert.match(out, /<x:data xmlns:x="urn:x"\/>/);
  });
});
