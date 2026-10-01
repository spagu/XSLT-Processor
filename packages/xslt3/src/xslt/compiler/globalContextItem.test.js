import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errorCode, run, stylesheet } from "../testing.test.js";

/**
 * Runs a stylesheet whose global variable reads the context item.
 * @param {string} declaration - xsl:global-context-item
 * @param {string|null} [xml] - Source document
 * @returns {string}
 */
const runWith = (declaration, xml = "<doc/>") =>
  run(
    stylesheet(
      `${declaration}<xsl:variable name="v" select="exists(.)"/>` +
        '<xsl:template name="main"><xsl:sequence select="$v"/></xsl:template>',
    ),
    xml,
    { initialTemplate: "main" },
  );

describe("xsl:global-context-item", () => {
  it("declares the global context item", () => {
    const cases = [
      ['<xsl:global-context-item use="optional"/>', "<doc/>", "true"],
      ['<xsl:global-context-item as="document-node()"/>', "<doc/>", "true"],
      ['<xsl:global-context-item use="required"/>', null, "XTDE3086"],
      ['<xsl:global-context-item use="optional"/>', null, "XPDY0002"],
      ['<xsl:global-context-item as="xs:integer"/>', "<doc/>", "XTTE0590"],
      ['<xsl:global-context-item use="absent"/>', "<doc/>", "XPDY0002"],
      [
        '<xsl:global-context-item use="absent" as="item()"/>',
        "<doc/>",
        "XTSE3089",
      ],
      ['<xsl:global-context-item use="sometimes"/>', "<doc/>", "XTSE0020"],
      [
        '<xsl:global-context-item use="required"/><xsl:global-context-item use="optional"/>',
        "<doc/>",
        "XTSE3087",
      ],
      [
        '<xsl:global-context-item use="required"/><xsl:global-context-item use=" required"/>',
        "<doc/>",
        "true",
      ],
    ];
    for (const [declaration, xml, expected] of cases) {
      const actual = /^[A-Z]{4}\d{4}$/.test(expected)
        ? errorCode(() => runWith(declaration, xml))
        : runWith(declaration, xml);
      assert.equal(actual, expected, declaration);
    }
  });
});
