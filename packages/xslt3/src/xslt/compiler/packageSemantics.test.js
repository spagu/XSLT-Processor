import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errorCode, parse, run, stylesheet, XSL } from "../testing.test.js";
import {
  libraryP,
  main,
  pkg,
  runTop,
  topError,
  useP,
} from "./packageTesting.test.js";

describe("packages", () => {
  it("make undeclared modes private through xsl:expose", () => {
    const top = (visibility) =>
      `<xsl:package version="3.0" xmlns:xsl="${XSL}" declared-modes="no"><xsl:expose component="mode" names="*" visibility="${visibility}"/><xsl:template match="." mode="start"><ok/></xsl:template></xsl:package>`;
    const runMode = (visibility) =>
      run(top(visibility), null, {
        initialMode: "{}start",
        initialMatchSelection: [1],
      });
    assert.equal(
      errorCode(() => runMode("private")),
      "XTDE0045",
    );
    assert.equal(runMode("public"), "<ok/>");
  });

  it("make the overriding templates of a stylesheet public", () => {
    const library = {
      "urn:p": libraryP(
        '<xsl:template name="t" visibility="public"><old/></xsl:template>',
      ),
    };
    const top = stylesheet(
      `${useP('<xsl:override><xsl:template name="t"><new/></xsl:template></xsl:override>')}`,
    );
    assert.equal(
      run(top, null, {
        resolvePackage: (name) => library[name],
        initialTemplate: "t",
      }),
      "<new/>",
    );
  });

  it("keep accumulators and attribute sets per package", () => {
    const library = {
      "urn:p": libraryP(
        `<xsl:accumulator name="ac" initial-value="0"><xsl:accumulator-rule match="*" select="$value + 1"/></xsl:accumulator>
         <xsl:template name="t" visibility="public"><xsl:variable name="d"><a><b/></a></xsl:variable><p>{$d//b/accumulator-after('ac')}</p></xsl:template>
         <xsl:attribute-set name="s" visibility="public" use-attribute-sets="t"/><xsl:attribute-set name="t" visibility="public"/>`,
        'expand-text="yes"',
      ),
    };
    const top = pkg(
      `${useP()}<xsl:accumulator name="ac" initial-value="0"><xsl:accumulator-rule match="*" select="$value - 1"/></xsl:accumulator>
       ${main('<xsl:variable name="d"><a><b/></a></xsl:variable>{$d//b/accumulator-after(\'ac\')}<xsl:call-template name="t"/>')}`,
      'expand-text="yes"',
    );
    assert.equal(runTop(top, library), "<out>-2<p>2</p></out>");
    const cyclic = pkg(
      `${useP('<xsl:override><xsl:attribute-set name="t" visibility="public" use-attribute-sets="s"/></xsl:override>')}
       ${main('<e xsl:use-attribute-sets="s"/>')}`,
    );
    assert.equal(topError(cyclic, library), "XTDE0640");
  });

  it("refuse a library that requires a global context item", () => {
    const library = {
      "urn:p": libraryP('<xsl:global-context-item use="required"/>'),
    };
    assert.equal(topError(pkg(`${useP()}${main("")}`), library), "XTTE0590");
  });
});

describe("static variables", () => {
  const modules = {
    "file:///s/a.xsl": stylesheet(
      '<xsl:variable name="p" static="yes" select="1"/>',
    ),
    "file:///s/b.xsl": stylesheet(
      '<xsl:variable name="p" static="yes" select="2"/>',
    ),
    "file:///s/c.xsl": stylesheet(
      '<xsl:param name="p" static="yes" select="1"/>',
    ),
  };
  const compileRun = (body) =>
    run(stylesheet(body, { attributes: 'expand-text="yes"' }), null, {
      baseUri: "file:///s/main.xsl",
      loadStylesheet: (uri) => modules[uri],
      initialTemplate: "main",
    });

  it("of imported modules are in scope after the import", () => {
    assert.equal(
      compileRun(
        '<xsl:import href="a.xsl"/><xsl:variable name="v" _select="{$p}"/><xsl:import href="a.xsl"/><xsl:template name="main"><r>{$v}</r></xsl:template>',
      ),
      "<r>1</r>",
    );
    assert.equal(
      compileRun(
        '<xsl:variable name="p" static="yes" select="5"/><xsl:import href="b.xsl"/><xsl:template name="main"><r>{$p}</r></xsl:template>',
      ),
      "<r>5</r>",
    );
  });

  it("must be consistent with earlier ones of lower precedence", () => {
    for (const body of [
      '<xsl:import href="a.xsl"/><xsl:import href="b.xsl"/><xsl:template name="main"/>',
      '<xsl:import href="a.xsl"/><xsl:variable name="p" static="yes" select="3"/><xsl:template name="main"/>',
      '<xsl:import href="c.xsl"/><xsl:variable name="p" static="yes" select="1"/><xsl:template name="main"/>',
    ]) {
      assert.equal(
        errorCode(() => compileRun(body)),
        "XTSE3450",
        body,
      );
    }
  });

  it("parse XML and build nodes", () => {
    assert.equal(
      compileRun(
        '<xsl:variable name="t" static="yes" select="parse-xml(\'&lt;a>&lt;b/>&lt;/a>\'), json-to-xml(\'[1]\')"/><xsl:template name="main"><r>{count($t//*)}</r></xsl:template>',
      ),
      "<r>4</r>",
    );
  });

  it("are used by shadow attributes on use-when and the module root", () => {
    const xsl = `<xsl:stylesheet xmlns:xsl="${XSL}" version="1.0" _version="{system-property('xsl:version')}"><xsl:variable name="V" static="yes" select="3"/>
      <xsl:template name="main" _use-when="$V = {'3'}"><xsl:value-of select="1 to 3"/></xsl:template>
      <xsl:template name="main" _use-when="$V = {'4'}">4</xsl:template></xsl:stylesheet>`;
    assert.equal(run(xsl, null, { initialTemplate: "main" }), "1 2 3");
  });
});

describe("global variables", () => {
  it("compile without their own name in scope", () => {
    assert.equal(
      errorCode(() =>
        run(
          stylesheet(
            '<xsl:variable name="a" select="$a"/><xsl:template match="/"/>',
          ),
        ),
      ),
      "XPST0008",
    );
    assert.ok(parse("<x/>"));
  });
});
