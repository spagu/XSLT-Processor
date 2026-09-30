/**
 * Namespace-strict name tests in XSLT patterns and expressions (XPath 1.0
 * section 2.3, as libxslt/Chrome): `item` only matches `item` in no
 * namespace, and the deprecated `legacyNameTests` engine option restores the
 * lax matching of versions before 1.2.0.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { XsltEngine } from "./engine.js";
import { parseXML, run, stylesheet } from "./harness.test.js";

const SOURCE =
  '<r xmlns:x="urn:x"><item>1</item><x:item>2</x:item><d xmlns="urn:d"><item a="3"/></d></r>';

const XSL = stylesheet(
  '<xsl:template match="item">[<xsl:value-of select="."/>]</xsl:template>' +
    '<xsl:template match="@a">(<xsl:value-of select="."/>)</xsl:template>' +
    '<xsl:template match="*"><xsl:apply-templates select="@*|node()"/></xsl:template>' +
    '<xsl:template match="text()"/>',
);

describe("namespace-strict name tests in patterns", () => {
  it("matches only elements in no namespace (B14, B14c)", () => {
    assert.strictEqual(run(XSL, SOURCE), "[1](3)");
  });

  it("selects only no-namespace nodes in expressions", () => {
    const xsl = stylesheet(
      '<xsl:template match="/"><xsl:value-of select="count(//item)"/>/<xsl:value-of select="count(//*[local-name()=\'item\'])"/></xsl:template>',
    );
    assert.strictEqual(run(xsl, SOURCE), "1/3");
  });

  it("matches default-namespace elements through a prefix", () => {
    const xsl = stylesheet(
      '<xsl:template match="/"><xsl:value-of select="count(//d:item)"/></xsl:template>',
      "text",
      'xmlns:d="urn:d"',
    );
    assert.strictEqual(run(xsl, SOURCE), "1");
  });
});

describe("legacyNameTests engine option (deprecated)", () => {
  it("matches namespaced nodes by local name", () => {
    const engine = new XsltEngine({ legacyNameTests: true });
    engine.importStylesheet(parseXML(XSL));
    assert.strictEqual(engine.transformToString(parseXML(SOURCE)), "[1][2][]");
  });
});
