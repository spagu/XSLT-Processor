/**
 * locateNamespace: the DOM Standard's lookup on result elements, the same on
 * jsdom (spec lookupNamespaceURI) and @xmldom/xmldom (attribute-only lookup,
 * like Firefox), and the issue #30 regression it fixes.
 *
 * Run: node --test src/xslt/namespaceLookup.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import {
  DOMImplementation,
  DOMParser as XmldomParser,
  XMLSerializer as XmldomSerializer,
} from "@xmldom/xmldom";
import { locateNamespace } from "./namespaceLookup.js";
import { XSLTProcessor } from "../XSLTProcessor.js";

const XHTML = "http://www.w3.org/1999/xhtml";
const XMLNS = "http://www.w3.org/2000/xmlns/";
const { window } = new JSDOM("");

const doms = {
  jsdom: () => window.document.implementation.createDocument(null, null, null),
  xmldom: () => new DOMImplementation().createDocument(null, null, null),
};

for (const [name, create] of Object.entries(doms)) {
  describe(`locateNamespace on ${name}`, () => {
    it("takes the namespace of the element's own name", () => {
      const doc = create();
      const p = doc.createElementNS(XHTML, "p");
      assert.strictEqual(locateNamespace(p, null), XHTML);
      assert.strictEqual(locateNamespace(p, ""), XHTML);
      const svg = doc.createElementNS("urn:s", "s:svg");
      assert.strictEqual(locateNamespace(svg, "s"), "urn:s");
      assert.strictEqual(locateNamespace(svg, null), null);
    });

    it('reads declarations, inherits them, and honours xmlns=""', () => {
      const doc = create();
      const outer = doc.createElementNS(null, "outer");
      outer.setAttributeNS(XMLNS, "xmlns:a", "urn:a");
      outer.setAttributeNS(XMLNS, "xmlns", "urn:d");
      const inner = doc.createElementNS(null, "inner");
      outer.appendChild(inner);
      assert.strictEqual(locateNamespace(inner, "a"), "urn:a");
      assert.strictEqual(locateNamespace(inner, null), "urn:d");
      inner.setAttributeNS(XMLNS, "xmlns", "");
      assert.strictEqual(locateNamespace(inner, null), null);
      assert.strictEqual(locateNamespace(inner, "b"), null);
    });

    it("gives null for anything that is not an element", () => {
      assert.strictEqual(locateNamespace(null, null), null);
      assert.strictEqual(
        locateNamespace(create().createTextNode("x"), null),
        null,
      );
    });
  });
}

describe("issue #30: copied XHTML content into an XHTML result", () => {
  const xml = `<r><body xmlns="${XHTML}"><p>a <b>b</b></p></body></r>`;
  const xsl = `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns="${XHTML}" xmlns:x="${XHTML}" exclude-result-prefixes="x"><xsl:template match="/"><html><body><xsl:copy-of select="//x:body/node()"/></body></html></xsl:template></xsl:stylesheet>`;
  const expected = `<html xmlns="${XHTML}"><body><p>a <b>b</b></p></body></html>`;

  it("declares no namespace again on xmldom (as on Firefox)", () => {
    const parser = new XmldomParser();
    const processor = new XSLTProcessor();
    processor.importStylesheet(parser.parseFromString(xsl, "text/xml"));
    const result = processor.transformToDocument(
      parser.parseFromString(xml, "text/xml"),
    );
    assert.strictEqual(
      new XmldomSerializer().serializeToString(result),
      expected,
    );
  });

  it("and on jsdom", () => {
    const parser = new window.DOMParser();
    const processor = new XSLTProcessor();
    processor.importStylesheet(parser.parseFromString(xsl, "application/xml"));
    const result = processor.transformToDocument(
      parser.parseFromString(xml, "application/xml"),
    );
    assert.strictEqual(
      new window.XMLSerializer().serializeToString(result),
      expected,
    );
  });
});
