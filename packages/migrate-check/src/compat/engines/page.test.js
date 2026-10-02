import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { transformInPage } from "./page.js";
import { loadForTests } from "../../../test/library.js";

const XSL = 'xmlns:xsl="http://www.w3.org/1999/XSL/Transform"';
const sheet = (method, body) =>
  `<xsl:stylesheet version="1.0" ${XSL}><xsl:output method="${method}"/><xsl:template match="/">${body}</xsl:template></xsl:stylesheet>`;
const FILES = {
  "/doc.xml": "<doc><v>1</v></doc>",
  "/xml.xsl": sheet("xml", '<r><xsl:value-of select="//v"/></r>'),
  "/text.xsl": sheet("text", '<xsl:value-of select="//v"/>'),
  "/html.xsl": sheet(
    "html",
    '<html><body><p><xsl:value-of select="//v"/></p></body></html>',
  ),
  "/fail.xsl": sheet("xml", '<xsl:message terminate="yes">stop</xsl:message>'),
  "/bad.xml": "<a>",
};

describe("transformInPage (run here on jsdom and the library)", () => {
  const saved = {};

  before(async () => {
    const { XSLTProcessor } = await loadForTests("@tradik/xslt-processor");
    const { window } = new JSDOM("");
    Object.assign(saved, {
      window: globalThis.window,
      fetch: globalThis.fetch,
    });
    globalThis.document = window.document;
    globalThis.window = {
      XSLTProcessor,
      DOMParser: window.DOMParser,
      XMLSerializer: window.XMLSerializer,
    };
    globalThis.fetch = async (url) => ({
      ok: url in FILES,
      status: url in FILES ? 200 : 404,
      text: async () => FILES[url],
    });
  });

  after(() => Object.assign(globalThis, saved));

  it("serializes XML results, and text as text", async () => {
    const run = (xsl, textMethod = false) =>
      transformInPage({ xml: "/doc.xml", xsl, params: {}, textMethod });
    assert.match(await run("/xml.xsl"), /<r>1<\/r>/);
    assert.equal((await run("/text.xsl", true)).trim(), "1");
    assert.match(await run("/html.xsl"), /<p>1<\/p>/);
  });

  it("fails on a missing file, bad XML, an empty result or no XSLTProcessor", async () => {
    const run = (xml, xsl) =>
      transformInPage({ xml, xsl, params: { p: "1" }, textMethod: false });
    await assert.rejects(
      run("/gone.xml", "/xml.xsl"),
      /cannot load \/gone\.xml: 404/,
    );
    await assert.rejects(
      run("/bad.xml", "/xml.xsl"),
      /\/bad\.xml is not well-formed/,
    );
    const { error } = console;
    console.error = () => {};
    try {
      await assert.rejects(
        run("/doc.xml", "/fail.xsl"),
        /the transformation failed/,
      );
    } finally {
      console.error = error;
    }
    const { XSLTProcessor } = globalThis.window;
    globalThis.window.XSLTProcessor = undefined;
    await assert.rejects(
      run("/doc.xml", "/xml.xsl"),
      /no native XSLTProcessor/,
    );
    globalThis.window.XSLTProcessor = XSLTProcessor;
  });
});
