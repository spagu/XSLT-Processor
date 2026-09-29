/**
 * transformToFragment() into an HTML document (Chrome parity): with the html
 * output method, declared or detected, the result is serialized and parsed
 * as HTML in the owner document, so it holds real HTMLElements; with the xml
 * method the nodes built by the XML DOM are kept.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { XSLTProcessor } from "./XSLTProcessor.js";

const { window } = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  runScripts: "outside-only",
});
const html = window.document;

/**
 * Parse XML with the jsdom parser.
 *
 * @param {string} markup - XML markup
 * @returns {Document} The document
 */
const parseXML = (markup) =>
  new window.DOMParser().parseFromString(markup, "application/xml");

/**
 * Transform `<d/>` into a fragment of `owner` with a root template body.
 *
 * @param {string} body - Content of the template matching "/"
 * @param {string} [output] - xsl:output element
 * @param {Document} [owner] - Output document
 * @param {object} [options] - XSLTProcessor options
 * @returns {DocumentFragment} The fragment
 */
function fragmentOf(body, output = "", owner = html, options = undefined) {
  const processor = new XSLTProcessor(options);
  processor.importStylesheet(
    parseXML(
      `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">${output}<xsl:template match="/">${body}</xsl:template></xsl:stylesheet>`,
    ),
  );
  return processor.transformToFragment(parseXML("<d/>"), owner);
}

describe("transformToFragment into an HTML document", () => {
  it("returns HTML elements for method html (B35)", () => {
    const fragment = fragmentOf(
      '<div><a href="x y">link</a><br/></div>',
      '<xsl:output method="html"/>',
    );
    const div = fragment.firstChild;
    assert.strictEqual(fragment.ownerDocument, html);
    assert.ok(div instanceof window.HTMLDivElement);
    assert.ok(div.firstChild instanceof window.HTMLAnchorElement);
    assert.strictEqual(div.firstChild.getAttribute("href"), "x%20y");
    assert.strictEqual(div.lastChild.localName, "br");
  });

  it("returns HTML elements when the html method is detected", () => {
    const fragment = fragmentOf(
      "<html><head><title>t</title></head><body><p>x</p></body></html>",
    );
    // Parsed "in body", as Chrome does: html, head and body tags are dropped
    const names = Array.from(fragment.childNodes, (node) => node.localName);
    assert.deepStrictEqual(names, ["meta", "title", "p"]);
    assert.ok(fragment.lastChild instanceof window.HTMLParagraphElement);
  });

  it("parses disable-output-escaping text as markup", () => {
    const fragment = fragmentOf(
      '<p><xsl:text disable-output-escaping="yes">&lt;b&gt;x&lt;/b&gt;</xsl:text></p>',
      '<xsl:output method="html"/>',
    );
    assert.strictEqual(fragment.firstChild.firstChild.localName, "b");
  });

  it("keeps the XML DOM nodes for method xml", () => {
    const fragment = fragmentOf("<a>x</a>", '<xsl:output method="xml"/>');
    assert.strictEqual(fragment.firstChild.namespaceURI, null);
    assert.ok(!(fragment.firstChild instanceof window.HTMLElement));
  });

  it("keeps XHTML-namespace elements, which are already HTML elements", () => {
    const fragment = fragmentOf(
      '<a xmlns="http://www.w3.org/1999/xhtml" href="u">x</a>',
    );
    assert.ok(fragment.firstChild instanceof window.HTMLAnchorElement);
  });

  it("returns text for method text", () => {
    const fragment = fragmentOf("a&lt;b", '<xsl:output method="text"/>');
    assert.strictEqual(fragment.textContent, "a<b");
    assert.strictEqual(fragment.firstChild.nodeType, 3);
  });

  it("keeps XML DOM nodes in an XML owner document", () => {
    const owner = parseXML("<x/>");
    const fragment = fragmentOf(
      "<p>x</p>",
      '<xsl:output method="html"/>',
      owner,
    );
    assert.strictEqual(fragment.ownerDocument, owner);
    assert.ok(!(fragment.firstChild instanceof window.HTMLElement));
  });

  it("parses into an HTML document without a document element", () => {
    const empty = window.document.implementation.createHTMLDocument("");
    empty.documentElement.remove();
    const fragment = fragmentOf(
      "<p>x</p>",
      '<xsl:output method="html"/>',
      empty,
    );
    assert.strictEqual(fragment.ownerDocument, empty);
    assert.ok(fragment.firstChild instanceof window.HTMLParagraphElement);
  });

  it("passes legacyNameTests to the engine", () => {
    const processor = new XSLTProcessor({ legacyNameTests: true });
    processor.importStylesheet(
      parseXML(
        '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:output method="text"/><xsl:template match="/"><xsl:value-of select="count(*/item)"/></xsl:template></xsl:stylesheet>',
      ),
    );
    const source = parseXML('<r xmlns="urn:d"><item/></r>');
    assert.strictEqual(processor.transformToString(source), "1");
    assert.strictEqual(
      new XSLTProcessor().engine,
      null,
      "options do not create an engine",
    );
  });
});
