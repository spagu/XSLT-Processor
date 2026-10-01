import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parse } from "../testing.test.js";
import {
  attributesOf,
  childrenOf,
  isNamespaceDeclaration,
  nodeKind,
  nodeLocalName,
  nodeNamespace,
  nodePrefix,
  parentOf,
  rootOf,
} from "./domNodes.js";
import { DocumentOrder } from "./documentOrder.js";
import { inScopeNamespaces, namespaceNodesOf } from "./namespaceNodes.js";

const doc = parse(
  '<!DOCTYPE r><r xmlns="urn:d" xmlns:p="urn:p" p:a="1"><![CDATA[c]]><?t d?><!--x--><s xmlns=""/></r>',
);
const r = doc.documentElement;

describe("DOM nodes as XDM nodes", () => {
  it("maps node kinds", () => {
    const kinds = [...r.childNodes].map(nodeKind);
    assert.deepEqual(kinds, [
      "text",
      "processing-instruction",
      "comment",
      "element",
    ]);
    assert.equal(nodeKind(doc), "document");
    assert.equal(nodeKind(doc.createDocumentFragment()), "document");
    assert.equal(nodeKind(r.attributes[2]), "attribute");
    assert.equal(nodeKind(doc.doctype), undefined);
  });

  it("skips document types and namespace declarations", () => {
    assert.deepEqual(childrenOf(doc), [r]);
    assert.deepEqual(childrenOf(r.firstChild), []);
    assert.deepEqual(
      attributesOf(r).map((a) => a.name),
      ["p:a"],
    );
    assert.deepEqual(attributesOf(doc), []);
    const level1 = { name: "xmlns:q", namespaceURI: null };
    assert.equal(isNamespaceDeclaration(level1), true);
    assert.equal(
      isNamespaceDeclaration({ nodeName: "xmlns", namespaceURI: "" }),
      true,
    );
    assert.equal(
      isNamespaceDeclaration({ name: "x", namespaceURI: null }),
      false,
    );
  });

  it("gives names, parents and roots", () => {
    const attribute = r.getAttributeNodeNS("urn:p", "a");
    assert.equal(nodeLocalName(attribute), "a");
    assert.equal(nodeNamespace(attribute), "urn:p");
    assert.equal(nodePrefix(attribute), "p");
    assert.equal(nodePrefix(r), "");
    assert.equal(nodePrefix(doc), "");
    assert.equal(nodeLocalName(r.childNodes[1]), "t");
    assert.equal(nodeLocalName(r.childNodes[2]), "");
    assert.equal(nodeLocalName({ nodeType: 1, nodeName: "n" }), "n");
    assert.equal(nodeLocalName({ nodeType: 7, nodeName: "pi" }), "pi");
    assert.equal(nodeNamespace(doc), "");
    assert.equal(parentOf(attribute), r);
    assert.equal(parentOf({ nodeType: 2 }), null);
    assert.equal(parentOf({ nodeType: 3 }), null);
    assert.equal(rootOf(attribute), doc);
  });
});

describe("namespace nodes", () => {
  it("collects the in-scope namespaces", () => {
    assert.deepEqual([...inScopeNamespaces(r)].sort(), [
      ["", "urn:d"],
      ["p", "urn:p"],
      ["xml", "http://www.w3.org/XML/1998/namespace"],
    ]);
    const s = r.lastChild;
    assert.deepEqual(
      namespaceNodesOf(s).map((n) => n.localName),
      ["p", "xml"],
    );
    assert.equal(namespaceNodesOf(s), namespaceNodesOf(s));
    const [p] = namespaceNodesOf(s);
    assert.equal(p.nodeType, 13);
    assert.equal(p.nodeValue, "urn:p");
    assert.equal(parentOf(p), s);
  });

  it("adds namespaces used by names without declarations", () => {
    const created = doc.createElementNS("urn:e", "e:x");
    created.setAttributeNS("urn:f", "f:y", "1");
    created.setAttribute("plain", "2");
    const namespaces = inScopeNamespaces(created);
    assert.equal(namespaces.get("e"), "urn:e");
    assert.equal(namespaces.get("f"), "urn:f");
  });
});

describe("document order", () => {
  it("orders nodes, attributes and namespace nodes of a tree", () => {
    const order = new DocumentOrder();
    const [p] = namespaceNodesOf(r);
    const attribute = r.getAttributeNodeNS("urn:p", "a");
    const nodes = [r.lastChild, attribute, p, r, doc, r.lastChild];
    assert.deepEqual(order.sort(nodes), [doc, r, p, attribute, r.lastChild]);
    assert.ok(order.compare(r, r.lastChild) < 0);
    assert.ok(order.compare(r.lastChild, r) > 0);
    assert.equal(order.compare(r, r), 0);
    assert.deepEqual(order.sort([r]), [r]);
  });

  it("orders trees by first use and renumbers changed trees", () => {
    const order = new DocumentOrder();
    const other = parse("<o/>");
    assert.ok(order.compare(other, doc) < 0);
    assert.ok(order.compare(doc, other) > 0);
    assert.deepEqual(order.sort([doc, other]), [other, doc]);
    const added = other.createElement("n");
    other.documentElement.appendChild(added);
    assert.ok(order.compare(other.documentElement, added) < 0);
  });
});
