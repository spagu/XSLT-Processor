/**
 * Tests of the XPath 1.0 node-set functions (section 4.1) and lang() (4.3):
 * names of nodes without an expanded name, id() over node-sets, argument type
 * errors, the root node of fragments and xml:lang lookup.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { evaluate, select, selectFirst } from "./index.js";
import { rootNodeOf } from "./axes.js";

const { window } = new JSDOM("");

/**
 * Parse an XML string.
 *
 * @param {string} xml - Markup
 * @returns {Document} The document
 */
function parseXml(xml) {
  return new window.DOMParser().parseFromString(xml, "application/xml");
}

describe("name(), local-name() and namespace-uri() of unnamed nodes", () => {
  const doc = parseXml(
    `<a xmlns:p="urn:p" p:k="v">t<!--c--><?pi x?><p:b/></a>`,
  );

  it("returns the empty string for the root node", () => {
    assert.strictEqual(evaluate("name(/)", doc), "");
    assert.strictEqual(evaluate("local-name(/)", doc), "");
    assert.strictEqual(evaluate("namespace-uri(/)", doc), "");
    assert.strictEqual(evaluate("name()", doc), "");
  });

  it("returns the empty string for text and comment nodes", () => {
    for (const fn of ["name", "local-name", "namespace-uri"]) {
      assert.strictEqual(evaluate(`${fn}(//text())`, doc), "");
      assert.strictEqual(evaluate(`${fn}(//comment())`, doc), "");
    }
  });

  it("returns the target of a processing instruction", () => {
    assert.strictEqual(evaluate("name(//processing-instruction())", doc), "pi");
    assert.strictEqual(
      evaluate("local-name(//processing-instruction())", doc),
      "pi",
    );
    assert.strictEqual(
      evaluate("namespace-uri(//processing-instruction())", doc),
      "",
    );
  });

  it("keeps the names of elements and attributes", () => {
    const options = { namespaces: { p: "urn:p" } };
    assert.strictEqual(evaluate("name(//p:b)", doc, options), "p:b");
    assert.strictEqual(evaluate("local-name(//p:b)", doc, options), "b");
    assert.strictEqual(evaluate("namespace-uri(//p:b)", doc, options), "urn:p");
    assert.strictEqual(evaluate("name(/a/@*)", doc), "p:k");
    assert.strictEqual(evaluate("local-name(/a/@*)", doc), "k");
    assert.strictEqual(evaluate("namespace-uri(/a/@*)", doc), "urn:p");
  });

  it("selects text nodes with node()[name()='']", () => {
    const found = select("/a/node()[name()='']", doc);
    assert.deepStrictEqual(
      found.map((n) => n.nodeType),
      [3, 8],
    );
  });

  it("returns the empty string for an empty node-set", () => {
    assert.strictEqual(evaluate("name(/none)", doc), "");
    assert.strictEqual(evaluate("local-name(/none)", doc), "");
    assert.strictEqual(evaluate("namespace-uri(/none)", doc), "");
  });

  it("accepts a single node (result tree fragment) argument", () => {
    const fragment = doc.createDocumentFragment();
    const options = { variables: { f: fragment, e: doc.documentElement } };
    assert.strictEqual(evaluate("name($f)", doc, options), "");
    assert.strictEqual(evaluate("name($e)", doc, options), "a");
  });
});

describe("id()", () => {
  const doc = parseXml(
    `<!DOCTYPE r [<!ATTLIST i id ID #IMPLIED>]>` +
      `<r><i id="a">A</i><i id="b">B</i><i id="c">C</i>` +
      `<refs><ref>c a</ref><ref>b
c</ref></refs></r>`,
  );
  const ids = (expr) => select(expr, doc).map((n) => n.getAttribute("id"));

  it("returns the nodes in document order without duplicates", () => {
    assert.deepStrictEqual(ids("id('c a c')"), ["a", "c"]);
  });

  it("splits the string value of every node of a node-set", () => {
    assert.deepStrictEqual(ids("id(//ref)"), ["a", "b", "c"]);
  });

  it("returns an empty node-set for unknown ids", () => {
    assert.deepStrictEqual(ids("id('zz')"), []);
    assert.deepStrictEqual(ids("id(//none)"), []);
  });

  it("converts other types to a string", () => {
    assert.deepStrictEqual(ids("id(concat('b', ''))"), ["b"]);
  });
});

describe("node-set argument type errors", () => {
  const doc = parseXml(`<r><n>1</n><n>2</n></r>`);

  for (const expr of [
    "count(5)",
    "count(true())",
    "count('x')",
    "sum(5)",
    "sum('x')",
    "name(1)",
    "local-name('x')",
    "namespace-uri(true())",
  ]) {
    it(`${expr} throws a type error`, () => {
      const fn = expr.slice(0, expr.indexOf("("));
      assert.throws(
        () => evaluate(expr, doc),
        new RegExp(`${fn}\\(\\) expects a node-set`),
      );
    });
  }

  it("still accepts node-sets and single nodes", () => {
    const fragment = doc.createDocumentFragment();
    fragment.appendChild(doc.createTextNode("5"));
    const options = { variables: { f: fragment } };
    assert.strictEqual(evaluate("count(//n)", doc), 2);
    assert.strictEqual(evaluate("sum(//n)", doc), 3);
    assert.strictEqual(evaluate("count($f)", doc, options), 1);
    assert.strictEqual(evaluate("sum($f)", doc, options), 5);
  });
});

describe("rootNodeOf()", () => {
  const doc = parseXml(`<r k="v"><a/></r>`);

  it("returns the document of attached nodes", () => {
    const attribute = doc.documentElement.getAttributeNode("k");
    assert.strictEqual(rootNodeOf(doc), doc);
    assert.strictEqual(rootNodeOf(doc.documentElement.firstChild), doc);
    assert.strictEqual(rootNodeOf(attribute), doc);
  });

  it("returns the fragment that contains a node", () => {
    const fragment = doc.createDocumentFragment();
    const element = fragment.appendChild(doc.createElement("x"));
    element.setAttribute("q", "1");
    assert.strictEqual(rootNodeOf(fragment), fragment);
    assert.strictEqual(rootNodeOf(element), fragment);
    assert.strictEqual(rootNodeOf(element.getAttributeNode("q")), fragment);
  });

  it("falls back to the owner document for detached nodes", () => {
    const element = doc.createElement("x");
    const attribute = doc.createAttribute("q");
    assert.strictEqual(rootNodeOf(element), doc);
    assert.strictEqual(rootNodeOf(attribute), doc);
  });

  it("makes absolute paths start at the fragment root", () => {
    const fragment = doc.createDocumentFragment();
    const element = fragment.appendChild(doc.createElement("a"));
    element.appendChild(doc.createElement("b"));
    assert.strictEqual(evaluate("count(/a)", element), 1);
    assert.strictEqual(evaluate("count(/r)", element), 0);
    assert.strictEqual(selectFirst("/", element.firstChild), fragment);
  });
});

describe("lang()", () => {
  const doc = parseXml(
    `<r xml:lang="en-GB"><p k="v">text<!--c--></p>` +
      `<q lang="de"><s/></q><t xml:lang=""><u/></t></r>`,
  );
  const root = doc.documentElement;

  it("matches the language and its sublanguages", () => {
    const p = root.firstChild;
    assert.strictEqual(evaluate("lang('en')", p), true);
    assert.strictEqual(evaluate("lang('EN-gb')", p), true);
    assert.strictEqual(evaluate("lang('fr')", p), false);
  });

  it("starts from the parent of text, comment and attribute nodes", () => {
    const p = root.firstChild;
    assert.strictEqual(evaluate("lang('en')", p.firstChild), true);
    assert.strictEqual(evaluate("lang('en')", p.lastChild), true);
    assert.strictEqual(evaluate("lang('en')", p.getAttributeNode("k")), true);
  });

  it("ignores a plain lang attribute", () => {
    const s = root.childNodes[1].firstChild;
    assert.strictEqual(evaluate("lang('de')", s), false);
    assert.strictEqual(evaluate("lang('en')", s), true);
  });

  it("stops at an empty xml:lang", () => {
    const u = root.lastChild.firstChild;
    assert.strictEqual(evaluate("lang('en')", u), false);
  });

  it("is false without any xml:lang", () => {
    assert.strictEqual(evaluate("lang('en')", doc), false);
    const bare = parseXml("<a>x</a>");
    assert.strictEqual(evaluate("lang('en')", bare.documentElement), false);
  });
});
