import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkBodies } from "../testing.test.js";
import { formatNumbers, parseFormat } from "../runtime/numberFormat.js";

const tree = "<doc><s><t/><t/></s><s><t/><u/><t/></s></doc>";

describe("xsl:number", () => {
  it("formats values", () => {
    checkBodies([
      ['<xsl:number value="3"/>', "3"],
      ['<xsl:number value="1 to 3" format="(a) "/>', "(a.b.c) "],
      ['<xsl:number value="1, 2, 3" format="1.i-A"/>', "1.ii-C"],
      ['<xsl:number value="2.6"/>', "3"],
      [
        '<xsl:number value="1234567" grouping-separator="," grouping-size="3"/>',
        "1,234,567",
      ],
      ['<xsl:number value="2" ordinal="yes"/>', "2nd"],
      ['<xsl:number value="2" format="w" ordinal="no"/>', "two"],
      ['<xsl:number value="12345678901234567890"/>', "12345678901234567890"],
      ['<xsl:number value="1" format="*"/>', "*1*"],
      ['<xsl:number value="-1"/>', "XTDE0980"],
      ["<xsl:number value=\"'x'\"/>", "XTDE0980"],
      ['<xsl:number value="1" level="any"/>', "XTSE0975"],
      ['<xsl:number level="all"/>', "XTSE0020"],
    ]);
  });

  it("gives a string for invalid values in backwards-compatible mode", () => {
    checkBodies([["<xsl:number value=\"'x'\"/>", "NaN"]], { version: "1.0" });
  });

  it("counts nodes", () => {
    checkBodies(
      [
        [
          '<xsl:for-each select="//t">{position()}:<xsl:number/>;</xsl:for-each>',
          "1:1;2:2;3:1;4:2;",
          tree,
        ],
        [
          '<xsl:for-each select="//t"><xsl:number level="multiple" count="s|t"/>;</xsl:for-each>',
          "1.1;1.2;2.1;2.2;",
          tree,
        ],
        [
          '<xsl:for-each select="//t"><xsl:number level="any"/>;</xsl:for-each>',
          "1;2;3;4;",
          tree,
        ],
        [
          '<xsl:for-each select="//t"><xsl:number level="any" from="s"/>;</xsl:for-each>',
          "1;2;1;2;",
          tree,
        ],
        [
          '<xsl:for-each select="//u"><xsl:number level="multiple" count="*" from="s"/>;</xsl:for-each>',
          "2.2;",
          tree,
        ],
        [
          '<xsl:for-each select="//u"><xsl:number count="t"/>;</xsl:for-each>',
          ";",
          tree,
        ],
        [
          '<xsl:for-each select="//u"><xsl:number level="any" count="x"/>;</xsl:for-each>',
          ";",
          tree,
        ],
        ['<xsl:number select="//u"/>', "1", tree],
        [
          '<xsl:for-each select="doc/s[1]/@*, doc/s[1]"><xsl:number/></xsl:for-each>',
          "1",
          tree,
        ],
        [
          '<xsl:for-each select="//t[1]/text()"><xsl:number/></xsl:for-each>',
          "",
        ],
        ['<xsl:number select="//t"/>', "XTTE1000", tree],
        ['<xsl:for-each select="1"><xsl:number/></xsl:for-each>', "XTTE0990"],
      ],
      { attributes: 'expand-text="yes"' },
    );
  });

  it("numbers attributes, text and other nodes", () => {
    checkBodies([
      [
        '<xsl:for-each select="//@a"><xsl:number/></xsl:for-each>',
        "1",
        '<doc><x a="1"/></doc>',
      ],
      [
        '<xsl:for-each select="//text()"><xsl:number/></xsl:for-each>',
        "12",
        "<doc>a<b/>c</doc>",
      ],
      [
        '<xsl:for-each select="//processing-instruction()"><xsl:number/></xsl:for-each>',
        "112",
        "<doc><?p?><?q?><?p?></doc>",
      ],
      [
        '<xsl:for-each select="//b"><xsl:number level="any" count="node()"/>;</xsl:for-each>',
        "4;",
        "<doc><a>t</a><b/></doc>",
      ],
    ]);
  });
});

describe("number format strings", () => {
  it("parse prefix, tokens, separators and suffix", () => {
    assert.deepEqual(parseFormat("[1.a]"), {
      prefix: "[",
      tokens: ["1", "a"],
      separators: ["."],
      suffix: "]",
    });
    assert.equal(formatNumbers([1n, 2n], "", { ordinal: false }), "1.2");
  });
});
