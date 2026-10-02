import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, describe, it } from "node:test";
import { DOMImplementation } from "@xmldom/xmldom";

import * as engine from "../../src/index.js";
import { serialize } from "../../src/serialize/index.js";
import { parseAssertion } from "./assertionModel.mjs";
import { checkAssertion } from "./assertions.mjs";
import { createEngineAdapter } from "./engineAdapter.mjs";
import { asTree } from "./transformAdapter.mjs";
import { parseXml } from "./xmlUtil.mjs";

const XSL = "http://www.w3.org/1999/XSL/Transform";
const createDocument = () => new DOMImplementation().createDocument(null, null);

describe("raw results for the assertions", () => {
  it("become a tree when they are nodes", () => {
    const [a, b] = [parseXml("<a/>").documentElement, parseXml("<b/>")];
    assert.equal(asTree([a], createDocument).nodeType, 9);
    assert.equal(asTree([a, b.documentElement], createDocument).nodeType, 11);
    assert.deepEqual(asTree([], createDocument), []);
    assert.equal(asTree("x", createDocument), "x");
    const text = createDocument().createTextNode("t");
    assert.equal(asTree([text], createDocument).nodeType, 11);
  });
});

describe("transformations with resources", () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "raw-"));
    writeFileSync(join(dir, "d.xml"), '<d><e xml:id="x"/></d>');
    writeFileSync(join(dir, "t.txt"), "text");
    writeFileSync(
      join(dir, "main.xsl"),
      `<xsl:stylesheet version="3.0" xmlns:xsl="${XSL}" expand-text="yes">
        <xsl:output method="adaptive"/>
        <xsl:template name="xsl:initial-template">
          <xsl:sequence select="collection('c')/name(), unparsed-text('t.txt'), current-output-uri()"/>
        </xsl:template>
      </xsl:stylesheet>`,
    );
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("read collections, text and the output file of the environment", () => {
    const environment = {
      collections: [
        {
          uri: "c",
          sources: [
            { file: join(dir, "d.xml") },
            { file: `${join(dir, "d.xml")}#x` },
            { file: `${join(dir, "d.xml")}#none` },
          ],
          queries: [],
        },
      ],
      resources: [],
    };
    const result = createEngineAdapter(engine).transform(
      { stylesheets: [{ file: join(dir, "main.xsl") }], packages: [] },
      { environment, output: { path: join(dir, "out.xml") } },
      [],
    );
    assert.equal(
      serialize(result.value, { method: "adaptive" }),
      `""\n"e"\n"text"\n"${pathToFileURL(join(dir, "out.xml")).href}"`,
    );
  });
});

describe("assertions of the xslt30-test catalog", () => {
  const catalog = (xml) =>
    parseXml(
      `<test-set xmlns="http://www.w3.org/2012/10/xslt-test-catalog" xmlns:j="urn:j"><result>${xml}</result></test-set>`,
    ).getElementsByTagName("result")[0].firstChild;

  it("use the prefixes of the catalog", () => {
    const assertion = parseAssertion(catalog("<assert>/j:a</assert>"), "/");
    assert.deepEqual(assertion.namespaces, [{ prefix: "j", uri: "urn:j" }]);
  });

  it("find result documents by a relative URI", () => {
    const assertion = parseAssertion(
      catalog(
        '<assert-result-document uri="r.xml"><assert>true()</assert></assert-result-document>',
      ),
      "/",
    );
    const helpers = { test: () => true };
    const documents = new Map([["file:///out/r.xml", "doc"]]);
    assert.equal(
      checkAssertion(assertion, { resultDocuments: documents }, helpers).status,
      "pass",
    );
    assert.equal(
      checkAssertion(assertion, { resultDocuments: new Map() }, helpers).status,
      "fail",
    );
    assert.equal(checkAssertion(assertion, {}, helpers).status, "fail");
  });
});
