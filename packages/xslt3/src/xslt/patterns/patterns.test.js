import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errorCode, run, stylesheet } from "../testing.test.js";

const xml =
  '<doc xmlns:p="urn:p"><a i="1">t</a><a i="2"/><p:b i="3"><a/></p:b><!--c--><?pi d?><?other?></doc>';

/**
 * The nodes a pattern matches, among every node of a document.
 * @param {string} pattern
 * @param {string} [source]
 * @param {string} [declarations]
 * @returns {string} names of the matched nodes, "#" for the document
 */
function matched(pattern, source = xml, declarations = "") {
  const xsl = stylesheet(
    `${declarations}<xsl:mode name="m" on-no-match="deep-skip"/>` +
      '<xsl:template match="/"><xsl:apply-templates select="(/, //node(), //@*, //namespace::p)" mode="m"/></xsl:template>' +
      `<xsl:template match="${pattern}" mode="m">[<xsl:value-of select="if (. instance of document-node()) then '#' else name()"/>]</xsl:template>`,
    { attributes: 'xmlns:p="urn:p"', exclude: "p" },
  );
  return run(xsl, source);
}

/**
 * The template chosen among rules without priorities.
 * @param {string[]} patterns
 * @param {string} select - Node to apply templates to
 * @returns {string} the index of the rule chosen
 */
function chosen(patterns, select) {
  const rules = patterns
    .map(
      (pattern, i) =>
        `<xsl:template match="${pattern}" mode="m">${i}</xsl:template>`,
    )
    .join("");
  return run(
    stylesheet(
      `<xsl:template match="/"><xsl:apply-templates select="${select}" mode="m"/></xsl:template>${rules}`,
      { attributes: 'xmlns:p="urn:p"' },
    ),
    xml,
  );
}

describe("patterns", () => {
  it("match path patterns", () => {
    const cases = [
      ["a", "[a][a][a]"],
      ["doc/a", "[a][a]"],
      ["/doc/a", "[a][a]"],
      ["//a", "[a][a][a]"],
      ["doc//a", "[a][a][a]"],
      ["p:b/a", "[a]"],
      ["/", "[#]"],
      ["@i", "[i][i][i]"],
      ["a/@i", "[i][i]"],
      ["text()", "[]"],
      ["comment() | processing-instruction('pi')", "[][pi]"],
      ["namespace::p", "[p][p][p][p][p]"],
      ["self::a", "[a][a][a]"],
      ["document-node()", "[#]"],
      ["document-node(element(doc))", "[#]"],
      ["child::document-node()", ""],
      ["*:b", "[p:b]"],
      ["p:*", "[p:b]"],
      ["Q{urn:p}*", "[p:b]"],
      ["element(a) except a[@i]", "[a]"],
      ["a intersect *[@i = '2']", "[a]"],
      ["(a|p:b) except a", "[p:b]"],
    ];
    for (const [pattern, expected] of cases) {
      assert.equal(matched(pattern), expected, pattern);
    }
  });

  it("evaluate predicates among siblings", () => {
    const cases = [
      ["a[2]", "[a]"],
      ["a[last()]", "[a][a]"],
      ["a[position() = 1][@i]", "[a]"],
      ["@*[1]", "[i][i][i]"],
      ["a[@i = '1']", "[a]"],
      ["a[. = current()]", "[a][a][a]"],
      ["*[xs:integer(@i) gt 1]", "[a][p:b]"],
    ];
    for (const [pattern, expected] of cases) {
      assert.equal(matched(pattern), expected, pattern);
    }
    assert.equal(
      run(
        stylesheet(
          '<xsl:template match="/"><xsl:variable name="e" as="element()"><e/></xsl:variable><xsl:apply-templates select="$e"/></xsl:template><xsl:template match="e[1]">first</xsl:template>',
        ),
      ),
      "first",
    );
  });

  it("match rooted patterns", () => {
    const keys = '<xsl:key name="k" match="a" use="@i"/>';
    assert.equal(matched("key('k', '2')", xml, keys), "[a]");
    assert.equal(matched("key('k', '1')//text()", xml, keys), "[]");
    assert.equal(
      matched("$v/a", xml, '<xsl:variable name="v" select="/doc"/>'),
      "[a][a]",
    );
    assert.equal(matched("doc('none')", xml), "");
  });

  it("match items with predicate patterns", () => {
    assert.equal(
      run(
        stylesheet(
          '<xsl:template match="/"><xsl:apply-templates select="1, 2, \'x\'"/></xsl:template>' +
            '<xsl:template match=".[. instance of xs:integer]">i</xsl:template><xsl:template match=".">o</xsl:template>',
        ),
      ),
      "iio",
    );
  });

  it("have default priorities", () => {
    const cases = [
      [["node()", "*", "p:*", "p:b"], "doc/p:b", "3"],
      [["*", "*:b"], "doc/p:b", "1"],
      [
        ["element()", "element(p:b)", "element(p:b, xs:untyped)"],
        "doc/p:b",
        "2",
      ],
      [["element(*, xs:untyped)", "element()"], "doc/a[1]", "0"],
      [["attribute()", "attribute(i)"], "doc/a[1]/@i", "1"],
      [
        ["processing-instruction()", "processing-instruction('pi')"],
        "doc/processing-instruction('pi')",
        "1",
      ],
      [["document-node(element(doc))", "document-node()"], "/", "0"],
      [["a", "a[1]"], "doc/a[1]", "1"],
      [["a", "doc/a"], "doc/a[1]", "1"],
      [["a", "node()", "text()"], "doc/a[1]/text()", "2"],
    ];
    for (const [patterns, select, expected] of cases) {
      assert.equal(chosen(patterns, select), expected, patterns.join(" "));
    }
  });

  it("are checked", () => {
    for (const pattern of [
      "1 +",
      "a/b()",
      "count(a)",
      "descendant::a",
      "a/key('k', 1)",
    ]) {
      assert.equal(
        errorCode(() => matched(pattern)),
        "XTSE0340",
        pattern,
      );
    }
  });

  it("match parentless nodes and temporary trees", () => {
    const xsl = stylesheet(
      '<xsl:template match="/"><xsl:variable name="e" as="element()"><a><b/></a></xsl:variable><xsl:variable name="t"><a/></xsl:variable>' +
        '<xsl:apply-templates select="$e, $e/b, $t" mode="m"/></xsl:template>' +
        '<xsl:template match="//a" mode="m">abs</xsl:template><xsl:template match="x//b" mode="m">x</xsl:template>' +
        '<xsl:template match="b" mode="m" priority="-1">b</xsl:template><xsl:template match="/" mode="m">doc</xsl:template>',
    );
    assert.equal(run(xsl), "bbdoc");
  });

  it("make one rule of a union with a priority", () => {
    const xsl = stylesheet(
      '<xsl:template match="/"><xsl:apply-templates select="doc/a[1]"/></xsl:template>' +
        '<xsl:template match="a | element(a)" priority="1">1<xsl:next-match/></xsl:template>' +
        '<xsl:template match="a | b">2<xsl:next-match/></xsl:template>' +
        '<xsl:template match="node()" priority="-9">3</xsl:template>',
    );
    assert.equal(run(xsl, xml), "123");
  });

  it("treat dynamic errors as non-matches", () => {
    assert.equal(matched("a[xs:integer('x') = 1]"), "");
    assert.equal(matched("a[error()]"), "");
  });
});
