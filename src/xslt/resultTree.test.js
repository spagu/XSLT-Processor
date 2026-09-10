/**
 * Result tree construction tests.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import {
  createResultDocument,
  importResultFragment,
  importResultNode,
} from "./resultTree.js";

let dom;

describe("createResultDocument", () => {
  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      contentType: "text/html",
    });
  });

  it("should create an empty namespace neutral document", () => {
    const doc = createResultDocument(dom.window.document);

    assert.strictEqual(doc.documentElement, null);
    assert.strictEqual(doc.createElement("BAR").namespaceURI, null);
    assert.strictEqual(doc.createElement("BAR").nodeName, "BAR");
  });
});

describe("importResultNode", () => {
  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      contentType: "text/html",
    });
  });

  it("should preserve names and namespaces when importing", () => {
    const source = createResultDocument(dom.window.document);
    const element = source.createElement("BAR");
    element.appendChild(source.createElement("qux"));

    const imported = importResultNode(element, dom.window.document);

    assert.strictEqual(imported.nodeName, "BAR");
    assert.strictEqual(imported.namespaceURI, null);
    assert.strictEqual(imported.firstChild.nodeName, "qux");
    assert.strictEqual(imported.ownerDocument, dom.window.document);
  });

  it("should preserve disable-output-escaping markers", () => {
    const source = createResultDocument(dom.window.document);
    const text = source.createTextNode("<b/>");
    text._disableOutputEscaping = true;

    const imported = importResultNode(text, dom.window.document);

    assert.strictEqual(imported._disableOutputEscaping, true);
    assert.strictEqual(imported.nodeValue, "<b/>");
  });

  it("should not mark nodes without the escaping flag", () => {
    const source = createResultDocument(dom.window.document);
    const imported = importResultNode(
      source.createTextNode("x"),
      dom.window.document,
    );

    assert.strictEqual(imported._disableOutputEscaping, undefined);
  });
});

describe("importResultFragment", () => {
  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      contentType: "text/html",
    });
  });

  it("should move a fragment into the output document", () => {
    const source = createResultDocument(dom.window.document);
    const fragment = source.createDocumentFragment();
    fragment.appendChild(source.createElement("A"));
    fragment.appendChild(source.createComment("c"));

    const imported = importResultFragment(fragment, dom.window.document);

    assert.strictEqual(imported.ownerDocument, dom.window.document);
    assert.strictEqual(imported.childNodes.length, 2);
    assert.strictEqual(imported.firstChild.nodeName, "A");
    assert.strictEqual(imported.lastChild.nodeType, 8);
  });

  it("should return the fragment unchanged when it already belongs to the document", () => {
    const fragment = dom.window.document.createDocumentFragment();

    assert.strictEqual(
      importResultFragment(fragment, dom.window.document),
      fragment,
    );
  });
});
