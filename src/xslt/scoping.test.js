/**
 * Regression tests for variable and parameter binding (XSLT 1.0 section 11):
 * template parameters, lexical scoping of local variables and lazily
 * evaluated global variables and parameters.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { run, stylesheet, compile, parseXML } from "./harness.test.js";

describe("template parameters (XSLT 11.6)", () => {
  it("does not let a caller's with-param leak into a nested template", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><xsl:apply-templates select="r/d"><xsl:with-param name="lvl" select="5"/></xsl:apply-templates></xsl:template>
       <xsl:template match="d"><xsl:param name="lvl"/><xsl:value-of select="$lvl"/>:<xsl:apply-templates select="e"/></xsl:template>
       <xsl:template match="e"><xsl:param name="lvl" select="0"/><xsl:value-of select="$lvl"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl, "<r><d><e/></d></r>"), "5:0");
  });

  it("prefers the template default over a global parameter", () => {
    const xsl = stylesheet(
      `<xsl:param name="p" select="'G'"/>
       <xsl:template match="/"><xsl:call-template name="b"/><xsl:value-of select="$p"/></xsl:template>
       <xsl:template name="b"><xsl:param name="p" select="'B'"/><xsl:value-of select="$p"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl), "BG");
  });

  it("ignores with-params the template does not declare", () => {
    const xsl = stylesheet(
      `<xsl:variable name="x" select="'global'"/>
       <xsl:template match="/"><xsl:call-template name="b"><xsl:with-param name="x" select="'passed'"/></xsl:call-template></xsl:template>
       <xsl:template name="b"><xsl:value-of select="$x"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl), "global");
  });

  it("fails on an undeclared parameter that is not a global either", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><xsl:call-template name="b"><xsl:with-param name="x" select="1"/></xsl:call-template></xsl:template>
       <xsl:template name="b"><xsl:value-of select="$x"/></xsl:template>`,
    );
    assert.throws(() => run(xsl), /Undefined variable: \$x/);
  });

  it("lets a default refer to an earlier parameter of the same template", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><xsl:call-template name="b"><xsl:with-param name="a" select="2"/></xsl:call-template></xsl:template>
       <xsl:template name="b"><xsl:param name="a"/><xsl:param name="b" select="$a * 10"/><xsl:value-of select="$b"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl), "20");
  });

  it("passes parameters through the built-in template rules", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><xsl:apply-templates><xsl:with-param name="p" select="'P'"/></xsl:apply-templates></xsl:template>
       <xsl:template match="e"><xsl:param name="p" select="'-'"/><xsl:value-of select="$p"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl, "<r><e/></r>"), "P");
  });

  it("does not pass parameters to templates reached by apply-imports", () => {
    const imports = {
      "http://x/lib.xsl": stylesheet(
        `<xsl:template match="e"><xsl:param name="p" select="'default'"/><xsl:value-of select="$p"/></xsl:template>`,
      ),
    };
    const xsl = stylesheet(
      `<xsl:import href="lib.xsl"/>
       <xsl:template match="/"><xsl:apply-templates select="e"><xsl:with-param name="p" select="'P'"/></xsl:apply-templates></xsl:template>
       <xsl:template match="e"><xsl:param name="p"/><xsl:value-of select="$p"/>|<xsl:apply-imports/></xsl:template>`,
    );
    assert.strictEqual(run(xsl, "<e/>", { imports }), "P|default");
  });
});

describe("lexical scoping of local variables (XSLT 11.5)", () => {
  it("hides a caller's local variable from a called template", () => {
    const xsl = stylesheet(
      `<xsl:variable name="v" select="'G'"/>
       <xsl:template match="/"><xsl:variable name="v" select="'L'"/><xsl:value-of select="$v"/><xsl:call-template name="b"/></xsl:template>
       <xsl:template name="b"><xsl:value-of select="$v"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl), "LG");
  });

  it("hides a caller's local variable from templates applied to other nodes", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><xsl:variable name="v" select="'L'"/><xsl:apply-templates select="d"/></xsl:template>
       <xsl:template match="d"><xsl:value-of select="$v"/></xsl:template>`,
    );
    assert.throws(() => run(xsl), /Undefined variable: \$v/);
  });

  for (const [name, body] of [
    [
      "xsl:if",
      `<xsl:if test="true()"><xsl:variable name="v" select="1"/></xsl:if>`,
    ],
    [
      "xsl:choose",
      `<xsl:choose><xsl:when test="true()"><xsl:variable name="v" select="1"/></xsl:when></xsl:choose>`,
    ],
    [
      "xsl:for-each",
      `<xsl:for-each select="*"><xsl:variable name="v" select="1"/></xsl:for-each>`,
    ],
    ["a literal result element", `<o><xsl:variable name="v" select="1"/></o>`],
  ]) {
    it(`does not leak a variable out of ${name}`, () => {
      const xsl = stylesheet(
        `<xsl:template match="/">${body}<xsl:value-of select="$v"/></xsl:template>`,
        "xml",
      );
      assert.throws(() => run(xsl), /Undefined variable: \$v/);
    });
  }

  it("makes a variable visible to following siblings and their descendants", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><xsl:variable name="v" select="'V'"/><xsl:if test="true()"><xsl:for-each select="*"><xsl:value-of select="$v"/></xsl:for-each></xsl:if></xsl:template>`,
    );
    assert.strictEqual(run(xsl), "V");
  });

  it("lets a local variable shadow a global one", () => {
    const xsl = stylesheet(
      `<xsl:variable name="v" select="'G'"/>
       <xsl:template match="/"><xsl:value-of select="$v"/><xsl:if test="true()"><xsl:variable name="v" select="'L'"/><xsl:value-of select="$v"/></xsl:if><xsl:value-of select="$v"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl), "GLG");
  });

  it("keeps variables of one for-each iteration out of the next", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><xsl:for-each select="r/e"><xsl:variable name="n" select="@n"/><xsl:value-of select="$n"/></xsl:for-each></xsl:template>`,
    );
    assert.strictEqual(run(xsl, "<r><e n='1'/><e n='2'/></r>"), "12");
  });
});

describe("global variables and parameters (XSLT 11.4)", () => {
  it("resolves a forward reference between global variables", () => {
    const xsl = stylesheet(
      `<xsl:variable name="a" select="concat($b, '!')"/><xsl:variable name="b" select="'B'"/>
       <xsl:template match="/"><xsl:value-of select="$a"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl), "B!");
  });

  it("lets a global parameter default use a later variable", () => {
    const xsl = stylesheet(
      `<xsl:param name="p" select="$v"/><xsl:variable name="v" select="'V'"/>
       <xsl:template match="/"><xsl:value-of select="$p"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl), "V");
  });

  it("uses a value supplied from outside over the declared default", () => {
    const xsl = stylesheet(
      `<xsl:param name="p" select="$v"/><xsl:variable name="v" select="'V'"/><xsl:variable name="w" select="concat($p, '?')"/>
       <xsl:template match="/"><xsl:value-of select="$w"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl, "<d/>", { params: { p: "X" } }), "X?");
  });

  it("evaluates globals with the root node as context node", () => {
    const xsl = stylesheet(
      `<xsl:variable name="n" select="name(*)"/>
       <xsl:template match="/"><xsl:apply-templates select="*/*"/></xsl:template>
       <xsl:template match="e"><xsl:value-of select="$n"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl, "<r><e/></r>"), "r");
  });

  it("evaluates a global variable with content in its own scope", () => {
    const xsl = stylesheet(
      `<xsl:variable name="rtf"><xsl:variable name="inner" select="$b"/><x><xsl:value-of select="$inner"/></x></xsl:variable>
       <xsl:variable name="b" select="'B'"/>
       <xsl:template match="/"><xsl:value-of select="$rtf"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl), "B");
  });

  it("reports a circular definition clearly", () => {
    const xsl = stylesheet(
      `<xsl:variable name="a" select="$b"/><xsl:variable name="b" select="$a"/>
       <xsl:template match="/">x</xsl:template>`,
    );
    assert.throws(() => run(xsl), /Circular definition of global variable \$a/);
  });

  it("still evaluates every global once per transformation", () => {
    const engine = compile(
      stylesheet(
        `<xsl:variable name="v" select="count(//e)"/><xsl:template match="/"><xsl:value-of select="$v"/><xsl:value-of select="$v"/></xsl:template>`,
      ),
    );
    assert.strictEqual(engine.transformToString(parseXML("<r><e/></r>")), "11");
    assert.strictEqual(
      engine.transformToString(parseXML("<r><e/><e/></r>")),
      "22",
    );
  });
});
