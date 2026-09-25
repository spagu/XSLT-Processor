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
