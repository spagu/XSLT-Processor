import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  libraryP,
  main,
  parse,
  pkg,
  runTop,
  topError,
  useP,
} from "./packageTesting.test.js";

/** A library with one public component of each kind and private ones. */
const LIBRARY = {
  "urn:p": libraryP(`
    <xsl:variable name="p:v" visibility="public" select="'v'"/>
    <xsl:variable name="p:hidden" select="'h'"/>
    <xsl:param name="p:par" select="'par'"/>
    <xsl:function name="p:f" visibility="public"><xsl:param name="x"/><xsl:sequence select="'f' || $x"/></xsl:function>
    <xsl:function name="p:secret"><xsl:sequence select="'s'"/></xsl:function>
    <xsl:template name="p:t" visibility="public"><t v="{$p:v}{p:secret()}"/></xsl:template>
    <xsl:attribute-set name="p:as" visibility="public"><xsl:attribute name="a" select="'1'"/></xsl:attribute-set>
    <xsl:mode name="p:m" visibility="public"/>
    <xsl:template match="*" mode="p:m"><m><xsl:value-of select="name()"/></m></xsl:template>
    <xsl:key name="k" match="i" use="@k"/>
    <xsl:function name="p:keyed" visibility="public"><xsl:param name="d"/><xsl:sequence select="key('k', 'x', $d)/@v/string()"/></xsl:function>`),
};

describe("xsl:use-package", () => {
  it("makes the public components of a package available", () => {
    const top = pkg(
      useP() +
        main(
          '<xsl:value-of select="$p:v, p:f(1), $p:par"/><xsl:call-template name="p:t"/>' +
            '<e xsl:use-attribute-sets="p:as"/><xsl:variable name="z"><z/></xsl:variable><xsl:apply-templates select="$z/*" mode="p:m"/>',
        ),
    );
    assert.equal(
      runTop(top, LIBRARY),
      '<out>v f1 par<t v="vs"/><e a="1"/><m>z</m></out>',
    );
  });

  it("keeps the private components of a package to itself", () => {
    const uses = (body) => topError(pkg(useP() + main(body)), LIBRARY);
    assert.equal(uses('<xsl:value-of select="$p:hidden"/>'), "XPST0008");
    assert.equal(uses('<xsl:value-of select="p:secret()"/>'), "XPST0017");
    // a package may declare its own component with the name of a private one
    const own = pkg(
      useP() +
        '<xsl:function name="p:secret"><xsl:sequence select="\'mine\'"/></xsl:function>' +
        main(
          '<xsl:value-of select="p:secret()"/><xsl:call-template name="p:t"/>',
        ),
    );
    assert.equal(runTop(own, LIBRARY), '<out>mine<t v="vs"/></out>');
  });

  it("keeps keys local to their package", () => {
    const top = pkg(
      useP() +
        '<xsl:key name="k" match="i" use="@v"/>' +
        main(
          '<xsl:variable name="d"><r><i k="x" v="1"/></r></xsl:variable>' +
            "<xsl:value-of select=\"p:keyed($d), key('k', '1', $d)/@k\"/>",
        ),
    );
    assert.equal(runTop(top, LIBRARY), "<out>1 x</out>");
  });

  it("finds packages as documents, text or {source, baseUri}", () => {
    const top = pkg(useP() + main('<xsl:value-of select="$p:v"/>'));
    const text = LIBRARY["urn:p"];
    assert.equal(runTop(top, { "urn:p": parse(text) }), "<out>v</out>");
    assert.equal(
      runTop(top, { "urn:p": { source: text, baseUri: "file:///p.xsl" } }),
      "<out>v</out>",
    );
    // a package without a name takes the name it was found by
    const unnamed = pkg(
      '<xsl:variable name="p:v" visibility="public" select="1"/>',
    );
    assert.equal(runTop(top, { "urn:p": unnamed }, {}), "<out>1</out>");
  });

  it("reports packages that cannot be used", () => {
    const top = (range) => pkg(useP("", range) + main(""));
    assert.equal(topError(top("1.0"), {}), "XTSE3000");
    assert.equal(topError(top("2+"), LIBRARY), "XTSE3000");
    assert.equal(topError(top("x.y"), LIBRARY), "XTSE0020");
    const other = { "urn:p": pkg("", 'name="urn:other"') };
    assert.equal(topError(top("*"), other), "XTSE3000");
    const cycle = {
      "urn:p": libraryP('<xsl:use-package name="urn:q"/>'),
      "urn:q": pkg('<xsl:use-package name="urn:p"/>', 'name="urn:q"'),
    };
    assert.equal(topError(top("*"), cycle), "XTSE3005");
    const imported = pkg('<xsl:import href="m.xsl"/>' + main(""));
    const module = `<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">${useP()}</xsl:stylesheet>`;
    assert.equal(
      topError(imported, LIBRARY, { loadStylesheet: () => module }),
      "XTSE3008",
    );
    assert.equal(
      topError(pkg('<xsl:include href="p.xsl"/>' + main("")), LIBRARY, {
        loadStylesheet: () => LIBRARY["urn:p"],
      }),
      "XTSE0165",
    );
  });

  it("checks the content of xsl:use-package and xsl:override", () => {
    const top = (content) => pkg(useP(content) + main(""));
    assert.equal(topError(top("<xsl:template/>"), LIBRARY), "XTSE0010");
    assert.equal(
      topError(top("<xsl:override>x</xsl:override>"), LIBRARY),
      "XTSE0010",
    );
    assert.equal(
      topError(
        top("<xsl:override><xsl:key name='k'/></xsl:override>"),
        LIBRARY,
      ),
      "XTSE0010",
    );
    assert.equal(
      topError(top("<xsl:override><out/></xsl:override>"), LIBRARY),
      "XTSE0010",
    );
    assert.equal(
      topError(top("<xsl:accept component='mode' names='*'/>"), LIBRARY),
      "XTSE0010",
    );
  });

  it("starts transformations at public components only", () => {
    const top = pkg(
      '<xsl:template name="main"><out/></xsl:template>' +
        '<xsl:function name="p:f"><xsl:sequence select="1"/></xsl:function>' +
        '<xsl:mode name="private"/><xsl:mode name="public" visibility="public"/>' +
        '<xsl:template match="." mode="public"><pub/></xsl:template>',
      'declared-modes="no"',
    );
    assert.equal(topError(top, {}), "XTDE0040");
    assert.equal(
      topError(
        top,
        {},
        {
          initialTemplate: undefined,
          initialFunction: { name: "{urn:p}f", args: [] },
        },
      ),
      "XTDE0041",
    );
    const mode = (initialMode) =>
      runTop(
        top,
        {},
        { initialTemplate: undefined, initialMode, initialMatchSelection: [1] },
      );
    assert.equal(mode("{}public"), "<pub/>");
    assert.equal(mode("#unnamed"), "1");
    assert.equal(mode("{}#default"), "1");
    assert.equal(
      topError(
        top,
        {},
        {
          initialTemplate: undefined,
          initialMode: "{}private",
          initialMatchSelection: [1],
        },
      ),
      "XTDE0045",
    );
  });
});
