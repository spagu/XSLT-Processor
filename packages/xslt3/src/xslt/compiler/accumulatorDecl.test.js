import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errorCode, parse, run, stylesheet } from "../testing.test.js";

const xml = "<doc><chap><fig/><fig/></chap><chap><fig/></chap></doc>";

const figNr =
  '<xsl:accumulator name="f" as="xs:integer" initial-value="0">' +
  '<xsl:accumulator-rule match="chap" select="0"/>' +
  '<xsl:accumulator-rule match="fig" select="$value + 1"/></xsl:accumulator>' +
  '<xsl:accumulator name="w" initial-value="()" streamable="no">' +
  '<xsl:accumulator-rule match="*" phase="end"><xsl:sequence select="($value, name())"/></xsl:accumulator-rule></xsl:accumulator>';

/**
 * Runs declarations with templates in the unnamed mode.
 * @param {string} declarations
 * @param {string} [source]
 * @param {object} [options]
 * @returns {string}
 */
const runWith = (declarations, source = xml, options = {}) =>
  run(
    stylesheet(declarations, { attributes: 'expand-text="yes"' }),
    source,
    options,
  );

describe("accumulators", () => {
  it("give values before and after each node", () => {
    const xsl =
      figNr +
      '<xsl:mode use-accumulators="#all"/>' +
      '<xsl:template match="fig">[{accumulator-before("f")}]</xsl:template>' +
      "<xsl:template match=\"/\"><xsl:apply-templates/>{accumulator-after('w')}|{doc/chap[1]/accumulator-after('w')}</xsl:template>";
    assert.equal(
      runWith(xsl),
      "[1][2][1]fig fig chap fig chap doc|fig fig chap",
    );
  });

  it("apply to the trees allowed", () => {
    const template =
      '<xsl:template match="/">{(//fig)[last()]/accumulator-before("f")}</xsl:template>';
    // the source as initial match selection: those of the initial mode
    assert.equal(
      errorCode(() => runWith(figNr + template)),
      "XTDE3362",
    );
    assert.equal(
      runWith(figNr + '<xsl:mode use-accumulators="f"/>' + template),
      "1",
    );
    // the global context item: all, unless xsl:global-context-item says
    const named =
      '<xsl:template name="main">{(//fig)[last()]/accumulator-before("f")}</xsl:template>';
    assert.equal(runWith(figNr + named, xml, { initialTemplate: "main" }), "1");
    assert.equal(
      errorCode(() =>
        runWith(
          figNr + '<xsl:global-context-item use-accumulators="w"/>' + named,
          xml,
          { initialTemplate: "main" },
        ),
      ),
      "XTDE3362",
    );
    // other trees: all
    assert.equal(
      runWith(
        figNr +
          `<xsl:variable name="t"><a><fig/></a></xsl:variable>` +
          '<xsl:template match="/">{$t//fig/accumulator-before("f")}</xsl:template>',
      ),
      "1",
    );
    assert.equal(
      runWith(
        figNr +
          '<xsl:template match="/">{(copy-of(//chap[1]), snapshot(//chap[1]))//fig[2]/accumulator-before("f")}</xsl:template>' +
          '<xsl:mode use-accumulators="f"/>',
      ),
      "2 2",
    );
    assert.equal(
      runWith(
        figNr +
          '<xsl:template match="/"><xsl:variable name="c" as="element()"><xsl:copy-of select="//chap[1]" copy-accumulators="yes"/></xsl:variable>{$c/fig[2]/accumulator-before("f")}</xsl:template>' +
          '<xsl:mode use-accumulators="f"/>',
      ),
      "2",
    );
  });

  it("report errors when their values are used", () => {
    const failing =
      '<xsl:accumulator name="e" initial-value="0"><xsl:accumulator-rule match="fig" select="error()"/></xsl:accumulator>' +
      '<xsl:accumulator name="c" initial-value="0"><xsl:accumulator-rule match="fig" select="accumulator-before(\'c\')"/></xsl:accumulator>' +
      '<xsl:accumulator name="t" as="xs:integer" initial-value="0"><xsl:accumulator-rule match="fig" select="\'x\'"/></xsl:accumulator>' +
      '<xsl:mode use-accumulators="#all"/>';
    const at = (name, path) =>
      errorCode(() =>
        runWith(
          `${failing}<xsl:template match="/">{${path}/accumulator-before('${name}')}</xsl:template>`,
        ),
      );
    assert.equal(
      runWith(
        `${failing}<xsl:template match="/">{accumulator-before('e')}</xsl:template>`,
      ),
      "0",
    );
    assert.equal(at("e", "//fig[1]"), "FOER0000");
    assert.equal(at("e", "(//fig)[3]"), "FOER0000");
    assert.equal(at("c", "(//fig)[1]"), "XTDE3400");
    assert.equal(at("t", "(//fig)[1]"), "XPTY0004");
    assert.equal(at("x", "/"), "XTDE3340");
    assert.equal(
      errorCode(() =>
        runWith(
          `${failing}<xsl:template match="/">{(//fig/@*, doc/@*, 1)!accumulator-before('e')}</xsl:template>`,
          "<doc a='1'/>",
        ),
      ),
      "XTTE3360",
    );
    assert.equal(
      errorCode(() =>
        runWith(
          `${failing}<xsl:template match="/">{//chap!(1)!accumulator-before('e')}</xsl:template>`,
        ),
      ),
      "XTTE3360",
    );
    assert.equal(
      errorCode(() =>
        runWith(
          `${failing}<xsl:function name="Q{u}f"><xsl:sequence select="accumulator-before('e')"/></xsl:function><xsl:template match="/">{Q{u}f()}</xsl:template>`,
        ),
      ),
      "XTDE3350",
    );
  });

  it("are checked", () => {
    const check = (declarations) =>
      errorCode(() => runWith(`${declarations}<xsl:template match="/"/>`));
    const rule = '<xsl:accumulator-rule match="a" select="1"/>';
    assert.equal(
      check(`<xsl:accumulator name="a">${rule}</xsl:accumulator>`),
      "XTSE0010",
    );
    assert.equal(
      check('<xsl:accumulator name="a" initial-value="0"/>'),
      "XTSE0010",
    );
    assert.equal(
      check(
        `<xsl:accumulator name="a" initial-value="0"><a/></xsl:accumulator>`,
      ),
      "XTSE0010",
    );
    assert.equal(
      check(
        `<xsl:accumulator name="a" initial-value="0" streamable="No">${rule}</xsl:accumulator>`,
      ),
      "XTSE0020",
    );
    assert.equal(
      check(
        '<xsl:accumulator name="a" initial-value="0"><xsl:accumulator-rule match="a" phase="middle"/></xsl:accumulator>',
      ),
      "XTSE0020",
    );
    assert.equal(
      check(
        '<xsl:accumulator name="a" initial-value="0"><xsl:accumulator-rule match="a" select="1">2</xsl:accumulator-rule></xsl:accumulator>',
      ),
      "XTSE0010",
    );
    assert.equal(
      check(
        `<xsl:accumulator name="a" initial-value="0">${rule}</xsl:accumulator><xsl:accumulator name="a" initial-value="0">${rule}</xsl:accumulator>`,
      ),
      "XTSE3350",
    );
    assert.equal(
      check(
        `<xsl:accumulator name="a" initial-value="0">${rule}</xsl:accumulator><xsl:mode use-accumulators="a a"/>`,
      ),
      "XTSE3300",
    );
    assert.equal(check('<xsl:mode use-accumulators="b"/>'), "XTSE3300");
    assert.equal(check('<xsl:mode use-accumulators="#all a"/>'), "XTSE3300");
    assert.equal(
      check(
        `<xsl:accumulator name="a" initial-value="0">${rule}</xsl:accumulator><xsl:mode name="m" use-accumulators="a"/><xsl:mode name="m" use-accumulators="#all"/>`,
      ),
      "XTSE0545",
    );
    assert.equal(
      runWith(
        `<xsl:accumulator name="a" initial-value="0">${rule}</xsl:accumulator><xsl:mode use-accumulators="a"/><xsl:mode name="m"/><xsl:mode use-accumulators="a"/><xsl:template match="/">ok</xsl:template>`,
      ),
      "ok",
    );
    assert.equal(check("<xsl:mode><xsl:template/></xsl:mode>"), "XTSE0010");
  });

  it("follow import precedence", () => {
    const low = parse(
      stylesheet(
        '<xsl:accumulator name="a" initial-value="1"><xsl:accumulator-rule match="x" select="1"/></xsl:accumulator>' +
          '<xsl:accumulator name="a" initial-value="2"><xsl:accumulator-rule match="x" select="1"/></xsl:accumulator>' +
          '<xsl:mode name="m" use-accumulators="a"/><xsl:mode name="m" use-accumulators="#all"/>',
      ),
    );
    const xsl = stylesheet(
      '<xsl:import href="low.xsl"/>' +
        '<xsl:accumulator name="a" initial-value="3"><xsl:accumulator-rule match="x" select="1"/></xsl:accumulator>' +
        '<xsl:mode name="m" use-accumulators="a"/>' +
        '<xsl:template match="/" mode="m">{accumulator-before("a")}</xsl:template>',
      { attributes: 'expand-text="yes"' },
    );
    assert.equal(
      run(xsl, "<doc/>", {
        baseUri: "urn:main.xsl",
        loadStylesheet: () => low,
        initialMode: "{}m",
      }),
      "3",
    );
  });
});
