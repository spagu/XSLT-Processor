import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import * as engine from "../../src/index.js";
import { NotRunError } from "./assertions.mjs";
import { createEngineAdapter } from "./engineAdapter.mjs";
import { serialize } from "../../src/serialize/index.js";

const serializeXml = (value) =>
  serialize(value, { "omit-xml-declaration": true });
import { catalogName } from "./transformAdapter.mjs";
import { expandedName } from "./xsltCatalog.mjs";
import { parseXml } from "./xmlUtil.mjs";

const XSL = "http://www.w3.org/1999/XSL/Transform";

describe("the transform capability", () => {
  let dir;
  let main;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "transform-"));
    main = join(dir, "main.xsl");
    writeFileSync(
      main,
      `<xsl:stylesheet version="3.0" xmlns:xsl="${XSL}" xmlns:f="urn:f" exclude-result-prefixes="f" expand-text="yes">
        <xsl:include href="inc.xsl"/>
        <xsl:param name="p" select="0"/>
        <xsl:param name="s" static="yes" select="'default'"/>
        <xsl:template match="/"><out p="{$p}" s="{$s}" n="{name(*)}" d="{doc('extra.xml')/*/name()}" f="{doc('other.xml')/*/name()}"/>
          <xsl:message>m</xsl:message><xsl:result-document href="r.xml"><r/></xsl:result-document></xsl:template>
        <xsl:template name="t"><xsl:param name="a"/><xsl:param name="b" tunnel="yes"/><t a="{$a}" b="{$b}"/></xsl:template>
        <xsl:template match="x" mode="m"><m/></xsl:template>
        <xsl:function name="f:f"><xsl:param name="x"/><xsl:sequence select="$x + 1"/></xsl:function>
      </xsl:stylesheet>`,
    );
    writeFileSync(
      join(dir, "inc.xsl"),
      `<xsl:stylesheet version="3.0" xmlns:xsl="${XSL}"/>`,
    );
    writeFileSync(join(dir, "other.xml"), "<other/>");
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  const run = (input, params = [], stylesheet = { file: main }) =>
    createEngineAdapter(engine).transform(
      { stylesheets: [stylesheet], packages: [] },
      input,
      params,
    );

  it("runs a stylesheet on the environment's source", () => {
    const environment = {
      sources: [
        { role: ".", content: "<doc/>" },
        { role: "", content: "<extra/>", uri: "extra.xml" },
      ],
    };
    const result = run({ environment }, [
      { name: "p", select: "1 + 1" },
      { name: "s", select: "'static'", static: true },
      { name: "none" },
    ]);
    assert.equal(
      serializeXml(result.value),
      '<out p="2" s="static" n="doc" d="extra" f="other"/>',
    );
    assert.equal(result.messages.length, 1);
    assert.equal(serializeXml(result.resultDocuments.get("r.xml")), "<r/>");
  });

  it("calls initial templates, modes and functions", () => {
    const template = run({
      initialTemplate: {
        name: "t",
        params: [
          { name: "a", select: "1" },
          { name: "b", select: "2", tunnel: true },
        ],
      },
    });
    assert.equal(serializeXml(template.value), '<t a="1" b="2"/>');
    const mode = run({
      environment: {
        sources: [{ role: ".", content: "<doc><x/></doc>", select: "/doc/x" }],
      },
      initialMode: { name: "m" },
    });
    assert.equal(serializeXml(mode.value), "<m/>");
    const selection = run({
      environment: { sources: [{ role: ".", content: "<doc><x/></doc>" }] },
      initialMode: { name: "m", select: "//x" },
    });
    assert.equal(serializeXml(selection.value), "<m/>");
    const fn = run({
      initialFunction: {
        name: "Q{urn:f}f",
        params: [{ name: "x", select: "41" }],
      },
    });
    assert.equal(serializeXml(fn.value), "42");
  });

  it("does not run what it cannot", () => {
    const adapter = createEngineAdapter(engine);
    assert.throws(
      () => adapter.transform({ stylesheets: [], packages: [{}] }, {}, []),
      NotRunError,
    );
    assert.throws(() => run({}, [], {}), NotRunError);
    assert.throws(() => run({ initialTemplate: { name: "p:t" } }), NotRunError);
  });
});

describe("names of the catalog", () => {
  it("are expanded with the catalog's namespaces", () => {
    const element = parseXml(
      '<t xmlns:p="urn:p" a="p:x" b="q:y" c="z" d="Q{urn:d}d"/>',
      "t.xml",
    ).documentElement;
    assert.equal(expandedName(element, "p:x"), "Q{urn:p}x");
    assert.equal(expandedName(element, "q:y"), "q:y");
    assert.equal(expandedName(element, "z"), "z");
    assert.equal(expandedName(element, "Q{urn:d}d"), "Q{urn:d}d");
    assert.equal(expandedName(element, undefined), undefined);
    assert.equal(catalogName("Q{urn:p}x"), "{urn:p}x");
    assert.equal(catalogName("x"), "{}x");
    assert.equal(catalogName(undefined), undefined);
  });
});
