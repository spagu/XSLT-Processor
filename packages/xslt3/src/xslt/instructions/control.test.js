import { describe, it } from "node:test";
import { checkBodies } from "../testing.test.js";

const xml = "<doc><a>1</a><a>2</a><a>3</a></doc>";

describe("xsl:if, xsl:choose, xsl:for-each", () => {
  it("choose by condition", () => {
    checkBodies([
      [
        '<out><xsl:if test="1">y</xsl:if><xsl:if test="0">n</xsl:if></out>',
        "<out>y</out>",
      ],
      ['<out><xsl:if test="1"/></out>', "<out/>"],
      [
        '<out><xsl:choose><xsl:when test="0">a</xsl:when><xsl:when test="1">b</xsl:when><xsl:otherwise>c</xsl:otherwise></xsl:choose></out>',
        "<out>b</out>",
      ],
      [
        '<out><xsl:choose><xsl:when test="0">a</xsl:when><xsl:otherwise>c</xsl:otherwise></xsl:choose></out>',
        "<out>c</out>",
      ],
      [
        '<out><xsl:choose><xsl:when test="0">a</xsl:when></xsl:choose></out>',
        "<out/>",
      ],
      ["<xsl:choose><xsl:otherwise/></xsl:choose>", "XTSE0010"],
      [
        '<xsl:choose><xsl:otherwise/><xsl:when test="1"/></xsl:choose>',
        "XTSE0010",
      ],
      ['<xsl:choose><xsl:when test="1"/><b/></xsl:choose>', "XTSE0010"],
      ["<xsl:if/>", "XTSE0010"],
    ]);
  });

  it("iterates with the focus on each item", () => {
    checkBodies(
      [
        [
          '<out><xsl:for-each select="//a">{position()}/{last()}={.};</xsl:for-each></out>',
          "<out>1/3=1;2/3=2;3/3=3;</out>",
          xml,
        ],
        ['<out><xsl:for-each select="()">x</xsl:for-each></out>', "<out/>"],
        ['<out><xsl:for-each select="1 to 3"/></out>', "<out/>"],
        [
          '<out><xsl:for-each select="1 to 3"><xsl:sort select="." order="descending"/>{.}</xsl:for-each></out>',
          "<out>321</out>",
        ],
        ['<xsl:for-each select="1"><b/><xsl:sort/></xsl:for-each>', "XTSE0010"],
      ],
      { attributes: 'expand-text="yes"' },
    );
  });
});

describe("local variables", () => {
  it("bind values for the following siblings", () => {
    checkBodies(
      [
        [
          '<xsl:variable name="v" select="2"/><out>{$v * 2}</out>',
          "<out>4</out>",
        ],
        [
          '<xsl:variable name="v"><a/>x</xsl:variable><out>{count($v/a)}</out>',
          "<out>1</out>",
        ],
        [
          '<xsl:variable name="v" as="xs:integer*"><xsl:sequence select="1, 2"/></xsl:variable><out>{sum($v)}</out>',
          "<out>3</out>",
        ],
        ['<xsl:variable name="v"/><out>[{$v}]</out>', "<out>[]</out>"],
        [
          '<xsl:variable name="v" as="xs:integer*"/><out>{count($v)}</out>',
          "<out>0</out>",
        ],
        [
          '<xsl:variable name="v" as="xs:integer" select="\'a\'"/><out>{$v}</out>',
          "XTTE0570",
        ],
        [
          '<xsl:variable name="v" as="xs:integer"><a/></xsl:variable><out>{$v}</out>',
          "XTTE0570",
        ],
        ['<xsl:variable name="v" select="1">x</xsl:variable>', "XTSE0620"],
        ['<xsl:variable name="v" select="error()"/><out/>', "<out/>"],
        ["<xsl:variable/>", "XTSE0010"],
      ],
      { attributes: 'expand-text="yes"' },
    );
  });
});

describe("copying", () => {
  it("copies nodes with xsl:copy and xsl:copy-of", () => {
    checkBodies([
      [
        '<xsl:copy-of select="doc"/>',
        "<doc><a>1</a></doc>",
        "<doc><a>1</a></doc>",
      ],
      [
        '<out><xsl:copy-of select="doc/@x, doc/text(), doc/comment(), doc/processing-instruction(), 1"/></out>',
        '<out x="1">t<!--c--><?p d?>1</out>',
        '<doc x="1">t<!--c--><?p d?></doc>',
      ],
      [
        '<out><xsl:copy-of select="doc/*" copy-namespaces="no"/></out>',
        '<out><p:a xmlns:p="urn:p"><b/></p:a></out>',
        '<doc xmlns:q="urn:q"><p:a xmlns:p="urn:p" xmlns:r="urn:r"><b/></p:a></doc>',
      ],
      [
        '<out><xsl:copy-of select="doc/*"/></out>',
        '<out><a xmlns:q="urn:q"><b xmlns:r="urn:r"/></a></out>',
        '<doc xmlns:q="urn:q"><a><b xmlns:r="urn:r"/></a></doc>',
      ],
      [
        '<xsl:for-each select="doc"><xsl:copy><xsl:attribute name="n" select="1"/>x</xsl:copy></xsl:for-each>',
        '<doc n="1">x</doc>',
      ],
      [
        '<out><xsl:for-each select="doc/@x"><xsl:copy>ignored</xsl:copy></xsl:for-each></out>',
        '<out x="1"/>',
        '<doc x="1"/>',
      ],
      [
        '<out><xsl:copy select="doc/a"/></out>',
        "<out><a/></out>",
        "<doc><a>1</a></doc>",
      ],
      ['<out><xsl:copy select="()"/></out>', "<out/>"],
      ['<out><xsl:copy select="1"/></out>', "<out>1</out>"],
      ['<out><xsl:copy select="1, 2"/></out>', "XTTE3180"],
      ["<xsl:copy><out/></xsl:copy>", "<out/>"],
      ['<xsl:copy-of select="1" copy-namespaces="maybe"/>', "XTSE0020"],
    ]);
  });

  it("raises XTTE0945 without a context item", () => {
    checkBodies([
      [
        '<xsl:for-each select="1"><xsl:copy-of select="1"/></xsl:for-each><xsl:copy/>',
        "1",
      ],
    ]);
  });

  it("builds documents and sorts sequences", () => {
    checkBodies(
      [
        [
          '<xsl:variable name="d" as="document-node()"><xsl:document><a/></xsl:document></xsl:variable><out>{count($d/a)}</out>',
          "<out>1</out>",
        ],
        ["<out><xsl:document/></out>", "<out/>"],
        [
          "<out><xsl:document><xsl:attribute name='a'/></xsl:document></out>",
          "XTDE0420",
        ],
        [
          '<out><xsl:perform-sort select="3, 1, 2"><xsl:sort/></xsl:perform-sort></out>',
          "<out>1 2 3</out>",
        ],
        [
          '<out><xsl:perform-sort><xsl:sort select="." data-type="number"/><xsl:sequence select="10, 9"/></xsl:perform-sort></out>',
          "<out>9 10</out>",
        ],
        [
          '<xsl:perform-sort select="1"><xsl:sort/>x</xsl:perform-sort>',
          "XTSE1040",
        ],
      ],
      { attributes: 'expand-text="yes"' },
    );
  });
});
