import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkBodies, runBody } from "../testing.test.js";

const options = {
  attributes: 'expand-text="yes" xmlns:f="urn:f" xmlns:p="urn:p"',
  exclude: "f p",
  xml: '<doc xmlns:q="urn:q"><a>1</a><a>2</a><e>$x * 2</e></doc>',
  declarations:
    '<xsl:function name="f:pub" visibility="public"><xsl:sequence select="\'pub\'"/></xsl:function>' +
    '<xsl:function name="f:priv"><xsl:sequence select="\'priv\'"/></xsl:function>',
};

describe("xsl:evaluate", () => {
  it("evaluates an expression given as a string", () => {
    checkBodies(
      [
        ["<xsl:evaluate xpath=\"'1 + 2'\"/>", "3"],
        ['<xsl:evaluate xpath="\'count(a)\'" context-item="doc"/>', "2"],
        ['<xsl:evaluate xpath="\'count(a)\'" context-item="()"/>', "XPDY0002"],
        [
          '<xsl:for-each select="1 to 2"><xsl:evaluate xpath="\'$x + $y\'"><xsl:with-param name="x" select="."/><xsl:with-param name="y" select="10"/></xsl:evaluate>;</xsl:for-each>',
          "11;12;",
        ],
        [
          '<xsl:evaluate xpath="string(doc/e)" context-item="." with-params="map{QName(\'\', \'x\'): 21}"><xsl:with-param name="x" select="1"/></xsl:evaluate>',
          "42",
        ],
        [
          "<xsl:evaluate xpath=\"'$p:v'\" with-params=\"map{QName('urn:p', 'v'): 5}\"/>",
          "5",
        ],
        ["<xsl:evaluate xpath=\"'f:pub()'\"/>", "pub"],
        ["<xsl:evaluate xpath=\"'f:priv()'\"/>", "XTDE3160"],
        ["<xsl:evaluate xpath=\"'current()'\"/>", "XTDE3160"],
        ["<xsl:evaluate xpath=\"'1 +'\"/>", "XTDE3160"],
        ["<xsl:evaluate xpath=\"'$undeclared'\"/>", "XPST0008"],
        ['<xsl:evaluate xpath="\'1\'" as="xs:string"/>', "XPTY0004"],
        ['<xsl:evaluate xpath="\'1\'" as="xs:integer"/>', "1"],
        ['<xsl:evaluate xpath="1"/>', "XPTY0004"],
        [
          '<xsl:evaluate xpath="\'namespace-uri-from-QName(xs:QName(&quot;q:x&quot;))\'" namespace-context="doc"/>',
          "urn:q",
        ],
        ['<xsl:evaluate xpath="\'p:x\'" namespace-context="doc"/>', "XTDE3160"],
        [
          '<xsl:evaluate xpath="\'1\'" namespace-context="(doc, doc)"/>',
          "XTTE3170",
        ],
        ['<xsl:evaluate xpath="\'1\'" namespace-context="/"/>', "1"],
        [
          "<xsl:evaluate xpath=\"'static-base-uri()'\" base-uri=\"urn:{'b'}/\"/>",
          "urn:b/",
        ],
        ['<xsl:evaluate xpath="\'1\'" context-item="1, 2"/>', "XTTE3210"],
        ['<xsl:evaluate xpath="\'1\'" with-params="1"/>', "XTTE3165"],
        [
          "<xsl:evaluate xpath=\"'1'\" with-params=\"map{'x': 1}\"/>",
          "XTTE3165",
        ],
        [
          '<xsl:evaluate xpath="\'$x\'"><xsl:with-param name="x" as="xs:integer" select="\'a\'"/></xsl:evaluate>',
          "XPTY0004",
        ],
        [
          '<xsl:evaluate xpath="\'1\'" schema-aware="{\'no\'}"/><xsl:evaluate xpath="\'2\'" schema-aware="yes"/>',
          "1 2",
        ],
        ['<xsl:evaluate xpath="\'1\'" schema-aware="TRUE"/>', "XTDE0030"],
        ["<xsl:evaluate xpath=\"'1'\"><a/></xsl:evaluate>", "XTSE0010"],
      ],
      options,
    );
  });

  it("caches the compiled expressions", () => {
    assert.equal(
      runBody(
        '<xsl:for-each select="1 to 3"><xsl:evaluate xpath="\'. * 2\'" context-item="."/></xsl:for-each>',
      ),
      "2 4 6",
    );
  });

  it("can be disabled", () => {
    const disabled = { ...options, dynamicEvaluation: false };
    checkBodies(
      [
        [
          "<xsl:evaluate xpath=\"'1'\"><xsl:fallback>fallback</xsl:fallback></xsl:evaluate>",
          "fallback",
        ],
        ["<xsl:evaluate xpath=\"'1'\"/>", "XTDE3175"],
      ],
      disabled,
    );
  });
});
