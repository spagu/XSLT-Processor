import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { checkBodies, runBody } from "../testing.test.js";
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

describe("xsl:number start-at and lang", () => {
  it("re-bases the numbers", () => {
    checkBodies([
      ['<xsl:number value="1, 2, 3" start-at="0 10"/>', "0.11.12"],
      ['<xsl:number value="1" start-at="{\'-1\'}" format="1"/>', "-1"],
      ['<xsl:number value="1" start-at="{\'x\'}"/>', "XTDE0030"],
      ['<xsl:number value="1" lang="#####"/>', "XTSE0020"],
      ['<xsl:number value="1" lang="{\'#\'}"/>', "XTDE0030"],
      ['<xsl:number value="1" lang="{\'en\'}"/>', "1"],
      ['<xsl:number value="()"/>', ""],
    ]);
    checkBodies([['<xsl:number value="()"/>', "NaN"]], { version: "1.0" });
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

describe("xsl:number on long lists", () => {
  const items = Array.from(
    { length: 8000 },
    (_, i) => `<i k="${i % 3 === 0 ? 1 : 0}"/>`,
  ).join("");
  const xml = `<r>${items}</r>`;

  it("numbers 8,000 nodes with level=any in linear time", () => {
    const started = performance.now();
    const numbers = runBody(
      '<xsl:for-each select="r/i"><xsl:number level="any" count="i[@k=\'1\']"/>;</xsl:for-each>',
      xml,
    ).split(";");
    const elapsed = performance.now() - started;
    assert.equal(numbers[0], "1");
    assert.equal(numbers[7999], "2667");
    assert.ok(elapsed < 3000, `took ${elapsed} ms`);
  });

  it("numbers 8,000 siblings with level=single in linear time", () => {
    const started = performance.now();
    const numbers = runBody(
      '<xsl:for-each select="r/i"><xsl:number/>;</xsl:for-each>',
      xml,
    ).split(";");
    const elapsed = performance.now() - started;
    assert.equal(numbers[7999], "8000");
    assert.ok(elapsed < 3000, `took ${elapsed} ms`);
  });

  it("reuses numbers only where they stay valid", () => {
    const doc =
      "<doc><s><t/><x/><t/></s><s><t/><t/></s><?t?><t a='1' b='2'/></doc>";
    const each = (select, number) =>
      `<xsl:for-each select="${select}">${number};</xsl:for-each>`;
    checkBodies([
      // reverse document order: no numbered node is met on the way back
      [each("reverse(//t)", '<xsl:number level="any"/>'), "5;4;3;2;1;", doc],
      // a from boundary between two numbered nodes
      [each("//t", '<xsl:number level="any" from="s"/>'), "1;2;1;2;3;", doc],
      // the default count pattern depends on the numbered node
      [
        each(
          "//t | //x | //processing-instruction()",
          '<xsl:number level="any"/>',
        ),
        "1;1;2;3;4;1;5;",
        doc,
      ],
      // attributes are numbered after their element
      [
        each("//t[@a]/@*", '<xsl:number level="any" count="@*|t"/>'),
        "6;6;",
        doc,
      ],
      // a pattern reading a variable is not memoized
      [
        '<xsl:for-each select="//s"><xsl:variable name="n" select="position()"/>' +
          each("t", '<xsl:number level="any" count="s[$n]/t"/>') +
          "</xsl:for-each>",
        "1;2;1;2;",
        doc,
      ],
      [
        each("//t", '<xsl:number level="multiple" count="s|t"/>'),
        "1.1;1.2;2.1;2.2;3;",
        doc,
      ],
      [each("reverse(//t)", "<xsl:number/>"), "1;2;1;2;1;", doc],
      [each("//t", "<xsl:number/>"), "1;2;1;2;1;", doc],
    ]);
    checkBodies(
      [[each("//t", '<xsl:number count="t[$all]"/>'), "1;2;1;2;1;", doc]],
      { declarations: '<xsl:variable name="all" select="true()"/>' },
    );
  });
});
