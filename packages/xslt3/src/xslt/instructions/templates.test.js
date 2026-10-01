import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errorCode, run, stylesheet } from "../testing.test.js";

const xml = '<doc><a x="1">A</a><b>B</b><!--c--><?p d?></doc>';

/**
 * Runs a stylesheet made of declarations.
 * @param {string} body
 * @param {string} [source]
 * @param {object} [options]
 * @returns {string}
 */
const runDeclarations = (body, source = xml, options = {}) =>
  run(
    stylesheet(body, {
      version: options.version,
      attributes: 'expand-text="yes"',
    }),
    source,
    options,
  );

describe("template rules", () => {
  it("apply the built-in rules", () => {
    assert.equal(runDeclarations(""), "AB");
    assert.equal(
      runDeclarations('<xsl:template match="b"><B/></xsl:template>'),
      "A<B/>",
    );
  });

  it("choose by priority, then precedence, then position", () => {
    const rules =
      '<xsl:template match="*">any</xsl:template>' +
      '<xsl:template match="a">a</xsl:template>' +
      '<xsl:template match="doc/a">doc/a</xsl:template>' +
      '<xsl:template match="a" priority="9">high</xsl:template>' +
      '<xsl:template match="/"><out><xsl:apply-templates select="doc/*"/></out></xsl:template>';
    assert.equal(runDeclarations(rules), "<out>highany</out>");
  });

  it("pass parameters and tunnel parameters", () => {
    const rules =
      '<xsl:template match="/"><xsl:apply-templates select="doc/a">' +
      '<xsl:with-param name="p" select="1"/><xsl:with-param name="t" select="2" tunnel="yes"/>' +
      "</xsl:apply-templates></xsl:template>" +
      '<xsl:template match="a"><xsl:param name="p"/><xsl:param name="q" select="$p + 1"/>' +
      "<a p='{$p}' q='{$q}'><xsl:call-template name='n'/></a></xsl:template>" +
      '<xsl:template name="n"><xsl:param name="t" tunnel="yes"/><xsl:param name="u" as="xs:integer?"/>' +
      "{$t}{count($u)}</xsl:template>";
    assert.equal(runDeclarations(rules), '<a p="1" q="2">20</a>');
  });

  it("check parameters", () => {
    const required =
      '<xsl:template match="/"><xsl:apply-templates select="doc"/></xsl:template>' +
      '<xsl:template match="doc"><xsl:param name="p" required="yes"/></xsl:template>';
    assert.equal(
      errorCode(() => runDeclarations(required)),
      "XTDE0700",
    );
    const typed =
      '<xsl:template match="/"><xsl:apply-templates select="doc"/></xsl:template>' +
      '<xsl:template match="doc"><xsl:param name="p" as="xs:integer"/></xsl:template>';
    assert.equal(
      errorCode(() => runDeclarations(typed)),
      "XTDE0610",
    );
    const wrong =
      '<xsl:template match="/"><xsl:apply-templates select="doc"><xsl:with-param name="p" select="\'x\'"/></xsl:apply-templates></xsl:template>' +
      '<xsl:template match="doc"><xsl:param name="p" as="xs:integer"/></xsl:template>';
    assert.equal(
      errorCode(() => runDeclarations(wrong)),
      "XTTE0590",
    );
    for (const [body, code] of [
      [
        '<xsl:template name="t"><xsl:param name="p"/><xsl:param name="p"/></xsl:template>',
        "XTSE0580",
      ],
      [
        '<xsl:template name="t"><xsl:param name="p" required="yes" select="1"/></xsl:template>',
        "XTSE0010",
      ],
      [
        '<xsl:template name="t">x<xsl:param name="p"/></xsl:template>',
        "XTSE0010",
      ],
      [
        '<xsl:template match="/"><xsl:call-template name="t"><xsl:with-param name="p"/><xsl:with-param name="p"/></xsl:call-template></xsl:template><xsl:template name="t"/>',
        "XTSE0670",
      ],
      [
        '<xsl:template match="/"><xsl:call-template name="t"><xsl:with-param name="p"/></xsl:call-template></xsl:template><xsl:template name="t"/>',
        "XTSE0680",
      ],
      [
        '<xsl:template match="/"><xsl:call-template name="t"/></xsl:template><xsl:template name="t"><xsl:param name="p" required="yes"/></xsl:template>',
        "XTSE0690",
      ],
      [
        '<xsl:template match="/"><xsl:call-template name="u"/></xsl:template>',
        "XTSE0650",
      ],
      [
        '<xsl:template match="/"><xsl:call-template name="t"><b/></xsl:call-template></xsl:template><xsl:template name="t"/>',
        "XTSE0010",
      ],
      ['<xsl:template name="t"/><xsl:template name="t"/>', "XTSE0660"],
      ["<xsl:template/>", "XTSE0500"],
      ['<xsl:template name="t" mode="m"/>', "XTSE0500"],
      ['<xsl:template match="a" priority="x"/>', "XTSE0530"],
      ['<xsl:template match="a" mode="#all m"/>', "XTSE0550"],
      ['<xsl:template match="a" mode="m m"/>', "XTSE0550"],
      ['<xsl:template match="a" mode="1"/>', "XTSE0550"],
      [
        '<xsl:template match="/"><xsl:apply-templates mode="a b"/></xsl:template>',
        "XTSE0550",
      ],
    ]) {
      assert.equal(
        errorCode(() => runDeclarations(body)),
        code,
        body,
      );
    }
  });

  it("use modes", () => {
    const rules =
      '<xsl:template match="/"><xsl:apply-templates select="doc" mode="m"/>|<xsl:apply-templates select="doc" mode="#unnamed"/></xsl:template>' +
      '<xsl:template match="doc" mode="m #default">m:<xsl:apply-templates mode="#current"/></xsl:template>' +
      '<xsl:template match="a" mode="#all">[a]</xsl:template>' +
      '<xsl:template match="b" mode="other">no</xsl:template>';
    assert.equal(runDeclarations(rules), "m:[a]B|m:[a]B");
    assert.equal(
      runDeclarations(
        '<xsl:template match="b" mode="x">X</xsl:template>',
        xml,
        {
          initialMode: "{}x",
          initialMatchSelection: [],
        },
      ),
      "",
    );
  });

  it("apply imported and next rules", () => {
    const rules =
      '<xsl:template match="/"><xsl:apply-templates select="doc/a"/></xsl:template>' +
      '<xsl:template match="a" priority="2">2<xsl:next-match><xsl:with-param name="p" select="1"/></xsl:next-match></xsl:template>' +
      '<xsl:template match="a"><xsl:param name="p"/>1:{$p}<xsl:next-match/></xsl:template>';
    assert.equal(runDeclarations(rules), "21:1A");
    assert.equal(
      errorCode(() =>
        runDeclarations(
          '<xsl:template match="/"><xsl:for-each select="doc"><xsl:next-match/></xsl:for-each></xsl:template>',
        ),
      ),
      "XTDE0560",
    );
  });

  it("check the items selected", () => {
    const xslt2 = { version: "2.0" };
    assert.equal(
      errorCode(() =>
        runDeclarations(
          '<xsl:template match="/"><xsl:apply-templates select="1"/></xsl:template>',
          xml,
          xslt2,
        ),
      ),
      "XTTE0520",
    );
    assert.equal(
      runDeclarations(
        '<xsl:template match="/"><xsl:apply-templates select="1, doc"/></xsl:template>',
      ),
      "1AB",
    );
    assert.equal(
      errorCode(() =>
        runDeclarations(
          '<xsl:template match="/"><xsl:for-each select="1"><xsl:apply-templates/></xsl:for-each></xsl:template>',
        ),
      ),
      "XTTE0510",
    );
    assert.equal(
      errorCode(() =>
        runDeclarations(
          '<xsl:template match="/"><xsl:apply-templates><b/></xsl:apply-templates></xsl:template>',
        ),
      ),
      "XTSE0010",
    );
  });

  it("accept a context item declaration", () => {
    assert.equal(
      runDeclarations(
        '<xsl:template match="/"><xsl:context-item as="document-node()" use="required"/>ok</xsl:template>',
      ),
      "ok",
    );
  });

  it("recurse deeply, and stop an endless recursion", () => {
    const rules =
      '<xsl:template match="/"><xsl:call-template name="r"><xsl:with-param name="n" select="20000"/></xsl:call-template></xsl:template>' +
      '<xsl:template name="r"><xsl:param name="n"/><xsl:if test="$n gt 0"><x><xsl:call-template name="r"><xsl:with-param name="n" select="$n - 1"/></xsl:call-template></x></xsl:if></xsl:template>';
    assert.equal(runDeclarations(rules).length, 20000 * 7 - 3);
    assert.equal(
      errorCode(() => runDeclarations(rules, xml, { maxDepth: 1000 })),
      "XTDE0000",
    );
  });

  it("check the result type", () => {
    const rules =
      '<xsl:template match="/"><out><xsl:call-template name="t"/></out></xsl:template>' +
      '<xsl:template name="t" as="xs:integer"><xsl:sequence select="1 + 1"/></xsl:template>';
    assert.equal(runDeclarations(rules), "<out>2</out>");
    assert.equal(
      errorCode(() => runDeclarations(rules.replace("1 + 1", "'x'"))),
      "XTTE0505",
    );
  });
});

describe("modes", () => {
  const modes = {
    "deep-copy": '<doc><a x="1">A</a><b>B</b><!--c--><?p d?></doc>',
    "shallow-copy": '<doc><a x="1">A</a><b>B</b><!--c--><?p d?></doc>',
    "deep-skip": "",
    "shallow-skip": "",
    "text-only-copy": "AB",
  };
  for (const [onNoMatch, expected] of Object.entries(modes)) {
    it(`on-no-match="${onNoMatch}"`, () => {
      assert.equal(
        runDeclarations(`<xsl:mode on-no-match="${onNoMatch}"/>`),
        expected,
      );
    });
  }

  it("fail without a matching rule or on several", () => {
    assert.equal(
      errorCode(() => runDeclarations('<xsl:mode on-no-match="fail"/>')),
      "XTDE0555",
    );
    assert.equal(
      errorCode(() =>
        runDeclarations(
          '<xsl:mode on-multiple-match="fail"/><xsl:template match="doc">1</xsl:template><xsl:template match="doc">2</xsl:template>',
        ),
      ),
      "XTDE0540",
    );
    assert.equal(
      runDeclarations(
        '<xsl:mode name="m" on-multiple-match="fail"/><xsl:template match="/"><xsl:apply-templates select="doc" mode="m"/></xsl:template><xsl:template match="doc" mode="m">1</xsl:template><xsl:template match="doc" mode="m" priority="-1">2</xsl:template><xsl:template match="b" mode="m" priority="1">3</xsl:template>',
      ),
      "1",
    );
    assert.equal(
      errorCode(() => runDeclarations('<xsl:mode on-no-match="none"/>')),
      "XTSE0020",
    );
  });

  it("chooses the last of equal rules", () => {
    assert.equal(
      runDeclarations(
        '<xsl:template match="doc">1</xsl:template><xsl:template match="doc">2</xsl:template>',
      ),
      "2",
    );
  });
});
