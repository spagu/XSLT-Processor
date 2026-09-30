/**
 * DOM implementations of the command line tool (bin/lib/dom.js): jsdom by
 * default, @xmldom/xmldom when jsdom is missing or `XSLT_DOM=xmldom`.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import {
  DOM_IMPLEMENTATIONS,
  DOM_MISSING_MESSAGE,
  installDomGlobals,
  loadDomEnvironment,
} from "../bin/lib/dom.js";
import { createDomEnvironment, parseDocument } from "../bin/lib/transform.js";

/** A rejection like the one of `import()` for a package that is not installed. */
const missing = (code = "ERR_MODULE_NOT_FOUND") =>
  Promise.reject(Object.assign(new Error("Cannot find package"), { code }));

describe("loadDomEnvironment", () => {
  it("prefers jsdom", async () => {
    const dom = await loadDomEnvironment();
    assert.strictEqual(dom.name, "jsdom");
    assert.strictEqual(dom.window.document.contentType, "text/html");
    assert.deepStrictEqual(DOM_IMPLEMENTATIONS, ["jsdom", "xmldom"]);
  });

  it("loads xmldom by name, with an empty XML document", async () => {
    const dom = await loadDomEnvironment("xmldom");
    assert.strictEqual(dom.name, "xmldom");
    assert.strictEqual(dom.window.document.documentElement, null);
    const doc = new dom.window.DOMParser().parseFromString(
      "<r/>",
      "application/xml",
    );
    assert.strictEqual(
      new dom.window.XMLSerializer().serializeToString(doc),
      "<r/>",
    );
  });

  it("falls back to xmldom when jsdom is not installed", async () => {
    const xmldom = await import("@xmldom/xmldom");
    const dom = await loadDomEnvironment(undefined, {
      jsdom: () => missing("MODULE_NOT_FOUND"),
      xmldom: () => Promise.resolve(xmldom),
    });
    assert.strictEqual(dom.name, "xmldom");
  });

  it("explains how to install a DOM when none is installed", async () => {
    await assert.rejects(
      loadDomEnvironment(undefined, { jsdom: missing, xmldom: missing }),
      (error) =>
        error.message === DOM_MISSING_MESSAGE &&
        error.cause.code === "ERR_MODULE_NOT_FOUND",
    );
    await assert.rejects(
      loadDomEnvironment("jsdom", { jsdom: missing }),
      (error) => error.message === DOM_MISSING_MESSAGE,
    );
  });

  it("rethrows other loading errors unchanged", async () => {
    const broken = new SyntaxError("broken module");
    await assert.rejects(
      loadDomEnvironment(undefined, { jsdom: () => Promise.reject(broken) }),
      (error) => error === broken,
    );
  });

  it("rejects unknown implementations", async () => {
    await assert.rejects(
      loadDomEnvironment("linkedom"),
      /Unknown DOM implementation "linkedom": expected jsdom or xmldom/,
    );
  });
});

describe("the xmldom DOMParser", () => {
  let DOMParser;

  before(async () => {
    ({ DOMParser } = (await loadDomEnvironment("xmldom")).window);
  });

  it("reports malformed XML in a parsererror document, as browsers do", () => {
    const doc = new DOMParser().parseFromString("<r>", "application/xml");
    assert.strictEqual(doc.documentElement.nodeName, "parsererror");
    assert.match(doc.documentElement.textContent, /unclosed/);
    const undeclared = new DOMParser().parseFromString(
      "<p:r/>",
      "application/xml",
    );
    assert.strictEqual(undeclared.documentElement.nodeName, "parsererror");
  });

  it("rejects the malformed markup xmldom only warns about", () => {
    for (const markup of ["<r a=1/>", '<r a="1"b="2"/>']) {
      const doc = new DOMParser().parseFromString(markup, "application/xml");
      assert.strictEqual(doc.documentElement.nodeName, "parsererror", markup);
    }
    const replacement = new DOMParser().parseFromString(
      "<r>\uFFFD</r>",
      "application/xml",
    );
    assert.strictEqual(replacement.documentElement.textContent, "\uFFFD");
  });

  it("reports an invalid MIME type in a parsererror document", () => {
    const doc = new DOMParser().parseFromString("<r/>", "text/plain");
    assert.strictEqual(doc.documentElement.nodeName, "parsererror");
    assert.match(doc.documentElement.textContent, /text\/plain/);
  });

  it("parses text/html leniently", () => {
    const doc = new DOMParser().parseFromString(
      "<html><body><p>a<br>b</p></body></html>",
      "text/html",
    );
    assert.strictEqual(doc.getElementsByTagName("p")[0].textContent, "ab");
  });
});

describe("CLI DOM selection", () => {
  const saved = {};

  before(() => {
    for (const key of ["document", "DOMParser", "XMLSerializer"]) {
      saved[key] = globalThis[key];
    }
  });

  after(() => {
    Object.assign(globalThis, saved);
  });

  it("uses the implementation named by the argument", async () => {
    const dom = await createDomEnvironment("xmldom");
    assert.strictEqual(dom.name, "xmldom");
    assert.strictEqual(globalThis.DOMParser, dom.window.DOMParser);
    assert.throws(
      () => parseDocument(dom, "<r>", "XML"),
      /Error parsing XML: unclosed/,
    );
  });

  it("installs the globals of an environment", () => {
    const window = { document: {}, DOMParser: class {}, XMLSerializer: null };
    assert.strictEqual(installDomGlobals({ window }).window, window);
    assert.strictEqual(globalThis.document, window.document);
  });
});
