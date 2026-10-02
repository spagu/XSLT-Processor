import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  libraryP,
  main,
  pkg,
  runTop,
  topError,
  useP,
} from "./packageTesting.test.js";

/** A library whose public components call each other. */
const LIBRARY = {
  "urn:p": libraryP(`
    <xsl:variable name="p:c" visibility="public" as="xs:integer" select="22"/>
    <xsl:variable name="p:a" visibility="final" select="$p:c * 2 + 1"/>
    <xsl:function name="p:f" visibility="public" as="xs:string"><xsl:param name="x" as="xs:string"/><xsl:sequence select="'f(' || $x || ')'"/></xsl:function>
    <xsl:function name="p:g" visibility="final"><xsl:sequence select="p:f('g')"/></xsl:function>
    <xsl:template name="p:t" visibility="public"><xsl:param name="x" select="1"/><t x="{$x}"/></xsl:template>
    <xsl:template name="p:call" visibility="final"><xsl:call-template name="p:t"/></xsl:template>
    <xsl:attribute-set name="p:as" visibility="public"><xsl:attribute name="a" select="1"/></xsl:attribute-set>
    <xsl:template name="p:sets" visibility="final"><e xsl:use-attribute-sets="p:as"/></xsl:template>
    <xsl:mode name="p:m" visibility="public"/>
    <xsl:mode name="p:fixed" visibility="final"/>
    <xsl:template match="*" mode="p:m"><base/></xsl:template>
    <xsl:template name="p:apply" visibility="final"><xsl:variable name="z"><z/></xsl:variable><xsl:apply-templates select="$z/*" mode="p:m"/></xsl:template>
    <xsl:template name="p:abstract" visibility="abstract"><xsl:param name="x" as="xs:string"/></xsl:template>
    <xsl:template name="p:no-param" visibility="public"><xsl:call-template name="p:abstract"/></xsl:template>
    <xsl:template name="p:uses-abstract" visibility="public"><xsl:call-template name="p:abstract"><xsl:with-param name="x" select="'a'"/></xsl:call-template></xsl:template>
    <xsl:function name="p:af" visibility="abstract"/>
    <xsl:function name="p:calls-af" visibility="public"><xsl:sequence select="p:af()"/></xsl:function>
    <xsl:variable name="p:av" visibility="abstract"/>
    <xsl:function name="p:uses-av" visibility="public"><xsl:sequence select="$p:av"/></xsl:function>
    <xsl:attribute-set name="p:aas" visibility="abstract"/>
    <xsl:template name="p:uses-aas" visibility="public"><e xsl:use-attribute-sets="p:aas"/></xsl:template>`),
};

const override = (content, accept = "") =>
  useP(`${accept}<xsl:override>${content}</xsl:override>`);

describe("xsl:override", () => {
  it("rebinds the references of the used package", () => {
    const top = pkg(
      override(`
        <xsl:variable name="p:c" as="xs:integer" select="$xsl:original + 3"/>
        <xsl:function name="p:f" as="xs:string"><xsl:param name="x" as="xs:string"/><xsl:sequence select="'*' || xsl:original($x) || '*'"/></xsl:function>
        <xsl:template name="p:t"><xsl:param name="x" select="2"/><o><xsl:call-template name="xsl:original"><xsl:with-param name="x" select="$x"/></xsl:call-template></o></xsl:template>
        <xsl:attribute-set name="p:as" use-attribute-sets="xsl:original"><xsl:attribute name="b" select="2"/></xsl:attribute-set>
        <xsl:template match="z" mode="p:m"><over><xsl:next-match/></over></xsl:template>
        <xsl:template name="p:abstract"><xsl:param name="x" as="xs:string"/><abs x="{$x}"/></xsl:template>`) +
        main(
          '<xsl:value-of select="$p:a, p:g()"/><xsl:call-template name="p:call"/>' +
            '<xsl:call-template name="p:sets"/><xsl:call-template name="p:apply"/>' +
            '<xsl:call-template name="p:uses-abstract"/>',
        ),
    );
    assert.equal(
      runTop(top, LIBRARY),
      '<out>51 *f(g)*<o><t x="2"/></o><e a="1" b="2"/><over><base/></over><abs x="a"/></out>',
    );
  });

  it("leaves abstract components failing when invoked", () => {
    const run = (call) => topError(pkg(useP() + main(call)), LIBRARY);
    assert.equal(
      run('<xsl:call-template name="p:uses-abstract"/>'),
      "XTDE3052",
    );
    assert.equal(run('<xsl:call-template name="p:no-param"/>'), "XTDE3052");
    assert.equal(run('<xsl:sequence select="p:calls-af()"/>'), "XTDE3052");
    assert.equal(run('<xsl:sequence select="p:uses-av()"/>'), "XTDE3052");
    assert.equal(run('<xsl:call-template name="p:uses-aas"/>'), "XTDE3052");
    const accepted = pkg(
      useP(
        '<xsl:accept component="template" names="p:abstract" visibility="abstract"/>',
      ) + main(""),
    );
    assert.equal(topError(accepted, LIBRARY), "XTSE3080");
  });

  it("checks what is overridden", () => {
    const top = (content, accept) => pkg(override(content, accept) + main(""));
    const error = (content, accept) => topError(top(content, accept), LIBRARY);
    assert.equal(error('<xsl:variable name="p:none"/>'), "XTSE3058");
    assert.equal(error('<xsl:variable name="p:a"/>'), "XTSE3060");
    assert.equal(error('<xsl:template match="*" mode="p:fixed"/>'), "XTSE3060");
    assert.equal(error('<xsl:template match="*" mode="p:none"/>'), "XTSE3060");
    assert.equal(error('<xsl:template match="*"/>'), "XTSE3440");
    assert.equal(
      error('<xsl:template match="*" mode="#unnamed"/>'),
      "XTSE3440",
    );
    assert.equal(
      error(
        '<xsl:variable name="p:c" select="1"/>',
        '<xsl:accept component="variable" names="p:c" visibility="private"/>',
      ),
      "XTSE3051",
    );
    assert.equal(
      error(
        '<xsl:variable name="p:c" as="xs:integer"/><xsl:param name="p:c" as="xs:integer"/>',
      ),
      "XTSE0630",
    );
    assert.equal(
      error('<xsl:variable name="p:c" as="xs:string"/>'),
      "XTSE3070",
    );
    assert.equal(
      error(
        '<xsl:function name="p:f" as="xs:string"><xsl:param name="x"/></xsl:function>',
      ),
      "XTSE3070",
    );
    assert.equal(
      error(
        '<xsl:function name="p:f" as="xs:string" new-each-time="no"><xsl:param name="x" as="xs:string"/></xsl:function>',
      ),
      "XTSE3070",
    );
    assert.equal(
      error(
        '<xsl:template name="p:t"><xsl:param name="y" required="yes"/></xsl:template>',
      ),
      "XTSE3070",
    );
    assert.equal(
      error(
        '<xsl:template name="p:t"><xsl:param name="x" tunnel="yes"/></xsl:template>',
      ),
      "XTSE3070",
    );
    assert.equal(
      error(
        '<xsl:template name="p:t"><xsl:context-item use="absent"/><xsl:param name="x"/></xsl:template>',
      ),
      "XTSE3070",
    );
    assert.equal(
      error(
        '<xsl:template name="p:abstract"><xsl:param name="x" as="xs:string"/><xsl:call-template name="xsl:original"/></xsl:template>',
      ),
      "XTSE3075",
    );
    assert.equal(
      error('<xsl:variable name="p:av" select="$xsl:original"/>'),
      "XTSE3075",
    );
    assert.equal(
      topError(
        pkg(
          override(
            '<xsl:template name="p:t"><xsl:param name="x"/></xsl:template>',
          ) +
            '<xsl:template name="p:t"/>' +
            main(""),
        ),
        LIBRARY,
      ),
      "XTSE3055",
    );
    assert.equal(
      topError(
        pkg(
          override(
            '<xsl:function name="p:f" as="xs:string"><xsl:param name="x" as="xs:string"/></xsl:function>',
          ) +
            '<xsl:function name="p:f"><xsl:param name="x"/></xsl:function>' +
            main(""),
        ),
        LIBRARY,
      ),
      "XTSE0770",
    );
  });

  it("accepts tunnel parameters and context items that match", () => {
    const library = {
      "urn:p": libraryP(
        '<xsl:template name="p:t" visibility="public"><xsl:context-item use="optional"/><xsl:param name="x" tunnel="yes" as="xs:integer"/><t/></xsl:template>',
      ),
    };
    const top = pkg(
      override(
        '<xsl:template name="p:t"><xsl:context-item as="item()"/><xsl:param name="x" tunnel="yes" as="xs:integer"/><o/></xsl:template>',
      ) +
        main(
          '<xsl:call-template name="p:t"><xsl:with-param name="x" select="1" tunnel="yes"/></xsl:call-template>',
        ),
    );
    assert.equal(runTop(top, library), "<out><o/></out>");
  });
});
