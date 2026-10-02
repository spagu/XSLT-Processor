import { describe, it } from "node:test";
import { checkBodies } from "../testing.test.js";

const options = { attributes: 'expand-text="yes"' };

describe("xsl:on-empty, xsl:on-non-empty, xsl:where-populated", () => {
  it("run when the other content is empty or not", () => {
    checkBodies(
      [
        [
          '<out><xsl:on-non-empty>[</xsl:on-non-empty><xsl:sequence select="1, 2"/><xsl:on-non-empty select="\']\'"/><xsl:on-empty>none</xsl:on-empty></out>',
          "<out>[1 2 ]</out>",
        ],
        [
          '<out><xsl:on-non-empty>[</xsl:on-non-empty><xsl:sequence select="()"/><xsl:on-empty select="\'none\'"/></out>',
          "<out>none</out>",
        ],
        [
          '<out><xsl:variable name="v" select="\'\'"/><xsl:value-of select="$v"/><xsl:sequence select="\'\', [\'\', []]"/><xsl:document/><xsl:on-empty>empty</xsl:on-empty></out>',
          "<out>empty</out>",
        ],
        [
          '<out><xsl:attribute name="a">1</xsl:attribute><xsl:on-empty>empty</xsl:on-empty></out>',
          '<out a="1"/>',
        ],
        [
          "<out><xsl:on-empty>only</xsl:on-empty><xsl:fallback/></out>",
          "<out>only</out>",
        ],
        ["<out><xsl:on-non-empty>never</xsl:on-non-empty></out>", "<out/>"],
        [
          '<xsl:variable name="s" as="xs:string*"><xsl:sequence select="\'\'"/><xsl:on-empty select="\'x\'"/></xsl:variable>{count($s)}{$s}',
          "1x",
        ],
        ['<out><xsl:on-empty select="1">x</xsl:on-empty></out>', "XTSE3185"],
        ["<out><xsl:on-empty/>text</out>", "XTSE0010"],
        ["<out><xsl:on-empty/><xsl:on-empty/></out>", "XTSE0010"],
      ],
      options,
    );
  });

  it("drop the items deemed empty", () => {
    checkBodies(
      [
        [
          "<xsl:where-populated><a/><b x=\"1\"/><c>t</c><xsl:sequence select=\"'', 's', [], [''], [1]\"/><xsl:document/><xsl:comment/><xsl:comment>c</xsl:comment><xsl:text/></xsl:where-populated>",
          "<c>t</c>s 1<!--c-->",
        ],
        [
          '<out><xsl:where-populated><xsl:attribute name="e"/><xsl:attribute name="f">1</xsl:attribute><xsl:processing-instruction name="p"/></xsl:where-populated></out>',
          '<out f="1"/>',
        ],
        [
          '<xsl:variable name="m" as="item()*"><xsl:where-populated><xsl:sequence select="map{}, map{1:2}, 1"/></xsl:where-populated></xsl:variable>{count($m)}',
          "2",
        ],
      ],
      options,
    );
  });
});

describe("xsl:fork", () => {
  it("runs its branches in order", () => {
    checkBodies(
      [
        [
          '<xsl:fork><xsl:fallback/><xsl:sequence select="1"/><xsl:sequence>2</xsl:sequence></xsl:fork>',
          "12",
        ],
        [
          '<xsl:fork><xsl:for-each-group select="1 to 4" group-by=". mod 2">{sum(current-group())}</xsl:for-each-group></xsl:fork>',
          "46",
        ],
        ["<xsl:fork><a/></xsl:fork>", "XTSE0010"],
        [
          '<xsl:fork><xsl:sequence/><xsl:for-each-group select="1" group-by="."/></xsl:fork>',
          "XTSE0010",
        ],
      ],
      options,
    );
  });
});
