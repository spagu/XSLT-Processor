import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { code, parse, xs } from "../testing.test.js";

const doc = parse(
  '<r xmlns:p="urn:p"><a x="1" y="2"><b/><c><d/></c></a><e/><p:f/></r>',
);

describe("axes", () => {
  it("walks the forward axes in document order", () => {
    assert.equal(xs("/r/a/child::*", doc), "<b> <c>");
    assert.equal(xs("/r/a/descendant::*", doc), "<b> <c> <d>");
    assert.equal(xs("/r/a/descendant-or-self::*", doc), "<a> <b> <c> <d>");
    assert.equal(xs("//b/following-sibling::*", doc), "<c>");
    assert.equal(xs("//b/following::*", doc), "<c> <d> <e> <p:f>");
    assert.equal(xs("/r/a/attribute::*", doc), "@x @y");
    assert.equal(xs("/r/a/self::a", doc), "<a>");
    assert.equal(xs("/r/a/self::b", doc), "");
  });

  it("walks the reverse axes", () => {
    assert.equal(xs("//d/parent::*", doc), "<c>");
    assert.equal(xs("//d/ancestor::*", doc), "<r> <a> <c>");
    assert.equal(xs("//d/ancestor-or-self::*", doc), "<r> <a> <c> <d>");
    assert.equal(xs("//e/preceding-sibling::*", doc), "<a>");
    assert.equal(xs("//e/preceding::*", doc), "<a> <b> <c> <d>");
    assert.equal(xs("//d/preceding::*[1]", doc), "<b>");
    assert.equal(xs("/parent::node()", doc), "");
    const typed = parse("<!--a--><!DOCTYPE r><r/>");
    assert.equal(xs("/r/preceding-sibling::node()", typed), "#comment");
    assert.equal(xs("/comment()/following-sibling::node()", typed), "<r>");
  });

  it("treats attributes and namespace nodes as children of nobody", () => {
    assert.equal(xs("//@x/parent::*", doc), "<a>");
    assert.equal(xs("//@x/following-sibling::node()", doc), "");
    assert.equal(xs("//@x/preceding-sibling::node()", doc), "");
    assert.equal(xs("//@x/following::*", doc), "<b> <c> <d> <e> <p:f>");
    assert.equal(xs("//@x/preceding::*", doc), "");
    assert.equal(xs("//@y/ancestor::*", doc), "<r> <a>");
    const detached = doc.createAttribute("z");
    assert.equal(xs("following::node()", detached), "");
    assert.equal(xs("preceding::node()", detached), "");
  });

  it("gives the namespace nodes of elements only", () => {
    assert.equal(xs("/r/namespace::*", doc), "ns:p ns:xml");
    assert.equal(xs("/r/namespace::p/string()", doc), "urn:p");
    assert.equal(xs("/r/@*/namespace::*", doc), "");
    assert.equal(xs("/r/namespace::p/parent::*", doc), "<r>");
    assert.equal(xs("/r/namespace-node()", doc), "ns:p ns:xml");
  });

  it("stops at a positional limit", () => {
    assert.equal(xs("/r/descendant::*[2]", doc), "<b>");
    assert.equal(xs("/r/descendant-or-self::*[1]", doc), "<r>");
    assert.equal(xs("/r/descendant-or-self::*[3]", doc), "<b>");
    assert.equal(xs("/r/a/child::*[1]", doc), "<b>");
    assert.equal(xs("/r/a/attribute::*[1]", doc), "@x");
    assert.equal(xs("/r/namespace::*[1]", doc), "ns:p");
    assert.equal(xs("//d/ancestor::*[2]", doc), "<a>");
    assert.equal(xs("//d/ancestor-or-self::*[1]", doc), "<d>");
    assert.equal(xs("//b/following-sibling::*[1]", doc), "<c>");
    assert.equal(xs("//e/preceding-sibling::*[1]", doc), "<a>");
    assert.equal(xs("//b/following::*[2]", doc), "<d>");
    assert.equal(xs("//b/following::*[1]", doc), "<c>");
    assert.equal(xs("//@x/following::*[1]", doc), "<b>");
    assert.equal(xs("//e/preceding::*[2]", doc), "<c>");
    assert.equal(xs("//e/preceding::*[4]", doc), "<a>");
    assert.equal(xs("/r/a/child::*[0]", doc), "");
  });

  it("looks attributes up by name, without namespace declarations", () => {
    const declared = parse('<r xmlns:p="urn:p" p:a="1" a="2"/>');
    declared.documentElement.setAttribute("xmlns", "urn:x");
    assert.equal(xs("/r/@xmlns", declared), "");
    assert.equal(xs("/r/@a/string()", declared), "2");
    assert.equal(xs("/r/@Q{urn:p}a/string()", declared), "1");
    assert.equal(xs("/r/@a[0]", declared), "");
    assert.equal(xs("/r/@b", declared), "");
    assert.equal(xs("/@a", declared), "");
    // A DOM without getAttributeNodeNS: the attribute list is walked
    const attribute = { nodeType: 2, name: "a", nodeName: "a", nodeValue: "3" };
    const element = { nodeType: 1, attributes: [attribute] };
    assert.equal(xs("@a/string()", element), "3");
  });

  it("selects by name, wildcard and kind", () => {
    const options = { namespaces: { q: "urn:p" } };
    assert.equal(xs("//q:f", doc, options), "<p:f>");
    assert.equal(xs("//q:*", doc, options), "<p:f>");
    assert.equal(xs("//*:f", doc), "<p:f>");
    assert.equal(xs("//Q{urn:p}*", doc), "<p:f>");
    assert.equal(xs("//Q{}e", doc), "<e>");
    assert.equal(xs("/r/a/@*:x", doc), "@x");
    assert.equal(xs("/r/a/attribute::x", doc), "@x");
    assert.equal(xs("/r/a/element()", doc), "<b> <c>");
    assert.equal(code("//z:a", doc), "XPST0081");
    const defaultNs = { namespaces: [{ prefix: "", uri: "urn:p" }] };
    assert.equal(xs("//f", doc, defaultNs), "<p:f>");
    assert.equal(xs("//element(f)", doc, defaultNs), "<p:f>");
  });
});
