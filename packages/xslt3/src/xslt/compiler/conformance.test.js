import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkBodies,
  errorCode,
  parse,
  run,
  stylesheet,
} from "../testing.test.js";
import { yesNo } from "./attributes.js";

/**
 * The error code of compiling and running declarations.
 * @param {string} declarations
 * @param {object} [options]
 * @returns {string}
 */
const declarationsError = (declarations, options = {}, runOptions = {}) =>
  errorCode(() =>
    run(
      stylesheet(`${declarations}<xsl:template match="/"/>`, options),
      "<doc/>",
      runOptions,
    ),
  );

describe("static checks of attribute values", () => {
  it("accept only the enumerated values", () => {
    checkBodies([
      ['<xsl:copy-of select="." copy-namespaces="Yes"/>', "XTSE0020"],
      ['<xsl:element name="e" inherit-namespaces="01"/>', "XTSE0020"],
      ['<xsl:element name="e" validation="strict"/>', "XTSE1660"],
      [
        '<out><xsl:element name="e" validation="lax"/></out>',
        "<out><e/></out>",
      ],
      ['<xsl:element name="e" default-validation="lax"/>', "XTSE0020"],
      ['<xsl:element name="e" default-validation="strict"/>', "XTSE1660"],
      ['<xsl:element name="e" type="xs:untyped"/>', "XTSE1660"],
      ['<out xsl:type="xs:untyped"/>', "XTSE1660"],
      ['<out xsl:validation="strict"/>', "XTSE1660"],
      ['<out xsl:validation="lax"/>', "<out/>"],
      [
        '<xsl:for-each select="1"><xsl:sort select="." stable="maybe"/></xsl:for-each>',
        "XTSE0020",
      ],
      [
        '<xsl:for-each select="1"><xsl:sort/><xsl:sort stable="yes"/></xsl:for-each>',
        "XTSE1017",
      ],
      [
        '<out><xsl:for-each select="1"><xsl:sort stable="{\'yes\'}"/>.</xsl:for-each></out>',
        "<out>.</out>",
      ],
      ['<xsl:number value="1" start-at="1..2"/>', "XTSE0020"],
      ['<xsl:variable name="v" static="yes" select="1"/>', "XTSE0020"],
      ['<xsl:variable name="v" static="" select="1"/>', "XTSE0020"],
      ['<xsl:copy-of select="."><x/></xsl:copy-of>', "XTSE0260"],
      ["<out><xsl:next-match><xsl:fallback/></xsl:next-match></out>", "<out/>"],
      ["<xsl:apply-imports><xsl:fallback/></xsl:apply-imports>", "XTSE0010"],
      [
        '<xsl:analyze-string select="1" regex="1"><xsl:fallback/><xsl:fallback/></xsl:analyze-string>',
        "XTSE1130",
      ],
      [
        '<xsl:value-of><xsl:fallback xsl:use-when="true()"/></xsl:value-of>',
        "XTSE0090",
      ],
    ]);
    const element = parse('<e a="maybe"/>').documentElement;
    assert.equal(
      errorCode(() => yesNo(element, "a", false)),
      "XTSE0020",
    );
  });

  it("check declarations", () => {
    const fn = (attributes, param = "") =>
      `<xsl:function name="p:f" xmlns:p="urn:p" ${attributes}><xsl:param name="x" ${param}/></xsl:function>`;
    assert.equal(declarationsError(fn("", 'tunnel="yes"')), "XTSE0020");
    assert.equal(declarationsError(fn("", 'required="no"')), "XTSE0020");
    assert.equal(
      declarationsError(fn('override="no" override-extension-function="1"')),
      "XTSE0020",
    );
    assert.equal(
      declarationsError(
        '<xsl:param name="s" static="yes" select="1"><x/></xsl:param>',
      ),
      "XTSE0620",
    );
    assert.equal(
      declarationsError('<xsl:param name="s" static="yes"><x/></xsl:param>'),
      "XTSE0010",
    );
    assert.equal(
      declarationsError(
        '<xsl:variable name="s" static="yes" select="1" visibility="final"/>',
      ),
      "XTSE0020",
    );
    assert.equal(
      declarationsError(
        '<xsl:param name="s" static="yes" required="yes" select="1"/>',
      ),
      "XTSE0010",
    );
    assert.equal(
      declarationsError(
        '<xsl:key name="k" match="a" use="1" collation="urn:none"/>',
      ),
      "XTSE1210",
    );
    assert.equal(
      declarationsError(
        '<xsl:key name="k" match="a" use="1" composite="yes"/><xsl:key name="k" match="b" use="1"/>',
      ),
      "XTSE1222",
    );
    assert.equal(
      declarationsError(
        '<xsl:mode name="m" on-no-match="fail"/><xsl:mode name="m" on-no-match="deep-copy"/>',
      ),
      "XTSE0545",
    );
    assert.equal(
      declarationsError('<xsl:mode name="m" warning-on-no-match="Yes"/>'),
      "XTSE0020",
    );
    assert.equal(
      declarationsError('<xsl:mode name="m" typed="strict"/>'),
      "XTSE1660",
    );
    assert.equal(
      declarationsError('<xsl:output method="your::xml"/>'),
      "XTSE1570",
    );
    assert.equal(
      declarationsError('<xsl:output method="html" html-version="five"/>'),
      "XTSE0020",
    );
    assert.equal(
      declarationsError("<xsl:global-context-item/><xsl:global-context-item/>"),
      "XTSE3087",
    );
    assert.equal(
      declarationsError(
        '<xsl:include href="g.xsl"/><xsl:global-context-item use="required"/>',
        {},
        {
          loadStylesheet: () =>
            stylesheet('<xsl:global-context-item as="node()"/>'),
        },
      ),
      "XTSE3087",
    );
    assert.equal(
      declarationsError('<xsl:global-context-item use="absent" as="node()"/>'),
      "XTSE3089",
    );
    assert.equal(
      declarationsError(
        '<xsl:template name="t"><xsl:context-item as="item()*"/></xsl:template>',
      ),
      "XTSE0020",
    );
    assert.equal(
      declarationsError(
        '<xsl:template name="t"><xsl:context-item use="absent" as="item()"/></xsl:template>',
      ),
      "XTSE3088",
    );
    assert.equal(
      declarationsError("", { attributes: 'expand-text="maybe"' }),
      "XTSE0020",
    );
    assert.equal(
      declarationsError("", { attributes: 'extension-element-prefixes="xs"' }),
      "XTSE0085",
    );
  });

  it("accept consistent declarations", () => {
    const xsl = stylesheet(
      '<xsl:mode name="m" on-no-match="fail"/><xsl:mode name="m" on-no-match="fail"/>' +
        '<xsl:import href="low.xsl"/><xsl:global-context-item use="optional"/>' +
        '<xsl:template match="/"><out><xsl:apply-templates select="1" mode="m"/></out></xsl:template>' +
        '<xsl:template match="." mode="m">one</xsl:template>',
      { version: "+3.0" },
    );
    const low = stylesheet(
      '<xsl:mode name="n" on-no-match="fail"/><xsl:mode name="n" on-no-match="deep-copy"/>',
    );
    const loadStylesheet = () => low;
    assert.equal(
      errorCode(() => run(xsl, "<doc/>", { loadStylesheet })),
      "XTSE0545",
    );
    const settled = xsl.replace(
      "<xsl:import",
      '<xsl:mode name="n" on-no-match="fail"/><xsl:import',
    );
    assert.equal(run(settled, "<doc/>", { loadStylesheet }), "<out>one</out>");
  });
});
