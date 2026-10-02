import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkBodies,
  runBody,
  transform,
  stylesheet,
} from "../testing.test.js";

describe("xsl:assert", () => {
  it("fails when its test is false or fails", () => {
    checkBodies(
      [
        ['<xsl:assert test="1 = 1"/>ok', "ok"],
        ['<xsl:assert test="1 = 2"/>ok', "XTMM9001"],
        ['<xsl:assert test="error()"/>ok', "XTMM9001"],
        ['<xsl:assert test="0" error-code="err:FOER0000"/>', "FOER0000"],
        [
          '<xsl:try><xsl:assert test="0" error-code="my:{\'e\'}" select="\'v\'"/><xsl:catch errors="my:e" select="$err:value, namespace-uri-from-QName($err:code)"/></xsl:try>',
          "v urn:my",
        ],
        [
          '<xsl:try><xsl:assert test="0">c<b/></xsl:assert><xsl:catch select="count($err:value)"/></xsl:try>',
          "2",
        ],
        ['<xsl:assert test="0" select="1">x</xsl:assert>', "XTSE3185"],
        ['<xsl:assert test="0" error-code="1x"/>', "XTDE0030"],
      ],
      {
        attributes:
          'xmlns:my="urn:my" xmlns:err="http://www.w3.org/2005/xqt-errors"',
        exclude: "my err",
      },
    );
  });

  it("can be disabled", () => {
    assert.equal(
      runBody('<xsl:assert test="0"/>ok', "<doc/>", { assertions: false }),
      "ok",
    );
    const result = transform(
      stylesheet(
        '<xsl:template match="/"><xsl:try><xsl:assert test="0" select="\'m\'"/><xsl:catch/></xsl:try></xsl:template>',
      ),
    );
    assert.equal(result.messages.length, 1);
  });
});
