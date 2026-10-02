import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { loadTradik } from "./tradik.js";
import { createFixture, removeFixture } from "../../../test/fixtures.js";
import { loadForTests } from "../../../test/library.js";
import { SAMPLE_PROJECT } from "../../../test/sample.js";

const XSL = 'xmlns:xsl="http://www.w3.org/1999/XSL/Transform"';

describe("the Tradik engine", () => {
  let dir;
  let engine;

  before(async () => {
    dir = await createFixture({
      ...SAMPLE_PROJECT,
      "x/main.xsl": `<xsl:stylesheet version="1.0" ${XSL}><xsl:include href="part.xsl"/><xsl:param name="who"/><xsl:template match="/"><r><xsl:call-template name="part"/><xsl:value-of select="$who"/><xsl:value-of select="count(document('gone.xml'))"/></r></xsl:template></xsl:stylesheet>`,
      "x/part.xsl": `<xsl:stylesheet version="1.0" ${XSL}><xsl:template name="part">part:</xsl:template></xsl:stylesheet>`,
      "x/bad.xml": "<a>",
    });
    engine = await loadTradik(dir, loadForTests);
  });

  after(() => removeFixture(dir));

  it("transforms a pair of the sample project", async () => {
    assert.equal(engine.name, "Tradik (xsltVersion: auto)");
    const output = await engine.transform(
      { xml: "public/invoice.xml", xsl: "styles/invoice.xsl", params: {} },
      dir,
    );
    assert.match(output, /<total>123\.00<\/total>/);
    const modern = await engine.transform(
      { xml: "public/catalog.xml", xsl: "styles/modern.xsl", params: {} },
      dir,
    );
    assert.match(modern, /<out>X<\/out>/);
  });

  it("follows includes, passes parameters, and loads document() quietly", async () => {
    const output = await engine.transform(
      { xml: "public/catalog.xml", xsl: "x/main.xsl", params: { who: "me" } },
      dir,
    );
    assert.match(output, /<r>part:me0<\/r>/);
  });

  it("fails with the parser's message", async () => {
    await assert.rejects(
      engine.transform(
        { xml: "x/bad.xml", xsl: "x/main.xsl", params: {} },
        dir,
      ),
      /x\/bad\.xml is not well-formed/,
    );
  });

  it("is null without the library or jsdom, and leaves auto mode without xslt3", async () => {
    assert.equal(await loadTradik(dir, async () => null), null);
    const fake = async (name) =>
      name === "jsdom"
        ? import("jsdom")
        : {
            default: {
              XSLTProcessor: {
                preload: () => Promise.reject(new Error("none")),
              },
            },
          };
    assert.equal((await loadTradik(dir, fake)).name, "Tradik");
  });
});
