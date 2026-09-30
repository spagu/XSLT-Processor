/**
 * DOM implementation of the test suites (the DOM test matrix).
 *
 * The suites that exercise the library end to end (API, regressions, the
 * themed XSLT suites, EXSLT) take their DOM from here. The `DOM` environment
 * variable picks the implementation: `jsdom` (default) or `xmldom`
 * (@xmldom/xmldom 0.9 or later); see scripts/test-dom.mjs
 * (`npm run test:dom`) for the matrix. The environment
 * is the one of the command line tool (bin/lib/dom.js), so both share the
 * xmldom adaptations (e.g. parse errors reported as `parsererror`).
 *
 * linkedom is not part of the matrix: its XML parser is not namespace aware
 * (every element is an XHTML element whose local name keeps its prefix), so
 * no stylesheet can be recognized. The probe below keeps that verdict
 * checked against new linkedom releases. Neither is the xmldom 0.8 line (npm
 * dist-tag `lts`): its `getAttribute` returns "" for absent attributes, its
 * elements in no namespace have an undefined `namespaceURI` and its lists
 * are not iterable.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { loadDomEnvironment } from "../bin/lib/dom.js";

/** Name of the DOM under test: "jsdom" or "xmldom". */
export const DOM_NAME = process.env.DOM || "jsdom";

/** The DOM environment: `{ name, window: { document, DOMParser, XMLSerializer } }`. */
export const domEnvironment = await loadDomEnvironment(DOM_NAME);

/** Whether the DOM under test is jsdom (HTML documents, Range, ...). */
export const isJsdom = DOM_NAME === "jsdom";

/**
 * Test options skipping a test outside jsdom, for behavior that needs a DOM
 * feature xmldom does not have (HTML documents and HTMLElements, Range).
 *
 * @param {string} feature - What the test needs, shown as the skip reason
 * @returns {{skip: string|false}} Options for `it()`
 */
export function jsdomOnly(feature) {
  return { skip: isJsdom ? false : `needs ${feature} (jsdom only)` };
}

/**
 * Parse XML with the DOM under test.
 *
 * @param {string} xml - Markup
 * @returns {Document} The parsed document
 */
export function parseXmlDocument(xml) {
  return new domEnvironment.window.DOMParser().parseFromString(
    xml,
    "application/xml",
  );
}

/**
 * Serialize a node with the DOM under test.
 *
 * @param {Node} node - Any node
 * @returns {string} The markup
 */
export function serializeNode(node) {
  return new domEnvironment.window.XMLSerializer().serializeToString(node);
}

describe("DOM test environment", () => {
  it("parses and serializes with the DOM under test", () => {
    const doc = parseXmlDocument('<a xmlns:p="urn:p"><p:b/></a>');
    assert.strictEqual(doc.documentElement.firstChild.namespaceURI, "urn:p");
    assert.match(serializeNode(doc), /<a xmlns:p="urn:p"><p:b\/><\/a>/);
    assert.strictEqual(domEnvironment.name, DOM_NAME);
  });

  it("marks jsdom-only tests", () => {
    assert.strictEqual(jsdomOnly("Range").skip === false, isJsdom);
  });

  it("keeps linkedom out: its XML parser is not namespace aware", async () => {
    const { DOMParser } = await import("linkedom");
    const doc = new DOMParser().parseFromString(
      '<p:a xmlns:p="urn:p"/>',
      "text/xml",
    );
    assert.notStrictEqual(doc.documentElement.namespaceURI, "urn:p");
  });
});

/**
 * The descendant elements of a node with a given local name, in document
 * order (`querySelectorAll` for DOMs without selectors, such as xmldom).
 *
 * @param {Node} node - A document, fragment or element
 * @param {string} localName - The wanted local name
 * @returns {Element[]} The matching elements
 */
export function findAll(node, localName) {
  const found = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType !== 1) continue;
    if (child.localName === localName) found.push(child);
    found.push(...findAll(child, localName));
  }
  return found;
}

/**
 * The first descendant element of a node with a given local name.
 *
 * @param {Node} node - A document, fragment or element
 * @param {string} localName - The wanted local name
 * @returns {Element|null} The element, or null
 */
export function findFirst(node, localName) {
  return findAll(node, localName)[0] ?? null;
}
