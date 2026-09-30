/**
 * The namespace axis (XPath 1.0 sections 2.2 and 5.4): synthesized namespace
 * nodes for the in-scope bindings of an element, the implicit `xml` binding
 * included.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { XPathContext, XPathEvaluator, parse } from "./index.js";
import {
  NAMESPACE_NODE,
  inScopeBindings,
  isNamespaceNode,
  namespaceAxis,
} from "./namespaceNodes.js";

const XML_NS = "http://www.w3.org/XML/1998/namespace";

const xml = (markup) =>
  new JSDOM(markup, { contentType: "application/xml" }).window.document;

const doc = xml(
  '<r xmlns:a="urn:a" xmlns="urn:d" b="1"><c xmlns:b="urn:b" xmlns=""><e/></c></r>',
);
const evaluator = new XPathEvaluator();

/**
 * Evaluate an expression with the shared evaluator.
 *
 * @param {string} expr - XPath expression
 * @param {Node} [node] - Context node
 * @returns {*} The result
 */
const evaluate = (expr, node = doc) =>
  evaluator.evaluate(
    parse(expr),
    new XPathContext(node, 1, 1, {}, { d: "urn:d" }),
  );

describe("namespace axis", () => {
  it("counts the in-scope bindings with xml", () => {
    const single = xml('<r xmlns:a="u"/>');
    assert.strictEqual(evaluate("count(/r/namespace::*)", single), 2);
    assert.strictEqual(evaluate("count(/d:r/namespace::*)"), 3);
    // xmlns="" undeclares the default namespace below c
    assert.strictEqual(evaluate("count(//c/namespace::*)"), 3);
    assert.strictEqual(evaluate("count(//e/namespace::*)"), 3);
  });

  it("gives names, string values and parents", () => {
    assert.strictEqual(evaluate("name(//e/namespace::b)"), "b");
    assert.strictEqual(evaluate("local-name(//e/namespace::b)"), "b");
    assert.strictEqual(evaluate("namespace-uri(//e/namespace::b)"), "");
    assert.strictEqual(evaluate("string(//e/namespace::b)"), "urn:b");
    assert.strictEqual(evaluate("string(/d:r/namespace::xml)"), XML_NS);
    assert.strictEqual(evaluate("name(//e/namespace::b/..)"), "e");
    assert.strictEqual(evaluate("count(//e/namespace::b/ancestor::*)"), 3);
    assert.strictEqual(evaluate("name(/d:r/namespace::*[.='urn:d'])"), "");
  });

  it("only matches unprefixed name tests and node()", () => {
    assert.strictEqual(evaluate("count(//e/namespace::d:b)"), 0);
    assert.strictEqual(evaluate("count(//e/namespace::node())"), 3);
    assert.strictEqual(evaluate("count(//e/namespace::text())"), 0);
    assert.strictEqual(evaluate("count(//e/namespace::*/self::*)"), 0);
    assert.strictEqual(evaluate("count(//e/namespace::*/self::node())"), 3);
    assert.strictEqual(evaluate("count(/d:r/@*/self::*)"), 0);
  });

  it("is empty on other nodes", () => {
    assert.strictEqual(evaluate("count(namespace::*)"), 0);
    assert.strictEqual(evaluate("count(/d:r/@b/namespace::*)"), 0);
    assert.strictEqual(evaluate("count(//e/namespace::*/namespace::*)"), 0);
  });

  it("keeps the identity of namespace nodes, so unions deduplicate", () => {
    assert.strictEqual(
      evaluate("count(//e/namespace::* | //e/namespace::b)"),
      3,
    );
    const [first] = evaluate("//e/namespace::b");
    const [second] = evaluate("//e/namespace::b");
    assert.strictEqual(first, second);
    evaluator.resetNamespaceNodes();
    assert.notStrictEqual(evaluate("//e/namespace::b")[0], first);
  });

  it("sorts namespace nodes after their element and before its attributes", () => {
    const nodes = evaluate("/d:r/@b | /d:r/namespace::a | /d:r | /d:r/c");
    assert.deepStrictEqual(
      nodes.map((node) => node.nodeType),
      [1, NAMESPACE_NODE, 2, 1],
    );
    const namespaces = evaluate("/d:r/namespace::* | /d:r/namespace::xml");
    assert.deepStrictEqual(
      namespaces.map((node) => node.localName),
      ["xml", "a", ""],
    );
    assert.deepStrictEqual(
      evaluate("//e/namespace::b | //e | /d:r/namespace::a").map(
        (node) => node.nodeName,
      ),
      ["a", "e", "b"],
    );
  });

  it("walks following and preceding from a namespace node", () => {
    assert.strictEqual(
      evaluate("name(/d:r/namespace::a/following::*[1])"),
      "c",
    );
    assert.strictEqual(evaluate("count(//e/namespace::b/preceding::*)"), 0);
    assert.strictEqual(
      evaluate("count(/d:r/namespace::a/following-sibling::node())"),
      0,
    );
  });

  it("finds the language of a namespace node from its element", () => {
    const lang = xml('<r xml:lang="pl" xmlns:a="u"/>');
    assert.strictEqual(
      evaluate("lang('pl')", evaluate("/r/namespace::a", lang)[0]),
      true,
    );
  });
});

describe("namespaceNodes helpers", () => {
  it("derives bindings from names of DOM-built trees", () => {
    const built = xml("<r/>");
    const element = built.createElementNS("urn:p", "p:x");
    element.setAttributeNS("urn:q", "q:y", "1");
    element.setAttributeNS(XML_NS, "xml:lang", "en");
    built.documentElement.appendChild(element);
    assert.deepStrictEqual(inScopeBindings(element), [
      ["xml", XML_NS],
      ["p", "urn:p"],
      ["q", "urn:q"],
    ]);
  });

  it("ignores element names in HTML documents", () => {
    const html = new JSDOM("<p xmlns:a='urn:a'>t</p>").window.document;
    const p = html.querySelector("p");
    assert.deepStrictEqual(inScopeBindings(p), [
      ["xml", XML_NS],
      ["a", "urn:a"],
    ]);
  });

  it("recognises namespace nodes and returns copies of the cached axis", () => {
    const cache = new WeakMap();
    const axis = namespaceAxis(doc.documentElement, cache);
    assert.ok(isNamespaceNode(axis[0]));
    assert.ok(!isNamespaceNode(doc.documentElement));
    assert.ok(!isNamespaceNode(null));
    axis.pop();
    assert.strictEqual(namespaceAxis(doc.documentElement, cache).length, 3);
  });
});
