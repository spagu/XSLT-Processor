/**
 * Applying `<?xml-stylesheet?>` in an XML document the browser left
 * unstyled (Chrome without XSLT): finding the instruction, fetching and
 * applying the stylesheet, replacing the document element, re-creating
 * scripts, and the cases where nothing must happen.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { setTimeout as delay } from "node:timers/promises";
import { JSDOM } from "jsdom";
import {
  applyXmlStylesheet,
  autoApplyXmlStylesheet,
  findXmlStylesheet,
  needsXmlStylesheet,
} from "./xmlStylesheet.js";

const XHTML = "http://www.w3.org/1999/xhtml";
const URL_OF_PAGE = "https://example.test/docs/page.xml";

const STYLESHEET = `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html"/>
  <xsl:template match="/">
    <html><head><title>T</title></head>
    <body><p id="out"><xsl:value-of select="count(//*)"/>:<xsl:value-of select="//item"/></p>
    <script type="text/javascript" data-x="1">window.ran = true;</script></body></html>
  </xsl:template>
</xsl:stylesheet>`;

/**
 * An XML document as a browser without XSLT shows it.
 *
 * @param {string} [pi] - The processing instruction line
 * @param {string} [body] - The document body
 * @returns {Document} The document
 */
function xmlDocument(
  pi = '<?xml-stylesheet type="text/xsl" href="../styles/page.xsl"?>',
  body = '<root><script xmlns="http://www.w3.org/1999/xhtml" src="lib.js"/><item>hello</item></root>',
) {
  return new JSDOM(`<?xml version="1.0"?>\n${pi}\n${body}`, {
    contentType: "application/xml",
    url: URL_OF_PAGE,
  }).window.document;
}

/**
 * A fetch stub serving one stylesheet URL.
 *
 * @param {string} [body] - Stylesheet text
 * @param {number} [status] - HTTP status
 * @returns {{fetch: Function, calls: string[]}} The stub and the URLs asked
 */
function fetchStub(body = STYLESHEET, status = 200) {
  const calls = [];
  return {
    calls,
    fetch: async (url) => {
      calls.push(url);
      return { ok: status === 200, status, text: async () => body };
    },
  };
}

describe("findXmlStylesheet", () => {
  it("reads href and type from the processing instruction", () => {
    assert.deepStrictEqual(findXmlStylesheet(xmlDocument()), {
      href: "../styles/page.xsl",
      type: "text/xsl",
    });
  });

  it("accepts single quotes and other XSLT media types", () => {
    const doc = xmlDocument(
      "<?xml-stylesheet href='s.xsl' type='application/xslt+xml'?>",
    );
    assert.strictEqual(findXmlStylesheet(doc).href, "s.xsl");
  });

  it("stops at an unquoted value and ignores a value without a name", () => {
    const unquoted = xmlDocument(
      '<?xml-stylesheet type="text/xsl" href=s.xsl?>',
    );
    assert.strictEqual(findXmlStylesheet(unquoted), null);
    const nameless = xmlDocument(
      `<?xml-stylesheet = "x" type="text/xsl" href="s.xsl"?>`,
    );
    assert.strictEqual(findXmlStylesheet(nameless).href, "s.xsl");
  });

  it("skips CSS, alternate and incomplete instructions", () => {
    const css = xmlDocument('<?xml-stylesheet type="text/css" href="s.css"?>');
    assert.strictEqual(findXmlStylesheet(css), null);
    const alternate = xmlDocument(
      '<?xml-stylesheet type="text/xsl" href="s.xsl" alternate="yes"?>',
    );
    assert.strictEqual(findXmlStylesheet(alternate), null);
    const noHref = xmlDocument('<?xml-stylesheet type="text/xsl"?>');
    assert.strictEqual(findXmlStylesheet(noHref), null);
    const other = xmlDocument("<?php echo 1 ?>");
    assert.strictEqual(findXmlStylesheet(other), null);
  });
});

describe("needsXmlStylesheet", () => {
  it("is true for an unstyled XML document with the instruction", () => {
    assert.strictEqual(needsXmlStylesheet(xmlDocument()), true);
  });

  it("is false without a document, for HTML, or for an XHTML page", () => {
    assert.strictEqual(needsXmlStylesheet(undefined), false);
    const html = new JSDOM("<!DOCTYPE html><p>x</p>").window.document;
    assert.strictEqual(needsXmlStylesheet(html), false);
    const xhtml = xmlDocument(
      '<?xml-stylesheet type="text/xsl" href="s.xsl"?>',
      `<html xmlns="${XHTML}"><body/></html>`,
    );
    assert.strictEqual(needsXmlStylesheet(xhtml), false);
    const none = xmlDocument("<?xml-stylesheet type='text/css' href='s.css'?>");
    assert.strictEqual(needsXmlStylesheet(none), false);
  });
});

describe("applyXmlStylesheet", () => {
  it("fetches the stylesheet relative to the document and renders the result", async () => {
    const doc = xmlDocument();
    const stub = fetchStub();
    assert.strictEqual(await applyXmlStylesheet(doc, stub), true);
    assert.deepStrictEqual(stub.calls, [
      "https://example.test/styles/page.xsl",
    ]);
    const root = doc.documentElement;
    assert.strictEqual(root.namespaceURI, XHTML);
    assert.strictEqual(root.localName, "html");
    // The script that loaded the library is not part of the source: 2
    // elements (root, item), not 3
    assert.strictEqual(doc.getElementById("out").textContent, "2:hello");
    assert.strictEqual(doc.title, "T");
  });

  it("re-creates the result's scripts in the document", async () => {
    const doc = xmlDocument();
    await applyXmlStylesheet(doc, fetchStub());
    const script = doc.getElementsByTagNameNS(XHTML, "script")[0];
    assert.strictEqual(script.ownerDocument, doc);
    assert.strictEqual(script.textContent, "window.ran = true;");
    assert.strictEqual(script.namespaceURI, XHTML);
    assert.strictEqual(script.getAttribute("data-x"), "1");
    assert.strictEqual(script.getAttribute("type"), "text/javascript");
  });

  it("does nothing for a document that needs no stylesheet", async () => {
    const stub = fetchStub();
    const html = new JSDOM("<!DOCTYPE html><p>x</p>").window.document;
    assert.strictEqual(await applyXmlStylesheet(html, stub), false);
    assert.deepStrictEqual(stub.calls, []);
  });

  it("reports a stylesheet that cannot be fetched or parsed", async () => {
    await assert.rejects(
      applyXmlStylesheet(xmlDocument(), fetchStub("", 404)),
      /page\.xsl answered 404/,
    );
    await assert.rejects(
      applyXmlStylesheet(xmlDocument(), fetchStub("<xsl:stylesheet")),
      /page\.xsl is not well-formed XML/,
    );
  });

  it("accepts a processor class of its own", async () => {
    let used = false;
    class Fake {
      async importStylesheetAsync() {
        used = true;
      }
      transformToDocument() {
        return new JSDOM("<!DOCTYPE html><p>fake</p>").window.document;
      }
    }
    const doc = xmlDocument();
    await applyXmlStylesheet(doc, { ...fetchStub(), Processor: Fake });
    assert.strictEqual(used, true);
    assert.strictEqual(doc.documentElement.textContent, "fake");
  });
});

describe("autoApplyXmlStylesheet", () => {
  it("applies the stylesheet when the document is parsed", async () => {
    const doc = xmlDocument();
    Object.defineProperty(doc, "readyState", { value: "complete" });
    const stub = fetchStub();
    const original = globalThis.fetch;
    globalThis.fetch = stub.fetch;
    try {
      autoApplyXmlStylesheet(doc);
      await delay(50);
    } finally {
      globalThis.fetch = original;
    }
    assert.strictEqual(doc.documentElement.localName, "html");
  });

  it("waits for DOMContentLoaded while the document is loading", async () => {
    const doc = xmlDocument();
    Object.defineProperty(doc, "readyState", { value: "loading" });
    const stub = fetchStub();
    const original = globalThis.fetch;
    globalThis.fetch = stub.fetch;
    try {
      autoApplyXmlStylesheet(doc);
      assert.deepStrictEqual(stub.calls, []);
      doc.dispatchEvent(new doc.defaultView.Event("DOMContentLoaded"));
      await delay(50);
    } finally {
      globalThis.fetch = original;
    }
    assert.strictEqual(stub.calls.length, 1);
    assert.strictEqual(doc.documentElement.localName, "html");
  });

  it("leaves the document alone and logs when applying fails", async () => {
    const doc = xmlDocument();
    const original = globalThis.fetch;
    const errors = [];
    const consoleError = console.error;
    globalThis.fetch = fetchStub("", 500).fetch;
    console.error = (...args) => errors.push(args.join(" "));
    try {
      autoApplyXmlStylesheet(doc);
      await delay(50);
    } finally {
      globalThis.fetch = original;
      console.error = consoleError;
    }
    assert.strictEqual(doc.documentElement.localName, "root");
    assert.match(errors[0], /could not apply the stylesheet/);
  });

  it("does nothing for an HTML document", () => {
    const html = new JSDOM("<!DOCTYPE html><p>x</p>").window.document;
    autoApplyXmlStylesheet(html);
    assert.strictEqual(html.documentElement.localName, "html");
  });
});
