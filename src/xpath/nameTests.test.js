/**
 * Name tests and namespaces (XPath 1.0 section 2.3): an unprefixed QName
 * test only matches nodes in no namespace, as in libxslt (Chrome), unless
 * the deprecated `legacyNameTests` option restores the lax matching. HTML
 * documents keep matching their (XHTML) elements by unprefixed names,
 * case-insensitively, as browsers do.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { XPathContext, XPathEvaluator, parse } from "./index.js";

const xml = (markup) =>
  new JSDOM(markup, { contentType: "application/xml" }).window.document;

const doc = xml(
  '<r xmlns:x="urn:x" a="1" x:a="2"><item/><x:item/><d xmlns="urn:d"><item/></d></r>',
);

/**
 * Evaluate an expression with an evaluator configured by `options`.
 *
 * @param {string} expr - XPath expression
 * @param {Node} node - Context node
 * @param {object} [options] - Evaluator options
 * @returns {*} The result
 */
function evaluate(expr, node, options = {}) {
  const context = new XPathContext(node, 1, 1, {}, { x: "urn:x", d: "urn:d" });
  return new XPathEvaluator(options).evaluate(parse(expr), context);
}

describe("unprefixed name tests match only nodes in no namespace", () => {
  it("does not match prefixed or default-namespace elements", () => {
    assert.strictEqual(evaluate("count(//item)", doc), 1);
    assert.strictEqual(evaluate("count(//x:item)", doc), 1);
    assert.strictEqual(evaluate("count(//d:item)", doc), 1);
  });

  it("does not match namespaced attributes", () => {
    assert.strictEqual(evaluate("string(/r/@a)", doc), "1");
    assert.strictEqual(evaluate("count(/r/@a)", doc), 1);
    assert.strictEqual(evaluate("string(/r/@x:a)", doc), "2");
  });

  it("keeps * matching elements of any namespace", () => {
    assert.strictEqual(evaluate("count(//*)", doc), 5);
    assert.strictEqual(evaluate("count(/r/@*)", doc), 2);
  });

  it("restores the lax matching with legacyNameTests", () => {
    const legacy = { legacyNameTests: true };
    assert.strictEqual(evaluate("count(//item)", doc, legacy), 3);
    assert.strictEqual(evaluate("count(/r/@a)", doc, legacy), 2);
  });
});

describe("name tests in HTML documents", () => {
  const html = new JSDOM("<!DOCTYPE html><body><P id='p'>t</P><svg/></body>")
    .window.document;

  it("matches XHTML elements by unprefixed names, case-insensitively", () => {
    assert.strictEqual(evaluate("count(//p)", html), 1);
    assert.strictEqual(evaluate("count(//P)", html), 1);
    assert.strictEqual(evaluate("count(//BODY/p)", html), 1);
  });

  it("matches foreign (SVG) elements by unprefixed names", () => {
    assert.strictEqual(evaluate("count(//svg)", html), 1);
  });

  it("matches attributes by unprefixed names", () => {
    assert.strictEqual(evaluate("string(//p/@id)", html), "p");
  });
});
