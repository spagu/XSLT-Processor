/**
 * transformToFragment() shaped as Chrome's, whatever the owner document:
 * html output (declared or detected) is serialized and parsed by the HTML
 * parser, so the fragment holds real HTMLElements with lower-case names in
 * the XHTML namespace (issue #17 for XML owner documents); text output is
 * one text node; xml output keeps the result nodes in their namespaces,
 * which Chrome and Firefox both do (no XHTML conversion).
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { XSLTProcessor } from "./XSLTProcessor.js";
import { importResultFragment, parseHtmlFragment } from "./xslt/resultTree.js";

const { window } = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  runScripts: "outside-only",
});
const html = window.document;
const XHTML = "http://www.w3.org/1999/xhtml";

/**
 * Parse XML with the jsdom parser.
 *
 * @param {string} markup - XML markup
 * @returns {Document} The document
 */
const parseXML = (markup) =>
  new window.DOMParser().parseFromString(markup, "application/xml");

/**
 * Serialize a node with the DOM's XMLSerializer.
 *
 * @param {Node} node - The node
 * @returns {string} The markup
 */
const serialize = (node) => new window.XMLSerializer().serializeToString(node);

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

  it("keeps xml output in no namespace, as Chrome and Firefox do", () => {
    const fragment = fragmentOf(
      '<ul class="c"><li>x</li><Item/><s:svg xmlns:s="http://www.w3.org/2000/svg"/></ul>',
      '<xsl:output method="xml"/>',
    );
    const list = fragment.firstChild;
    assert.strictEqual(fragment.ownerDocument, html);
    assert.strictEqual(list.namespaceURI, null);
    assert.ok(!(list instanceof window.HTMLElement));
    assert.strictEqual(list.childNodes[1].localName, "Item");
    assert.strictEqual(
      list.lastChild.namespaceURI,
      "http://www.w3.org/2000/svg",
    );
    assert.strictEqual(
      serialize(fragment),
      '<ul class="c"><li>x</li><Item/><s:svg xmlns:s="http://www.w3.org/2000/svg"/></ul>',
    );
  });

  it("keeps XHTML-namespace elements, which are already HTML elements", () => {
    const fragment = fragmentOf(
      '<a xmlns="http://www.w3.org/1999/xhtml" href="u">x</a>',
    );
    assert.ok(fragment.firstChild instanceof window.HTMLAnchorElement);
  });

  it("returns one text node for method text", () => {
    const fragment = fragmentOf(
      "a&lt;b<x>c</x>",
      '<xsl:output method="text"/>',
    );
    assert.strictEqual(fragment.childNodes.length, 1);
    assert.strictEqual(fragment.firstChild.nodeType, 3);
    assert.strictEqual(fragment.textContent, "a<bc");
  });

  it("returns an empty fragment for empty text output", () => {
    const fragment = fragmentOf("", '<xsl:output method="text"/>');
    assert.strictEqual(fragment.childNodes.length, 0);
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
        '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:template match="/"><p><xsl:value-of select="count(//d)"/></p></xsl:template></xsl:stylesheet>',
      ),
    );
    const fragment = processor.transformToFragment(
      parseXML('<d xmlns="urn:x"/>'),
      html,
    );
    assert.strictEqual(fragment.textContent, "1");
  });
});

describe("transformToFragment into an XML document", () => {
  // Chrome and Firefox: createDocument("", "XmlTransform", null) as the
  // owner, then XMLSerializer writes xmlns and "<img ... />" (issue #17)
  const xmlOwner = () =>
    window.document.implementation.createDocument("", "XmlTransform", null);

  it("parses html output into XHTML elements with lower-case names (#17)", () => {
    const owner = xmlOwner();
    const fragment = fragmentOf(
      '<div Class="c"><img src="a.png" alt="x"/><Item/><table><tr><td>a</td></tr></table></div>',
      '<xsl:output method="html"/>',
      owner,
    );
    const div = fragment.firstChild;
    assert.strictEqual(fragment.ownerDocument, owner);
    assert.strictEqual(div.namespaceURI, XHTML);
    assert.ok(div instanceof window.HTMLDivElement);
    assert.strictEqual(div.nodeName, "div");
    assert.strictEqual(
      serialize(fragment),
      `<div xmlns="${XHTML}" class="c"><img src="a.png" alt="x" /><item></item><table><tbody><tr><td>a</td></tr></tbody></table></div>`,
    );
  });

  it("keeps foreign elements of html output in their namespace", () => {
    const fragment = fragmentOf(
      '<div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/></div>',
      '<xsl:output method="html"/>',
      xmlOwner(),
    );
    const svg = fragment.firstChild.firstChild;
    assert.strictEqual(svg.namespaceURI, "http://www.w3.org/2000/svg");
    assert.strictEqual(svg.getAttribute("viewBox"), "0 0 1 1");
  });

  it("drops html, head and body tags when html is detected, like Chrome", () => {
    const fragment = fragmentOf(
      "<html><body><br/></body></html>",
      "",
      xmlOwner(),
    );
    assert.strictEqual(fragment.childNodes.length, 1);
    assert.strictEqual(fragment.firstChild.localName, "br");
    assert.strictEqual(fragment.firstChild.namespaceURI, XHTML);
  });

  it("keeps xml output as it is", () => {
    const owner = parseXML("<x/>");
    const fragment = fragmentOf(
      "<P>x</P>",
      '<xsl:output method="xml"/>',
      owner,
    );
    assert.strictEqual(fragment.ownerDocument, owner);
    assert.strictEqual(fragment.firstChild.namespaceURI, null);
    assert.strictEqual(fragment.firstChild.localName, "P");
  });

  it("returns one text node for method text", () => {
    const fragment = fragmentOf(
      "a<x>b</x>",
      '<xsl:output method="text"/>',
      xmlOwner(),
    );
    assert.strictEqual(fragment.childNodes.length, 1);
    assert.strictEqual(fragment.textContent, "ab");
  });
});

describe("html output on a DOM without an HTML parser", () => {
  it("parseHtmlFragment returns null when HTML cannot be parsed", () => {
    const noHtmlDocuments = {
      contentType: "application/xml",
      implementation: {},
    };
    assert.strictEqual(parseHtmlFragment("<p/>", noHtmlDocuments), null);
    const noAdopt = {
      contentType: "application/xml",
      implementation: { createHTMLDocument: () => html },
    };
    assert.strictEqual(parseHtmlFragment("<p/>", noAdopt), null);
    const noRange = {
      contentType: "application/xml",
      implementation: { createHTMLDocument: () => ({}) },
      adoptNode: () => {},
    };
    assert.strictEqual(parseHtmlFragment("<p/>", noRange), null);
  });

  it("imports the result as XHTML elements with lower-case names", () => {
    const result = parseXML(
      '<DIV Class="c" xml:lang="en"><s:svg xmlns:s="urn:s" S="1"/>t</DIV>',
    );
    const fragment = result.createDocumentFragment();
    fragment.appendChild(result.documentElement);
    const owner = parseXML("<o/>");
    const imported = importResultFragment(fragment, owner, {
      htmlMethod: true,
    });
    const div = imported.firstChild;
    assert.strictEqual(imported.ownerDocument, owner);
    assert.strictEqual(div.namespaceURI, XHTML);
    assert.strictEqual(div.localName, "div");
    assert.strictEqual(div.getAttribute("class"), "c");
    assert.strictEqual(
      div.getAttributeNS("http://www.w3.org/XML/1998/namespace", "lang"),
      "en",
    );
    assert.strictEqual(div.firstChild.namespaceURI, "urn:s");
    assert.strictEqual(div.firstChild.getAttribute("S"), "1");
    assert.strictEqual(div.lastChild.nodeValue, "t");
  });

  it("returns the fragment itself when it already belongs to the owner", () => {
    const owner = parseXML("<o/>");
    const fragment = owner.createDocumentFragment();
    assert.strictEqual(importResultFragment(fragment, owner), fragment);
  });
});
