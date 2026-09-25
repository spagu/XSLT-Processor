/**
 * Tests for xsl:sort (XSLT 1.0 section 10) and the sort module.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { compareCodePoints, compareNumbers } from "./sort.js";
import { XsltEngine } from "./engine.js";

const { window } = new JSDOM("");
const parseXML = (s) =>
  new window.DOMParser().parseFromString(s, "application/xml");

/**
 * Sort the <v> children of <r> with the given xsl:sort attributes.
 *
 * @param {string[]} values - Text of each <v>
 * @param {string} sortAttributes - Attributes of the xsl:sort element
 * @param {Record<string, string>} [params] - Global parameters
 * @returns {string} Sorted values joined with commas
 */
function sortValues(values, sortAttributes, params = {}) {
  const engine = new XsltEngine();
  engine.importStylesheet(
    parseXML(`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
      <xsl:output method="text"/>
      <xsl:param name="dir" select="'ascending'"/>
      <xsl:param name="type" select="'text'"/>
      <xsl:template match="/">
        <xsl:for-each select="r/v">
          <xsl:sort ${sortAttributes}/>
          <xsl:value-of select="."/><xsl:if test="position() != last()">,</xsl:if>
        </xsl:for-each>
      </xsl:template>
    </xsl:stylesheet>`),
  );
  for (const [name, value] of Object.entries(params)) {
    engine.setParameterValue(name, value);
  }
  const xml = parseXML(`<r>${values.map((v) => `<v>${v}</v>`).join("")}</r>`);
  return engine.transformToString(xml);
}

describe("compareCodePoints", () => {
  it("orders by Unicode code point", () => {
    assert.ok(compareCodePoints("B", "a") < 0);
    assert.ok(compareCodePoints("1", "§") < 0);
    assert.ok(compareCodePoints("ab", "a") > 0);
    assert.ok(compareCodePoints("a", "ab") < 0);
    assert.strictEqual(compareCodePoints("same", "same"), 0);
    assert.strictEqual(compareCodePoints("", ""), 0);
  });

  it("compares astral characters by code point, not UTF-16 unit", () => {
    // U+1F600 (surrogate pair D83D DE00) sorts after U+FFFD by code point
    assert.ok(compareCodePoints("\u{1F600}", "�") > 0);
  });
});

describe("compareNumbers", () => {
  it("puts NaN before every number", () => {
    assert.ok(compareNumbers(NaN, -Infinity) < 0);
    assert.ok(compareNumbers(1, NaN) > 0);
    assert.strictEqual(compareNumbers(NaN, NaN), 0);
    assert.ok(compareNumbers(1, 2) < 0);
    assert.strictEqual(compareNumbers(2, 2), 0);
  });
});

describe("xsl:sort", () => {
  it("sorts text by code point like libxslt (issue #9)", () => {
    assert.strictEqual(
      sortValues(
        ["§112 Science", "100-00 Energy", "b", "B", "a"],
        'select="."',
      ),
      "100-00 Energy,B,a,b,§112 Science",
    );
  });

  it("sorts numbers with NaN first and XPath number() conversion", () => {
    assert.strictEqual(
      sortValues(
        ["10", "x", "9", "12abc", "-1", " 3 "],
        'select="." data-type="number"',
      ),
      "x,12abc,-1, 3 ,9,10",
    );
  });

  it("reverses the whole order for descending, NaN last", () => {
    assert.strictEqual(
      sortValues(
        ["2", "x", "10"],
        'select="." data-type="number" order="descending"',
      ),
      "10,2,x",
    );
  });

  it("evaluates order and data-type as attribute value templates", () => {
    assert.strictEqual(
      sortValues(
        ["2", "10", "1"],
        'select="." order="{$dir}" data-type="{$type}"',
        {
          dir: "descending",
          type: "number",
        },
      ),
      "10,2,1",
    );
  });

  it("uses a collator with case-order", () => {
    assert.strictEqual(
      sortValues(
        ["b", "A", "a", "B"],
        'select="." case-order="upper-first" lang="en"',
      ),
      "A,a,B,b",
    );
    assert.strictEqual(
      sortValues(
        ["b", "A", "a", "B"],
        'select="." case-order="lower-first" lang="en"',
      ),
      "a,A,b,B",
    );
  });

  it("falls back to the default locale for an unknown lang", () => {
    assert.strictEqual(
      sortValues(["b", "a"], 'select="." lang="not a locale!"'),
      "a,b",
    );
  });

  it("keeps the original order for equal keys (stable)", () => {
    const engine = new XsltEngine();
    engine.importStylesheet(
      parseXML(`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:output method="text"/>
        <xsl:template match="/">
          <xsl:for-each select="r/v"><xsl:sort select="@k"/><xsl:value-of select="."/></xsl:for-each>
        </xsl:template>
      </xsl:stylesheet>`),
    );
    const xml = parseXML(
      `<r><v k="b">1</v><v k="a">2</v><v k="b">3</v><v k="a">4</v></r>`,
    );
    assert.strictEqual(engine.transformToString(xml), "2413");
  });

  it("evaluates keys with position() of the unsorted list", () => {
    assert.strictEqual(
      sortValues(
        ["a", "b", "c"],
        'select="position()" data-type="number" order="descending"',
      ),
      "c,b,a",
    );
  });

  it("applies several keys in order", () => {
    const engine = new XsltEngine();
    engine.importStylesheet(
      parseXML(`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:output method="text"/>
        <xsl:template match="/">
          <xsl:apply-templates select="r/v">
            <xsl:sort select="@valid" order="descending"/>
            <xsl:sort select="."/>
          </xsl:apply-templates>
        </xsl:template>
        <xsl:template match="v"><xsl:value-of select="."/>;</xsl:template>
      </xsl:stylesheet>`),
    );
    const xml = parseXML(
      `<r><v valid="0">b</v><v valid="1">z</v><v valid="0">a</v><v valid="1">y</v></r>`,
    );
    assert.strictEqual(engine.transformToString(xml), "y;z;a;b;");
  });
});
