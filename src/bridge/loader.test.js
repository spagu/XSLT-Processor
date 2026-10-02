/**
 * The opt-in bridge to @tradik/xslt3: loading the engine (a failed import
 * is simulated with an injected importer) and choosing the XSLT version.
 */

import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert";
import {
  domEnvironment,
  parseXmlDocument as parseXML,
} from "../domEnvironment.test.js";
import { XSLTProcessor } from "../XSLTProcessor.js";
import {
  XSLT3_MISSING,
  loadXslt3,
  loadedXslt3,
  setXslt3Importer,
} from "./loader.js";
import { stylesheetVersion, usesXslt3, xsltVersionMode } from "./version.js";

const XSL = 'xmlns:xsl="http://www.w3.org/1999/XSL/Transform"';
const xsl20 = `<xsl:stylesheet version="2.0" ${XSL}><xsl:template match="/"><out/></xsl:template></xsl:stylesheet>`;
const xsl10 = `<xsl:stylesheet version="1.0" ${XSL}><xsl:template match="/"><one/></xsl:template></xsl:stylesheet>`;

/** An importer failing as `import()` does for a missing package. */
const missing = () =>
  Promise.reject(new Error("Cannot find package '@tradik/xslt3'"));

before(() => {
  globalThis.DOMParser = domEnvironment.window.DOMParser;
});

after(() => {
  delete globalThis.DOMParser;
});

afterEach(() => setXslt3Importer(null));

describe("loading @tradik/xslt3", () => {
  it("reports a missing package and tries again later", async () => {
    setXslt3Importer(missing);
    await assert.rejects(loadXslt3(), (error) => {
      assert.strictEqual(
        error.message,
        `Cannot load @tradik/xslt3: ${XSLT3_MISSING}`,
      );
      assert.match(error.cause.message, /Cannot find package/);
      return true;
    });
    assert.strictEqual(loadedXslt3(), null);
    const module = { compileStylesheet() {} };
    setXslt3Importer(async () => module);
    assert.strictEqual(await loadXslt3(), module);
  });

  it("imports once for concurrent and later calls", async () => {
    let calls = 0;
    const module = {};
    setXslt3Importer(async () => {
      calls += 1;
      return module;
    });
    const [first, second] = await Promise.all([loadXslt3(), loadXslt3()]);
    assert.strictEqual(first, module);
    assert.strictEqual(second, module);
    assert.strictEqual(await loadXslt3(), module);
    assert.strictEqual(loadedXslt3(), module);
    assert.strictEqual(calls, 1);
  });

  it("imports the real package by default (npm workspace)", async () => {
    const module = await loadXslt3();
    assert.strictEqual(typeof module.compileStylesheet, "function");
  });

  it("rejects XSLTProcessor.preload() with the install hint", async () => {
    setXslt3Importer(missing);
    await assert.rejects(
      XSLTProcessor.preload("2.0"),
      /install @tradik\/xslt3 to run XSLT 2\.0\/3\.0 stylesheets/,
    );
    assert.throws(() => XSLTProcessor.preload("1.0"), RangeError);
  });

  it("rejects importStylesheetAsync and keeps the previous stylesheet", async () => {
    setXslt3Importer(missing);
    const processor = new XSLTProcessor({ xsltVersion: "auto" });
    processor.importStylesheet(parseXML(xsl10));
    await assert.rejects(
      processor.importStylesheetAsync(xsl20),
      /Cannot load @tradik\/xslt3: install @tradik\/xslt3/,
    );
    assert.match(processor.transformToString(parseXML("<r/>")), /<one\/>/);
  });

  it("asks for preload() in the synchronous API", () => {
    setXslt3Importer(missing);
    const processor = new XSLTProcessor({ xsltVersion: "auto" });
    assert.throws(
      () => processor.importStylesheet(parseXML(xsl20)),
      /XSLT 2\.0 stylesheet needs @tradik\/xslt3: call "await XSLTProcessor\.preload\(\)"/,
    );
    assert.strictEqual(processor.engine, null);
  });

  it("never needs @tradik/xslt3 in the default 1.0 mode", async () => {
    setXslt3Importer(missing);
    const processor = new XSLTProcessor();
    await processor.importStylesheetAsync(xsl20);
    assert.match(processor.transformToString(parseXML("<r/>")), /<out\/>/);
  });
});

describe("xsltVersion", () => {
  it("accepts 1.0 and auto, 1.0 by default", () => {
    assert.strictEqual(xsltVersionMode(undefined), "1.0");
    assert.strictEqual(xsltVersionMode("auto"), "auto");
    assert.throws(() => xsltVersionMode("2.0"), RangeError);
    assert.throws(() => new XSLTProcessor({ xsltVersion: "3.0" }), {
      name: "RangeError",
      message: 'Invalid xsltVersion "3.0": expected "1.0" or "auto"',
    });
  });

  it("reads the version of stylesheets and simplified stylesheets", () => {
    assert.strictEqual(stylesheetVersion(parseXML(xsl20)), 2);
    assert.strictEqual(stylesheetVersion(parseXML(xsl10).documentElement), 1);
    const simplified = parseXML(`<out xsl:version=" 3.0 " ${XSL}/>`);
    assert.strictEqual(stylesheetVersion(simplified), 3);
    assert.ok(Number.isNaN(stylesheetVersion(parseXML("<out/>"))));
    const empty = parseXML("<a/>").implementation.createDocument(null, null);
    assert.ok(Number.isNaN(stylesheetVersion(empty)));
  });

  it("runs version 2.0 and above with @tradik/xslt3 in auto mode only", () => {
    assert.strictEqual(usesXslt3(parseXML(xsl20), "auto"), true);
    assert.strictEqual(usesXslt3(parseXML(xsl20), "1.0"), false);
    assert.strictEqual(usesXslt3(parseXML(xsl10), "auto"), false);
  });
});
