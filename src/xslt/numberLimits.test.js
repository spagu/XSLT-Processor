/**
 * xsl:number with extreme values and non-ASCII digit tokens, as libxslt does
 * (libxslt tests general/bug-187, bug-197 and bug-219): huge values must not
 * hang the processor.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { formatXsltNumber } from "./numberFormat.js";
import { run, stylesheet } from "./harness.test.js";

const TWO_POW_53 = 9007199254740992;

describe("xsl:number extreme values", { timeout: 2000 }, () => {
  it("formats huge values in O(log n) (bug-187)", () => {
    assert.strictEqual(formatXsltNumber([TWO_POW_53], "1"), "9007199254740992");
    assert.strictEqual(formatXsltNumber([TWO_POW_53], "a"), "bktxhsoghkkf");
    assert.strictEqual(formatXsltNumber([TWO_POW_53], "I"), "9007199254740992");
    assert.strictEqual(formatXsltNumber([1e21], "1"), "1000000000000000000000");
  });

  it("uses decimals for Roman numerals below 1 and above 5000", () => {
    assert.strictEqual(formatXsltNumber([5000], "I"), "MMMMM");
    assert.strictEqual(formatXsltNumber([5001], "i"), "5001");
    assert.strictEqual(formatXsltNumber([0], "I"), "0");
  });

  it("treats negative values as zero", () => {
    assert.strictEqual(formatXsltNumber([-123], "1"), "0");
    assert.strictEqual(formatXsltNumber([-3], "a"), "0");
    assert.strictEqual(formatXsltNumber([-Infinity], "01"), "00");
  });

  it("writes NaN and Infinity with string()", () => {
    assert.strictEqual(formatXsltNumber([NaN], "a"), "NaN");
    assert.strictEqual(formatXsltNumber([Infinity], "a"), "Infinity");
    assert.strictEqual(formatXsltNumber([Infinity], "I"), "Infinity");
    assert.strictEqual(formatXsltNumber([Infinity], "1"), "Infinity");
  });

  it("matches the libxslt output of bug-187 end to end", () => {
    const values = [
      ["1", "3.51"],
      ["1", "-123.456"],
      ["1", "9007199254740992"],
      ["a", "3.51"],
      ["a", "-123.456"],
      ["a", "0"],
      ["a", "9007199254740992"],
      ["I", "3.51"],
      ["I", "-123.456"],
      ["I", "0"],
      ["I", "9007199254740992"],
    ];
    const body = values
      .map(([f, v]) => `<xsl:number format="${f}" value="${v}"/>;`)
      .join("");
    const warnings = [];
    const warn = console.warn;
    console.warn = (message) => warnings.push(message);
    try {
      assert.strictEqual(
        run(stylesheet(`<xsl:template match="/">${body}</xsl:template>`)),
        "4;0;9007199254740992;d;0;0;bktxhsoghkkf;IV;0;0;9007199254740992;",
      );
    } finally {
      console.warn = warn;
    }
    assert.deepStrictEqual(warnings, [
      "XSLT: xsl:number: negative value, 0 is used",
    ]);
  });
});

describe("xsl:number digit families (bug-219)", () => {
  it("formats with the digits of the token's family", () => {
    assert.strictEqual(formatXsltNumber([9], "٠١"), "٠٩");
    assert.strictEqual(formatXsltNumber([1234567890], "٠١"), "١٢٣٤٥٦٧٨٩٠");
    assert.strictEqual(formatXsltNumber([0], "०१"), "००");
    assert.strictEqual(formatXsltNumber([12], "１"), "１２");
    assert.strictEqual(formatXsltNumber([7], "༠༡"), "༠༧");
  });

  it("finds the digit one in adjacent digit blocks", () => {
    // Mathematical bold digits follow each other without a gap
    assert.strictEqual(formatXsltNumber([3], "\u{1D7CF}"), "\u{1D7D1}");
    assert.strictEqual(formatXsltNumber([3], "\u{1D7D9}"), "\u{1D7DB}");
  });

  it("keeps separators between non-ASCII tokens", () => {
    assert.strictEqual(formatXsltNumber([1, 2], "١.١"), "١.٢");
    assert.strictEqual(formatXsltNumber([4], "٢"), "4");
    // Only zeros may precede the digit one
    assert.strictEqual(formatXsltNumber([4], "٢١"), "4");
  });
});

describe("xsl:number counting attributes (bug-197)", () => {
  it("counts the attribute itself with level any", () => {
    const xsl = stylesheet(
      '<xsl:template match="node()|@*"><xsl:copy><xsl:apply-templates select="node()|@*"/></xsl:copy></xsl:template>' +
        '<xsl:template match="@*"><xsl:attribute name="{name()}"><xsl:number count="@*" level="any"/></xsl:attribute></xsl:template>',
      "xml",
    );
    assert.strictEqual(
      run(
        xsl,
        '<root attr="a"><foo attr="b" x="c"><bar attr="d"/></foo></root>',
      ),
      '<root attr="1"><foo attr="1" x="1"><bar attr="1"/></foo></root>',
    );
  });

  it("counts elements before an attribute and stops at a from attribute", () => {
    const xsl = stylesheet(
      '<xsl:template match="/"><xsl:for-each select="//@*"><xsl:number count="*" level="any"/>,<xsl:number count="@*" from="@x" level="any"/>;</xsl:for-each></xsl:template>',
    );
    assert.strictEqual(run(xsl, '<r a="1"><s x="2"/></r>'), "1,1;2,;");
  });

  it("numbers a namespace node after its element (bug-199)", () => {
    const xsl = stylesheet(
      '<xsl:template match="/"><xsl:for-each select="//namespace::a"><xsl:number count="*" level="any"/>.<xsl:number count="*" level="multiple"/>;</xsl:for-each></xsl:template>',
    );
    assert.strictEqual(
      run(xsl, '<r xmlns:a="a"><f xmlns:a="b"><b xmlns:a="c"/></f></r>'),
      "1.1;2.1.1;3.1.1.1;",
    );
  });
});
