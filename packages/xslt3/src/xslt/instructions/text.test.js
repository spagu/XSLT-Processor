import { describe, it } from "node:test";
import { checkBodies } from "../testing.test.js";

describe("xsl:value-of and xsl:text", () => {
  it("joins the items of select with a separator", () => {
    checkBodies([
      ['<out><xsl:value-of select="1 to 3"/></out>', "<out>1 2 3</out>"],
      [
        '<out><xsl:value-of select="1 to 3" separator="-"/></out>',
        "<out>1-2-3</out>",
      ],
      [
        '<out><xsl:value-of select="(1, 2)" separator="{1+1}"/></out>',
        "<out>122</out>",
      ],
      [
        '<out><xsl:value-of>a<xsl:sequence select="1, 2"/></xsl:value-of></out>',
        "<out>a12</out>",
      ],
      ['<out><xsl:value-of select="()"/></out>', "<out/>"],
      ["<out><xsl:text>  x  </xsl:text></out>", "<out>  x  </out>"],
      ["<out><xsl:text/>x</out>", "<out>x</out>"],
    ]);
  });

  it("takes the first item in backwards-compatible mode", () => {
    checkBodies(
      [['<out><xsl:value-of select="1 to 3"/></out>', "<out>1</out>"]],
      {
        version: "1.0",
      },
    );
  });

  it("checks select and content", () => {
    checkBodies(
      [
        ['<xsl:value-of select="1">x</xsl:value-of>', "XTSE0870"],
        ["<xsl:value-of/>", "XTSE0870"],
        ["<xsl:text><b/></xsl:text>", "XTSE0010"],
      ],
      { version: "2.0" },
    );
    checkBodies([["<out><xsl:value-of/></out>", "<out/>"]]);
  });

  it("separates adjacent atomic values with spaces", () => {
    checkBodies([
      [
        '<out><xsl:sequence select="1"/><xsl:sequence select="2"/></out>',
        "<out>1 2</out>",
      ],
      [
        '<out><xsl:sequence select="1"/><xsl:value-of select="\'\'"/><xsl:sequence select="2"/></out>',
        "<out>12</out>",
      ],
      ['<out><xsl:sequence select="[1, 2], 3"/></out>', "<out>1 2 3</out>"],
    ]);
  });
});

describe("xsl:sequence", () => {
  it("adds items, or runs its content in XSLT 3.0", () => {
    checkBodies([
      ['<out><xsl:sequence select="/doc"/></out>', "<out><doc/></out>"],
      [
        "<out><xsl:sequence>x<xsl:fallback/></xsl:sequence></out>",
        "<out>x</out>",
      ],
      ['<xsl:sequence select="1"><b/></xsl:sequence>', "XTSE3185"],
      ['<out><xsl:sequence select="map{}"/></out>', "XTDE0450"],
    ]);
    checkBodies([["<xsl:sequence/>", "XTSE0010"]], { version: "2.0" });
  });
});

describe("xsl:comment, xsl:processing-instruction, xsl:namespace", () => {
  it("builds comments", () => {
    checkBodies([
      [
        "<out><xsl:comment>a--b-</xsl:comment></out>",
        "<out><!--a- -b- --></out>",
      ],
      ['<out><xsl:comment select="1 to 2"/></out>', "<out><!--1 2--></out>"],
      [
        '<out><xsl:comment><xsl:sequence select="1, 2"/></xsl:comment></out>',
        "<out><!--1 2--></out>",
      ],
      ['<xsl:comment select="1">x</xsl:comment>', "XTSE0940"],
    ]);
  });

  it("builds processing instructions", () => {
    checkBodies([
      [
        '<out><xsl:processing-instruction name="p"> a?>b</xsl:processing-instruction></out>',
        "<out><?p a? >b?></out>",
      ],
      ['<xsl:processing-instruction name="xml"/>', "XTDE0890"],
      ['<xsl:processing-instruction name="a b"/>', "XTDE0890"],
      [
        '<xsl:processing-instruction name="p" select="1">x</xsl:processing-instruction>',
        "XTSE0880",
      ],
    ]);
  });

  it("builds namespace nodes", () => {
    checkBodies([
      [
        '<out><xsl:namespace name="p" select="\'urn:p\'"/></out>',
        '<out xmlns:p="urn:p"/>',
      ],
      [
        '<out xmlns:q="urn:q"><xsl:namespace name="xml">http://www.w3.org/XML/1998/namespace</xsl:namespace></out>',
        '<out xmlns:q="urn:q"/>',
      ],
      ['<out><xsl:namespace name="1p">urn:p</xsl:namespace></out>', "XTDE0920"],
      [
        '<out><xsl:namespace name="xmlns">urn:p</xsl:namespace></out>',
        "XTDE0920",
      ],
      [
        '<out><xsl:namespace name="xml">urn:p</xsl:namespace></out>',
        "XTDE0925",
      ],
      [
        '<out><xsl:namespace name="p">http://www.w3.org/2000/xmlns/</xsl:namespace></out>',
        "XTDE0905",
      ],
      ['<out><xsl:namespace name="p"/></out>', "XTDE0930"],
      ['<out><xsl:namespace name="">urn:d</xsl:namespace></out>', "XTDE0440"],
      [
        '<out><xsl:namespace name="p">urn:1</xsl:namespace><xsl:namespace name="p">urn:2</xsl:namespace></out>',
        "XTDE0430",
      ],
      [
        '<xsl:element name="p:out" namespace="urn:1"><xsl:attribute name="a">1</xsl:attribute><xsl:namespace name="p">urn:2</xsl:namespace></xsl:element>',
        '<p_0:out a="1" xmlns:p_0="urn:1" xmlns:p="urn:2"/>',
      ],
      [
        '<p:a xmlns:p="urn:0"><xsl:element name="p:out" namespace="urn:1"><xsl:namespace name="p">urn:2</xsl:namespace></xsl:element></p:a>',
        '<p:a xmlns:p="urn:0"><p_0:out xmlns:p_0="urn:1" xmlns:p="urn:2"/></p:a>',
      ],
      [
        '<w xmlns:p_0="urn:0"><xsl:element name="p:out" namespace="urn:1"><xsl:namespace name="p">urn:2</xsl:namespace></xsl:element></w>',
        '<w xmlns:p_0="urn:0"><p_1:out xmlns:p_1="urn:1" xmlns:p="urn:2"/></w>',
      ],
      [
        '<xsl:variable name="v" as="element()"><xsl:element name="p:out" namespace="urn:1"><xsl:namespace name="p">urn:2</xsl:namespace></xsl:element></xsl:variable><xsl:sequence select="$v"/>',
        '<p_0:out xmlns:p_0="urn:1" xmlns:p="urn:2"/>',
      ],
      [
        '<p:out xmlns:p="urn:1"><xsl:namespace name="p">urn:2</xsl:namespace></p:out>',
        "XTDE0430",
      ],
      [
        '<xsl:element name="p:out" namespace="urn:1"><xsl:namespace name="p">urn:2</xsl:namespace><xsl:namespace name="p">urn:3</xsl:namespace></xsl:element>',
        "XTDE0430",
      ],
      [
        '<out><b/><xsl:namespace name="p">urn:p</xsl:namespace></out>',
        "XTDE0410",
      ],
      ['<xsl:namespace name="p">urn:p</xsl:namespace>', "XTDE0420"],
      ['<xsl:namespace name="p" select="1">x</xsl:namespace>', "XTSE0910"],
    ]);
  });
});
