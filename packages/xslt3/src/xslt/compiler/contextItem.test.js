import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errorCode, run, stylesheet } from "../testing.test.js";

/**
 * Runs a stylesheet from a named template.
 * @param {string} declarations
 * @param {object} [options]
 * @returns {string}
 */
const runMain = (declarations, options = {}) =>
  run(stylesheet(declarations), "<doc/>", {
    initialTemplate: "main",
    ...options,
  });

describe("xsl:context-item", () => {
  it("checks the context item of a template", () => {
    const template = (declaration) =>
      `<xsl:template name="t">${declaration}<xsl:param name="p" select="1"/><xsl:sequence select=". instance of node()"/></xsl:template>`;
    const call = (select) =>
      `<xsl:template name="main"><xsl:for-each select="${select}"><xsl:call-template name="t"/></xsl:for-each></xsl:template>`;
    const cases = [
      ['<xsl:context-item as="node()"/>', "/", "true"],
      ['<xsl:context-item as="node()" use="required"/>', "1", "XTTE0590"],
      ['<xsl:context-item use="optional"/>', "1", "false"],
      ['<xsl:context-item use="absent"/>', "/", "XPDY0002"],
      ['<xsl:context-item as="xs:integer?"/>', "1", "XTSE0020"],
      ['<xsl:context-item as="empty-sequence()"/>', "1", "XTSE0020"],
      ['<xsl:context-item as="xs:integer" use="absent"/>', "1", "XTSE3088"],
      ['<xsl:context-item use="never"/>', "1", "XTSE0020"],
    ];
    for (const [declaration, select, expected] of cases) {
      const xsl = template(declaration) + call(select);
      const actual = /^[A-Z]{4}\d{4}$/.test(expected)
        ? errorCode(() => runMain(xsl))
        : runMain(xsl);
      assert.equal(actual, expected, declaration);
    }
    // a function call has no focus
    assert.equal(
      errorCode(() =>
        runMain(
          template('<xsl:context-item use="required"/>') +
            '<xsl:template name="main"><xsl:sequence select="Q{u}f()"/></xsl:template>' +
            '<xsl:function name="Q{u}f"><xsl:call-template name="t"/></xsl:function>',
        ),
      ),
      "XTTE3090",
    );
  });

  it("is required by template rules", () => {
    assert.equal(
      errorCode(() =>
        runMain(
          '<xsl:template match="a"><xsl:context-item use="optional"/></xsl:template><xsl:template name="main"/>',
        ),
      ),
      "XTSE0020",
    );
    assert.equal(
      runMain(
        '<xsl:template match="/" name="r" xml:space="preserve"> <xsl:context-item use="required" as="document-node()"/>ok</xsl:template><xsl:template name="main"><xsl:apply-templates select="/"/></xsl:template>',
      ),
      "ok",
    );
  });

  it("must come first", () => {
    for (const body of [
      'x<xsl:context-item use="optional"/>',
      "<xsl:context-item/><xsl:context-item/>",
    ]) {
      assert.equal(
        errorCode(() =>
          runMain(`<xsl:template name="main">${body}</xsl:template>`),
        ),
        "XTSE0010",
      );
    }
  });
});
