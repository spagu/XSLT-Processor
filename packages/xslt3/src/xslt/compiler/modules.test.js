import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileStylesheet } from "../api.js";
import {
  createDocument,
  errorCode,
  run,
  stylesheet,
  XSL,
} from "../testing.test.js";

/**
 * Runs a principal module that loads others from a map of URIs to text.
 * @param {string} principal
 * @param {Record<string, string>} modules
 * @param {string} [xml]
 * @returns {string}
 */
const runModules = (principal, modules, xml = "<doc><a/></doc>") =>
  run(principal, xml, {
    baseUri: "file:///m/main.xsl",
    loadStylesheet: (uri) => {
      const text = modules[uri.replace("file:///m/", "")];
      if (text === undefined) throw new Error(`no ${uri}`);
      return text;
    },
  });

describe("stylesheet modules", () => {
  it("import with lower precedence and include with the same", () => {
    const modules = {
      "low.xsl": stylesheet(
        '<xsl:template match="a">low<xsl:apply-imports/></xsl:template><xsl:template match="b">b</xsl:template>',
      ),
      "inc.xsl": stylesheet('<xsl:variable name="v" select="\'inc\'"/>'),
    };
    const principal = stylesheet(
      '<xsl:import href="low.xsl"/><xsl:include href="inc.xsl"/>' +
        '<xsl:template match="a">high({$v})<xsl:apply-imports/></xsl:template>',
      { attributes: 'expand-text="yes"' },
    );
    assert.equal(runModules(principal, modules), "high(inc)low");
  });

  it("include simplified and embedded modules", () => {
    const modules = {
      "simple.xsl": `<out xsl:version="2.0" xmlns:xsl="${XSL}"><xsl:value-of select="$g"/></out>`,
      "data.xml": `<root><x/><xsl:stylesheet id="e" version="2.0" xmlns:xsl="${XSL}"><xsl:variable name="g" select="1"/></xsl:stylesheet></root>`,
    };
    const principal = stylesheet(
      '<xsl:include href="simple.xsl"/><xsl:include href="data.xml#e"/>',
    );
    assert.equal(runModules(principal, modules), "<out>1</out>");
    assert.equal(
      errorCode(() =>
        runModules(stylesheet('<xsl:include href="data.xml#none"/>'), modules),
      ),
      "XTSE0165",
    );
  });

  it("are dropped by use-when on their root", () => {
    const modules = {
      "off.xsl": `<xsl:stylesheet version="3.0" use-when="false()" xmlns:xsl="${XSL}"><xsl:template match="a">off</xsl:template></xsl:stylesheet>`,
    };
    assert.equal(
      runModules(stylesheet('<xsl:include href="off.xsl"/>'), modules),
      "",
    );
  });

  it("report loading errors", () => {
    const self = stylesheet('<xsl:include href="main.xsl"/>');
    const imports = stylesheet('<xsl:import href="main.xsl"/>');
    const cases = [
      [stylesheet('<xsl:include href="none.xsl"/>'), {}, "XTSE0165"],
      [self, { "main.xsl": self }, "XTSE0180"],
      [imports, { "main.xsl": imports }, "XTSE0210"],
      [stylesheet("<xsl:include/>"), {}, "XTSE0010"],
      [
        stylesheet('<xsl:include href="x.xsl">text</xsl:include>'),
        {},
        "XTSE0260",
      ],
      [stylesheet('<xsl:include href="x.xsl" extra="1"/>'), {}, "XTSE0090"],
      [stylesheet('<xsl:include href="e.xsl"/>'), { "e.xsl": "" }, "XTSE0165"],
    ];
    for (const [principal, modules, code] of cases) {
      assert.equal(
        errorCode(() => runModules(principal, modules)),
        code,
        principal,
      );
    }
    assert.equal(
      errorCode(() => run(stylesheet('<xsl:include href="x.xsl"/>'))),
      "XTSE0165",
    );
  });

  it("must be stylesheets", () => {
    const cases = [
      [`<xsl:template xmlns:xsl="${XSL}"/>`, "XTSE0150"],
      ["<out/>", "XTSE0150"],
      [`<xsl:stylesheet xmlns:xsl="${XSL}"/>`, "XTSE0010"],
      [
        `<xsl:stylesheet version="2.0" xmlns:xsl="${XSL}">text</xsl:stylesheet>`,
        "XTSE0120",
      ],
      [
        `<xsl:stylesheet version="2.0" xmlns:xsl="${XSL}"><data/></xsl:stylesheet>`,
        "XTSE0130",
      ],
      [
        `<xsl:stylesheet version="2.0" bad="1" xmlns:xsl="${XSL}"/>`,
        "XTSE0090",
      ],
      [stylesheet("<xsl:if test='1'/>", { version: "2.0" }), "XTSE0010"],
      [stylesheet("<xsl:import-schema/>"), "XTSE1650"],
    ];
    for (const [text, code] of cases) {
      assert.equal(
        errorCode(() => run(text)),
        code,
        text,
      );
    }
    assert.equal(
      errorCode(() => compileStylesheet(createDocument())),
      "XTSE0150",
    );
  });

  it("ignore data elements and unknown declarations in forwards-compatible mode", () => {
    assert.equal(
      run(
        stylesheet(
          '<my:data xmlns:my="urn:my"/><xsl:future/><xsl:template match="/">ok</xsl:template>',
          {
            version: "4.0",
          },
        ),
      ),
      "ok",
    );
  });
});
