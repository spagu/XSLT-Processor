/**
 * `xsl:number` counting tests.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { countXsltNumber } from "./number.js";

let dom;

function parseXML(xmlString) {
  return new dom.window.DOMParser().parseFromString(
    xmlString,
    "application/xml",
  );
}

/**
 * Minimal XSLT pattern matcher: supports element name tests only.
 *
 * @param {Node} node - The node to test
 * @param {string} pattern - An element name, or `*`
 * @returns {boolean} True when the node matches
 */
function matcher(node, pattern) {
  if (node.nodeType !== 1) return false;
  return pattern === "*" || node.nodeName === pattern;
}

describe("countXsltNumber", () => {
  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      contentType: "text/html",
    });
  });

  it("should number siblings for level single", () => {
    const doc = parseXML("<root><item/><item/><item/></root>");
    const items = doc.getElementsByTagName("item");

    assert.deepStrictEqual(countXsltNumber(items[0], {}, matcher), [1]);
    assert.deepStrictEqual(countXsltNumber(items[2], {}, matcher), [3]);
  });

  it("should climb to the nearest matching ancestor for level single", () => {
    const doc = parseXML("<root><item><sub/></item><item><sub/></item></root>");
    const sub = doc.getElementsByTagName("sub")[1];

    assert.deepStrictEqual(
      countXsltNumber(sub, { level: "single", count: "item" }, matcher),
      [2],
    );
  });

  it("should return an empty sequence when nothing matches", () => {
    const doc = parseXML("<root><item/></root>");
    const item = doc.getElementsByTagName("item")[0];

    assert.deepStrictEqual(
      countXsltNumber(item, { level: "single", count: "missing" }, matcher),
      [],
    );
  });

  it("should stop at a from boundary for level single", () => {
    const doc = parseXML("<root><item/></root>");
    const item = doc.getElementsByTagName("item")[0];

    assert.deepStrictEqual(
      countXsltNumber(
        item,
        { level: "single", count: "root", from: "item" },
        matcher,
      ),
      [],
    );
  });

  it("should number every ancestor for level multiple", () => {
    const doc = parseXML(
      "<root><chapter><section/><section><para/></section></chapter></root>",
    );
    const para = doc.getElementsByTagName("para")[0];

    assert.deepStrictEqual(
      countXsltNumber(para, { level: "multiple", count: "*" }, matcher),
      [1, 1, 2, 1],
    );
  });

  it("should not climb past a from boundary for level multiple", () => {
    const doc = parseXML("<root><chapter><section/></chapter></root>");
    const section = doc.getElementsByTagName("section")[0];

    assert.deepStrictEqual(
      countXsltNumber(
        section,
        { level: "multiple", count: "*", from: "chapter" },
        matcher,
      ),
      [1],
    );
  });

  it("should count all preceding nodes for level any", () => {
    const doc = parseXML("<root><s><i/></s><s><i/><i/></s></root>");
    const items = doc.getElementsByTagName("i");

    assert.deepStrictEqual(
      countXsltNumber(items[0], { level: "any", count: "i" }, matcher),
      [1],
    );
    assert.deepStrictEqual(
      countXsltNumber(items[1], { level: "any", count: "i" }, matcher),
      [2],
    );
    assert.deepStrictEqual(
      countXsltNumber(items[2], { level: "any", count: "i" }, matcher),
      [3],
    );
  });

  it("should restart counting at a from boundary for level any", () => {
    const doc = parseXML("<root><s><i/></s><s><i/></s></root>");
    const items = doc.getElementsByTagName("i");

    assert.deepStrictEqual(
      countXsltNumber(
        items[1],
        { level: "any", count: "i", from: "s" },
        matcher,
      ),
      [1],
    );
  });

  it("should return an empty sequence for level any without matches", () => {
    const doc = parseXML("<root><i/></root>");
    const item = doc.getElementsByTagName("i")[0];

    assert.deepStrictEqual(
      countXsltNumber(item, { level: "any", count: "missing" }, matcher),
      [],
    );
  });

  it("should number nodes of the same type and name by default", () => {
    const doc = parseXML("<root><a/><b/><a/></root>");
    const second = doc.getElementsByTagName("a")[1];

    assert.deepStrictEqual(countXsltNumber(second, {}, matcher), [2]);
  });

  it("should number text nodes of the same type by default", () => {
    const doc = parseXML("<root>one<a/>two</root>");
    const text = doc.documentElement.lastChild;

    assert.deepStrictEqual(countXsltNumber(text, {}, matcher), [2]);
  });

  it("should ignore nodes that cannot be counted", () => {
    const doc = parseXML("<root><!--c--><i/></root>");
    const item = doc.getElementsByTagName("i")[0];

    assert.deepStrictEqual(
      countXsltNumber(item, { level: "any", count: "i" }, matcher),
      [1],
    );
  });
});
