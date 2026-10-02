import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errorCode, run, stylesheet } from "../testing.test.js";

const xml =
  '<doc xmlns:p="urn:p"><a i="1"><b>1</b><b>2</b></a><a i="2"><c><b>3</b></c></a><p:x/></doc>';

/**
 * The nodes a pattern matches, among every node of a document.
 * @param {string} pattern
 * @param {string} [declarations]
 * @param {string} [source]
 * @returns {string} the matched nodes: names, "#" for documents, text
 */
function matched(pattern, declarations = "", source = xml) {
  const xsl = stylesheet(
    `${declarations}<xsl:mode name="m" on-no-match="deep-skip"/>` +
      '<xsl:template match="/"><xsl:apply-templates select="(/, //node(), //@*, //namespace::p)" mode="m"/></xsl:template>' +
      `<xsl:template match="${pattern}" mode="m">[<xsl:value-of select="if (. instance of document-node()) then '#' else if (self::text()) then string() else name()"/>]</xsl:template>`,
    { attributes: 'xmlns:p="urn:p"', exclude: "p" },
  );
  return run(xsl, source);
}

describe("patterns of any form", () => {
  it("follow descendant axes", () => {
    const cases = [
      ["doc/descendant::b", "[b][b][b]"],
      ["a/descendant::b[1]", "[b][b]"],
      ["a/descendant-or-self::a[@i = 2]", "[a]"],
      ["descendant::b", "[b][b][b]"],
      ["self::b[. = '2']", "[b]"],
      ["a/b/descendant-or-self::text()", "[1][2]"],
      ["doc/a/@i[. = '2']", "[i]"],
      ["doc/namespace::p[. = 'urn:p']", "[p]"],
      ["a/(b|c)", "[b][b][c]"],
      ["a/(b|c)[1]", "[b][c]"],
      ["a/(b except c)", "[b][b]"],
      ["a/(b intersect *)", "[b][b]"],
      ["(a/b)[2]", "[b]"],
      ["(b)[2]", "[b]"],
      ["(/)[doc]", "[#]"],
      ["a/(/)", ""],
      ["doc/(c/b)", ""],
      ["/doc/descendant::b[. = '3']", "[b]"],
      ["/a/descendant::b", ""],
      ["a/(c/b)", "[b]"],
    ];
    for (const [pattern, expected] of cases) {
      assert.equal(matched(pattern), expected, pattern);
    }
  });

  it("filter rooted steps", () => {
    const declarations =
      '<xsl:key name="k" match="a" use="@i"/><xsl:variable name="v" select="//b"/>';
    const cases = [
      ["$v[. = '3']", "[b]"],
      ["$v[2]/text()", "[2]"],
      ["key('k', '2')[c]//b", "[b]"],
      ["root()[self::doc]", ""],
      ["root()[doc]", "[#]"],
      ["id('x')[1]", ""],
    ];
    for (const [pattern, expected] of cases) {
      assert.equal(matched(pattern, declarations), expected, pattern);
    }
  });

  it("evaluate intersect and except from one context", () => {
    // a b is a child of a, not of the c inside a: the sides differ in context
    assert.equal(matched("a//b intersect c//b"), "");
    assert.equal(matched("a//b except c//b"), "[b][b][b]");
    assert.equal(matched("b except a/b"), "[b][b][b]");
  });

  it("match parentless nodes", () => {
    const xsl = stylesheet(
      '<xsl:template match="/"><xsl:variable name="e" as="element()*"><b n="1"/><b n="2"/></xsl:variable>' +
        '<xsl:variable name="t" as="node()*"><xsl:text>t</xsl:text><xsl:attribute name="n">x</xsl:attribute></xsl:variable>' +
        '<xsl:apply-templates select="$e, $t" mode="m"/></xsl:template>' +
        '<xsl:mode name="m" on-no-match="deep-skip"/>' +
        '<xsl:template match="b[@n = 2]/descendant-or-self::b" mode="m">1</xsl:template>' +
        '<xsl:template match="(b)[@n = 1]" mode="m">2</xsl:template>' +
        '<xsl:template match="text()[. = \'t\']/self::node()" mode="m">3</xsl:template>' +
        '<xsl:template match="@n[. = \'x\']/self::node()" mode="m">4</xsl:template>' +
        '<xsl:template match="document-node()[*]/self::node()" mode="m">5</xsl:template>' +
        '<xsl:template match="b except b[@n = 2]" mode="m" priority="9">6</xsl:template>' +
        '<xsl:template match="text() intersect node()" mode="m" priority="9">7</xsl:template>',
    );
    assert.equal(run(xsl), "6174");
  });

  it("match only nodes", () => {
    const xsl = stylesheet(
      '<xsl:template match="/"><xsl:apply-templates select="1, ." mode="m"/></xsl:template>' +
        '<xsl:mode name="m" on-no-match="deep-skip"/>' +
        '<xsl:template match="(/)[doc] | doc/descendant::a" mode="m">d</xsl:template>',
    );
    assert.equal(run(xsl, "<doc><a/></doc>"), "d");
  });

  it("are checked against the grammar", () => {
    for (const pattern of [
      "(.[1])",
      ".[1] | a",
      "a | (: c :) (.)",
      "parent::a",
      "a/$v",
      "f(1)",
      "root(.)",
      "key('k', 1 + 1)",
      "a/.",
      "a/(1)",
    ]) {
      assert.equal(
        errorCode(() => matched(pattern)),
        "XTSE0340",
        pattern,
      );
    }
    assert.equal(matched("(: a (: b :) :) .[self::a]"), "[a][a]");
    assert.equal(matched("fn:root()[doc]", "", xml), "[#]");
    assert.equal(
      errorCode(() => matched("a[current-merge-group()]")),
      "XTSE3470",
    );
    assert.equal(
      errorCode(() => matched("a[current-merge-key#0]")),
      "XTSE3500",
    );
    assert.equal(
      errorCode(() => matched("a[fn:current-merge-key()]")),
      "XTSE3500",
    );
    assert.equal(
      matched(
        "a[p:current-merge-key()]",
        '<xsl:function name="p:current-merge-key"><xsl:sequence select="true()"/></xsl:function>',
      ),
      "[a][a]",
    );
  });
});
