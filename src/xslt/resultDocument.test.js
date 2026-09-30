/**
 * transformToDocument() shaped like Chrome's (see resultDocument.js):
 * whitespace text around the document element, doctype nodes and HTML
 * documents for the html output method.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { compile, dom, parseXML, stylesheet } from "./harness.test.js";
import { fillXmlDocument, parseHtmlDocument } from "./resultDocument.js";

/**
 * Transform a source document to a document.
 *
 * @param {string} body - Top-level elements of the stylesheet
 * @param {string} xml - Source markup
 * @param {string} [method] - xsl:output method, none when null
 * @returns {Document} The result document
 */
function toDocument(body, xml, method = "xml") {
  const xsl = method
    ? stylesheet(body, method).replace(' omit-xml-declaration="yes"', "")
    : `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">${body}</xsl:stylesheet>`;
  return compile(xsl).transformToDocument(parseXML(xml));
}

const serialize = (node) =>
  new dom.window.XMLSerializer().serializeToString(node);

describe("transformToDocument with xml output", () => {
  it("drops whitespace text around the document element (general/bug-164)", () => {
    const doc = toDocument(
      '<xsl:template match="stuff"><xsl:copy-of select="."/></xsl:template>',
      "<root>\n  <stuff a='1'/>\n</root>",
    );
    assert.strictEqual(doc.childNodes.length, 1);
    assert.strictEqual(serialize(doc), '<stuff a="1"/>');
  });

  it("keeps comments and processing instructions at the document level", () => {
    const doc = toDocument(
      '<xsl:template match="/"> <xsl:comment>c</xsl:comment> <r/> <xsl:processing-instruction name="p">d</xsl:processing-instruction></xsl:template>',
      "<d/>",
    );
    assert.deepStrictEqual(
      Array.from(doc.childNodes, (node) => node.nodeType),
      [8, 1, 7],
    );
  });

  it("creates a document type node for doctype-public and doctype-system (general/bug-25-)", () => {
    const xsl = `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:output doctype-public="-//P//EN" doctype-system="s.dtd"/><xsl:template match="/"><doc/></xsl:template></xsl:stylesheet>`;
    const doc = compile(xsl).transformToDocument(parseXML("<d/>"));
    assert.strictEqual(doc.firstChild, doc.doctype);
    assert.deepStrictEqual(
      [doc.doctype.name, doc.doctype.publicId, doc.doctype.systemId],
      ["doc", "-//P//EN", "s.dtd"],
    );
  });

  it("creates a doctype from doctype-system alone, and none without a root", () => {
    const doc = parseXML("<x/>").implementation.createDocument(
      null,
      null,
      null,
    );
    const fragment = doc.createDocumentFragment();
    fragment.appendChild(doc.createElement("r"));
    fillXmlDocument(doc, fragment, { doctypeSystem: "r.dtd" });
    assert.deepStrictEqual(
      [doc.doctype.name, doc.doctype.publicId, doc.doctype.systemId],
      ["r", "", "r.dtd"],
    );
    const empty = parseXML("<x/>").implementation.createDocument(
      null,
      null,
      null,
    );
    fillXmlDocument(empty, empty.createDocumentFragment(), {
      doctypePublic: "p",
    });
    assert.strictEqual(empty.doctype, null);
  });
});

describe("transformToDocument with html output", () => {
  it("returns an HTML document parsed from the html output, like Chrome", () => {
    const doc = toDocument(
      '<xsl:template match="/"><html><head><title>t</title></head><body><p>x</p></body></html></xsl:template>',
      "<d/>",
      null,
    );
    assert.strictEqual(doc.contentType, "text/html");
    assert.ok(doc.body.firstChild instanceof dom.window.HTMLParagraphElement);
    assert.strictEqual(doc.title, "t");
    assert.strictEqual(
      doc.head.firstChild.getAttribute("http-equiv"),
      "Content-Type",
    );
  });

  it("parses without a DOMParser through an HTML document of the implementation", () => {
    const saved = globalThis.DOMParser;
    delete globalThis.DOMParser;
    try {
      const doc = parseHtmlDocument(
        "<html><body><p>x</p></body></html>",
        parseXML("<x/>"),
      );
      assert.strictEqual(doc.doctype, null);
      assert.strictEqual(doc.body.firstChild.localName, "p");
      const noHtml = parseHtmlDocument("<p/>", {
        implementation: {},
      });
      assert.strictEqual(noHtml, null);
      const viaWindow = parseHtmlDocument("<p>w</p>", {
        defaultView: dom.window,
      });
      assert.strictEqual(viaWindow.body.textContent, "w");
    } finally {
      globalThis.DOMParser = saved;
    }
  });

  it("keeps the XML result when the DOM cannot create HTML documents", () => {
    const engine = compile(
      stylesheet('<xsl:template match="/"><p>x</p></xsl:template>', "html"),
    );
    const source = parseXML("<d/>");
    const saved = globalThis.DOMParser;
    delete globalThis.DOMParser;
    const implementation = Object.getPrototypeOf(source.implementation);
    const create = implementation.createHTMLDocument;
    implementation.createHTMLDocument = undefined;
    try {
      const doc = engine.transformToDocument(source);
      assert.strictEqual(doc.documentElement.localName, "p");
      assert.notStrictEqual(doc.contentType, "text/html");
    } finally {
      implementation.createHTMLDocument = create;
      globalThis.DOMParser = saved;
    }
  });
});
