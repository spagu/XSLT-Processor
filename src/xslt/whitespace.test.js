/**
 * `xsl:strip-space` / `xsl:preserve-space` tests.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { WhitespaceFilter, stripWhitespaceNodes } from "./whitespace.js";

let dom;

function parseXML(xmlString) {
  return new dom.window.DOMParser().parseFromString(
    xmlString,
    "application/xml",
  );
}

function emptyDocument() {
  return dom.window.document.implementation.createDocument(null, null, null);
}

describe("WhitespaceFilter", () => {
  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      contentType: "text/html",
    });
  });

  it("should be inactive without xsl:strip-space", () => {
    assert.strictEqual(new WhitespaceFilter([], ["p"]).isActive(), false);
    assert.strictEqual(new WhitespaceFilter(["*"]).isActive(), true);
  });

  it("should strip elements matched by a wildcard", () => {
    const doc = parseXML("<root><item/></root>");
    const filter = new WhitespaceFilter(["*"]);

    assert.strictEqual(filter.isStripped(doc.documentElement), true);
  });

  it("should not strip elements that were never named", () => {
    const doc = parseXML("<root><item/></root>");
    const filter = new WhitespaceFilter(["other"]);

    assert.strictEqual(filter.isStripped(doc.documentElement), false);
  });

  it("should let preserve-space win at equal specificity", () => {
    const doc = parseXML("<root/>");
    const filter = new WhitespaceFilter(["*"], ["*"]);

    assert.strictEqual(filter.isStripped(doc.documentElement), false);
  });

  it("should let the most specific name test win", () => {
    const doc = parseXML("<root/>");

    assert.strictEqual(
      new WhitespaceFilter(["root"], ["*"]).isStripped(
        parseXML("<root/>").documentElement,
      ),
      true,
    );
    assert.strictEqual(
      new WhitespaceFilter(["*"], ["root"]).isStripped(doc.documentElement),
      false,
    );
  });

  it("should match namespace wildcards", () => {
    const doc = parseXML('<a:root xmlns:a="urn:a"><a:item/></a:root>');
    const filter = new WhitespaceFilter(["a:*"]);

    assert.strictEqual(filter.isStripped(doc.documentElement), true);
    assert.strictEqual(
      new WhitespaceFilter(["b:*"]).isStripped(doc.documentElement),
      false,
    );
  });
});

describe("stripWhitespaceNodes", () => {
  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      contentType: "text/html",
    });
  });

  it("should remove whitespace-only text nodes from a document", () => {
    const doc = parseXML(
      "<root>\n  <item>  </item>\n  <item>x</item>\n</root>",
    );
    const stripped = stripWhitespaceNodes(
      doc,
      new WhitespaceFilter(["*"]),
      emptyDocument(),
    );

    assert.strictEqual(stripped.nodeType, 9);
    assert.strictEqual(stripped.documentElement.childNodes.length, 2);
    assert.strictEqual(
      stripped.documentElement.firstChild.childNodes.length,
      0,
    );
    assert.strictEqual(doc.documentElement.childNodes.length, 5);
  });

  it("should keep whitespace under xml:space=preserve", () => {
    const doc = parseXML('<root xml:space="preserve">\n  <item/>\n</root>');
    const stripped = stripWhitespaceNodes(
      doc,
      new WhitespaceFilter(["*"]),
      emptyDocument(),
    );

    assert.strictEqual(stripped.documentElement.childNodes.length, 3);
  });

  it("should honour xml:space=default on a nested element", () => {
    const doc = parseXML(
      '<root xml:space="preserve"><item xml:space="default">\n  <sub/>\n</item></root>',
    );
    const stripped = stripWhitespaceNodes(
      doc,
      new WhitespaceFilter(["*"]),
      emptyDocument(),
    );

    assert.strictEqual(
      stripped.documentElement.firstChild.childNodes.length,
      1,
    );
  });

  it("should keep non whitespace text and CDATA content", () => {
    const doc = parseXML("<root>  <item><![CDATA[  ]]></item> keep </root>");
    const stripped = stripWhitespaceNodes(
      doc,
      new WhitespaceFilter(["*"]),
      emptyDocument(),
    );

    assert.strictEqual(stripped.documentElement.childNodes.length, 2);
    assert.strictEqual(
      stripped.documentElement.firstChild.childNodes.length,
      0,
    );
  });

  it("should strip an element source node", () => {
    const doc = parseXML("<root>\n  <item/>\n</root>");
    const stripped = stripWhitespaceNodes(
      doc.documentElement,
      new WhitespaceFilter(["*"]),
      emptyDocument(),
    );

    assert.strictEqual(stripped.nodeType, 1);
    assert.strictEqual(stripped.childNodes.length, 1);
  });

  it("should skip a document type declaration", () => {
    const doc = new dom.window.DOMParser().parseFromString(
      "<!DOCTYPE root><root>\n  <item/>\n</root>",
      "application/xml",
    );
    const stripped = stripWhitespaceNodes(
      doc,
      new WhitespaceFilter(["*"]),
      emptyDocument(),
    );

    assert.strictEqual(stripped.documentElement.childNodes.length, 1);
  });
});
