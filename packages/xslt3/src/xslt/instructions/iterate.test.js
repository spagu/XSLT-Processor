import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkBodies, runBody } from "../testing.test.js";

const options = { attributes: 'expand-text="yes"' };

describe("xsl:iterate", () => {
  it("iterates with parameters", () => {
    checkBodies(
      [
        [
          '<xsl:iterate select="1 to 4"><xsl:param name="sum" select="0"/><xsl:param name="n" as="xs:integer" select="$sum + 1"/>[{$sum},{$n},{position()},{last()}]<xsl:next-iteration><xsl:with-param name="sum" select="$sum + ."/></xsl:next-iteration></xsl:iterate>',
          "[0,1,1,4][1,1,2,4][3,1,3,4][6,1,4,4]",
        ],
        [
          '<xsl:iterate select="1 to 3"><xsl:param name="p" select="()"/><xsl:on-completion select="string-join($p, \'-\')"/><xsl:next-iteration><xsl:with-param name="p" select="($p, . * 10)"/></xsl:next-iteration></xsl:iterate>',
          "10-20-30",
        ],
        [
          '<xsl:iterate select="()"><xsl:param name="p" select="7"/><xsl:on-completion>{$p}</xsl:on-completion></xsl:iterate>',
          "7",
        ],
        ['<xsl:iterate select="1 to 3"/>', ""],
        ['<xsl:iterate select="1 to 3">{.}</xsl:iterate>', "123"],
        [
          '<xsl:iterate select="1 to 3"><xsl:param name="v"/>[{$v}]</xsl:iterate>',
          "[][][]",
        ],
      ],
      options,
    );
  });

  it("stops at xsl:break", () => {
    checkBodies(
      [
        [
          '<xsl:iterate select="1 to 9"><xsl:on-completion>none</xsl:on-completion>{.}<xsl:if test=". = 3"><xsl:break select="\'end\'"/></xsl:if></xsl:iterate>',
          "123end",
        ],
        [
          '<xsl:iterate select="1 to 9"><xsl:choose><xsl:when test=". = 2"><xsl:break>stop{.}</xsl:break></xsl:when><xsl:otherwise>{.}</xsl:otherwise></xsl:choose></xsl:iterate>',
          "1stop2",
        ],
        [
          '<xsl:iterate select="1 to 9">{.}<xsl:try><xsl:if test=". = 2"><xsl:break/></xsl:if><xsl:catch/></xsl:try></xsl:iterate>',
          "12",
        ],
        [
          '<xsl:iterate select="1 to 3"><xsl:choose><xsl:when test=". lt 2">{.}</xsl:when><xsl:otherwise><xsl:break/></xsl:otherwise></xsl:choose></xsl:iterate>',
          "1",
        ],
        [
          '<xsl:iterate select="1 to 3"><xsl:try>{.}<xsl:catch/></xsl:try><xsl:fallback/></xsl:iterate>',
          "123",
        ],
        [
          '<xsl:iterate select="1 to 3"><xsl:param name="p" select="0"/><xsl:on-completion select="$p"/><xsl:try><xsl:sequence select="error()"/><xsl:catch><xsl:next-iteration><xsl:with-param name="p" select="$p + 1"/></xsl:next-iteration></xsl:catch></xsl:try></xsl:iterate>',
          "3",
        ],
        [
          '<xsl:iterate select="1 to 2"><xsl:iterate select="5 to 9"><xsl:choose><xsl:when test=". = 7"><xsl:break/></xsl:when><xsl:otherwise>{.}</xsl:otherwise></xsl:choose></xsl:iterate>;</xsl:iterate>',
          "56;56;",
        ],
      ],
      options,
    );
  });

  it("runs long sequences without recursion", () => {
    const body =
      '<xsl:iterate select="1 to 100000"><xsl:param name="s" select="0"/><xsl:on-completion select="$s"/><xsl:next-iteration><xsl:with-param name="s" select="$s + ."/></xsl:next-iteration></xsl:iterate>';
    assert.equal(runBody(body), "5000050000");
  });

  it("is checked", () => {
    checkBodies(
      [
        [
          '<xsl:iterate select="1"><xsl:on-completion select="1">x</xsl:on-completion></xsl:iterate>',
          "XTSE3125",
        ],
        [
          '<xsl:iterate select="1"><xsl:break select="1">x</xsl:break></xsl:iterate>',
          "XTSE3125",
        ],
        ['<xsl:iterate select="1"><xsl:break/>x</xsl:iterate>', "XTSE3120"],
        [
          '<xsl:iterate select="1"><xsl:for-each select="1"><xsl:break/></xsl:for-each></xsl:iterate>',
          "XTSE3120",
        ],
        [
          '<xsl:iterate select="1"><out><xsl:next-iteration/></out></xsl:iterate>',
          "XTSE3120",
        ],
        ["<xsl:break/>", "XTSE0010"],
        [
          '<xsl:iterate select="1"><xsl:next-iteration><xsl:with-param name="x" select="1"/></xsl:next-iteration></xsl:iterate>',
          "XTSE3130",
        ],
        [
          '<xsl:iterate select="1"><xsl:next-iteration><x/></xsl:next-iteration></xsl:iterate>',
          "XTSE0010",
        ],
        [
          '<xsl:iterate select="1">x<xsl:param name="p"/></xsl:iterate>',
          "XTSE0010",
        ],
        [
          '<xsl:iterate select="1">x<xsl:on-completion/></xsl:iterate>',
          "XTSE0010",
        ],
        ['<xsl:iterate select="1"/><xsl:on-completion/>', "XTSE0010"],
        [
          '<xsl:iterate select="1"><xsl:param name="p" as="xs:integer"/></xsl:iterate>',
          "XTSE3520",
        ],
        [
          '<xsl:iterate select="1"><xsl:param name="p" as="xs:integer*"/>{count($p)}</xsl:iterate>',
          "0",
        ],
        [
          '<xsl:iterate select="1"><xsl:param name="p" as="xs:integer">3</xsl:param>{$p}</xsl:iterate>',
          "3",
        ],
        [
          '<xsl:iterate select="1 to 2"><xsl:param name="p" as="xs:integer" select="1"/><xsl:next-iteration><xsl:with-param name="p" select="\'a\'"/></xsl:next-iteration></xsl:iterate>',
          "XTTE0590",
        ],
      ],
      options,
    );
  });
});
