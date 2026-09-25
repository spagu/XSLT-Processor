/**
 * XSLT pattern matcher tests (XSLT 1.0 section 5.2).
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { XPathEvaluator } from "../xpath/evaluator.js";
import { PatternMatcher, compilePattern } from "./patterns.js";

let dom;
let matcher;

/**
 * Parse an XML string with the jsdom parser.
 *
 * @param {string} xml - Markup to parse
 * @returns {Document} The parsed document
 */
function parseXML(xml) {
  return new dom.window.DOMParser().parseFromString(xml, "application/xml");
}

/**
 * Names of the nodes of a document that match a pattern, in document order.
 *
 * @param {Document} doc - The document to scan
 * @param {string} pattern - The pattern to test
 * @param {object} [host] - XSLT context (variables, namespaces)
 * @returns {string[]} Labels of matching nodes (`name`, `@name`, `#text`...)
 */
function matching(doc, pattern, host) {
  const labels = [];
  const visit = (node) => {
    if (matcher.matches(node, pattern, host)) {
      labels.push(
        node.nodeType === 2 ? `@${node.name}` : node.nodeName.toLowerCase(),
      );
    }
    for (const attribute of node.attributes || []) {
      if (matcher.matches(attribute, pattern, host)) {
        labels.push(`@${attribute.name}`);
      }
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(doc);
  return labels;
}

beforeEach(() => {
  dom = new JSDOM("");
  matcher = new PatternMatcher(new XPathEvaluator());
});

describe("compilePattern", () => {
  it("splits unions and turns // into separators", () => {
    const [first, second] = compilePattern("a/b | //c");
    assert.deepStrictEqual(
      first.steps.map((s) => s.separator),
      [null, "/"],
    );
    assert.deepStrictEqual(
      second.steps.map((s) => s.separator),
      ["//"],
    );
  });

  it("rejects axes other than child and attribute", () => {
    assert.throws(() => compilePattern("ancestor::a"), /Axis not allowed/);
  });

  it("rejects expressions that are not location paths", () => {
    assert.throws(() => compilePattern("1 + 2"), /Unsupported pattern/);
    assert.throws(() => compilePattern("$v/a"), /Unsupported pattern/);
  });

  it("rejects a trailing //", () => {
    assert.throws(() => compilePattern("//"), /cannot end/);
  });
});

describe("PatternMatcher", () => {
  it("never matches an invalid pattern and caches the compilation", () => {
    const doc = parseXML("<r/>");
    assert.strictEqual(matcher.matches(doc.documentElement, "[[["), false);
    assert.deepStrictEqual(matcher.compile("[[["), []);
    assert.strictEqual(matcher.compile("r"), matcher.compile("r"));
  });

  it("matches '/' against root nodes only", () => {
    const doc = parseXML("<r><a/></r>");
    assert.deepStrictEqual(matching(doc, "/"), ["#document"]);
    assert.strictEqual(
      matcher.matches(doc.createDocumentFragment(), "/"),
      true,
    );
  });

  it("does not match the root node with node()", () => {
    const doc = parseXML("<r>t</r>");
    assert.deepStrictEqual(matching(doc, "node()"), ["r", "#text"]);
  });

  it("matches absolute paths anchored on the root", () => {
    const doc = parseXML("<r><a><a/></a></r>");
    assert.deepStrictEqual(matching(doc, "/r/a"), ["a"]);
    assert.deepStrictEqual(matching(doc, "//a"), ["a", "a"]);
  });

  it("matches a bare id() pattern", () => {
    const doc = parseXML('<r><a id="x"/><a id="y"/></r>');
    assert.deepStrictEqual(matching(doc, "id('y')"), ["a"]);
    assert.strictEqual(
      matcher.matches(doc.documentElement.lastChild, "id('y')"),
      true,
    );
  });

  it("matches attributes but never namespace declarations", () => {
    const doc = parseXML('<r xmlns:p="urn:p" a="1" p:b="2"><e a="3"/></r>');
    assert.deepStrictEqual(matching(doc, "@*"), ["@a", "@p:b", "@a"]);
    assert.deepStrictEqual(matching(doc, "e/@a"), ["@a"]);
    assert.deepStrictEqual(matching(doc, "@*[2]"), ["@p:b"]);
    assert.deepStrictEqual(matching(doc, "r/@*[last()]"), ["@p:b"]);
  });

  it("uses namespaces and variables of the host context", () => {
    const doc = parseXML('<r xmlns="urn:x"><i n="1"/><i n="2"/></r>');
    const host = {
      namespaces: { x: "urn:x" },
      variables: { v: "2" },
      parameters: {},
    };
    assert.deepStrictEqual(matching(doc, "x:i[@n = $v]", host), ["i"]);
    assert.deepStrictEqual(matching(doc, "x:*", host), ["r", "i", "i"]);
  });

  it("evaluates numeric predicates against the sibling position", () => {
    const doc = parseXML("<r><i/><j/><i/><i/></r>");
    assert.deepStrictEqual(matching(doc, "i[2]"), ["i"]);
    assert.strictEqual(
      matcher.matches(doc.documentElement.childNodes[2], "i[2]"),
      true,
    );
    assert.strictEqual(
      matcher.matches(doc.documentElement.childNodes[3], "i[position() = 3]"),
      true,
    );
    assert.strictEqual(
      matcher.matches(doc.documentElement.childNodes[3], "i[count(../j) + 2]"),
      true,
    );
  });

  it("counts positions after the preceding predicates", () => {
    const doc = parseXML('<r><i/><i n="1"/><i/><i n="2"/></r>');
    assert.strictEqual(
      matcher.matches(doc.documentElement.childNodes[3], "i[@n][2]"),
      true,
    );
    assert.strictEqual(
      matcher.matches(doc.documentElement.childNodes[1], "i[@n][2]"),
      false,
    );
  });

  it("gives a parentless node position 1", () => {
    const doc = parseXML("<r/>");
    const orphan = doc.createElement("i");
    assert.strictEqual(matcher.matches(orphan, "i[1]"), true);
    assert.strictEqual(matcher.matches(orphan, "i[last() = 1]"), true);
  });

  it("recomputes positions after reset()", () => {
    const doc = parseXML("<r><i/></r>");
    const first = doc.documentElement.firstChild;
    assert.strictEqual(matcher.matches(first, "i[last()]"), true);
    doc.documentElement.appendChild(doc.createElement("i"));
    assert.strictEqual(matcher.matches(first, "i[last()]"), true);
    matcher.reset();
    assert.strictEqual(matcher.matches(first, "i[last()]"), false);
  });

  it("walks every ancestor for //", () => {
    const doc = parseXML("<r><a><b><c/></b></a><c/></r>");
    assert.deepStrictEqual(matching(doc, "a//c"), ["c"]);
    assert.deepStrictEqual(matching(doc, "r//b/c"), ["c"]);
    assert.deepStrictEqual(matching(doc, "x//c"), []);
  });

  it("anchors on key() with a host function", () => {
    const doc = parseXML('<r><a k="1"><d/></a><a><d/></a></r>');
    const evaluator = new XPathEvaluator();
    evaluator.registerFunctions({
      key: (args, ctx) =>
        Array.from(
          (ctx.node.ownerDocument || ctx.node).getElementsByTagName("a"),
        ).filter((a) => a.getAttribute("k") === "1"),
    });
    matcher = new PatternMatcher(evaluator);
    assert.deepStrictEqual(matching(doc, "key('k', '1')/d"), ["d"]);
    assert.deepStrictEqual(matching(doc, "key('k', '1')//d"), ["d"]);
  });
});
