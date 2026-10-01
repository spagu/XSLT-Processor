/**
 * The standalone XPath API (evaluate, select, XPathEvaluator) on DOMs whose
 * compareDocumentPosition is written in JavaScript (@xmldom/xmldom, jsdom):
 * node-sets are sorted with a document order index, numbered once per
 * evaluation, instead of one compareDocumentPosition call per comparison
 * (task 0036: 20,000 nodes took 7 to 33 s on xmldom).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";
import { parse } from "./parser.js";
import { XPathContext, XPathEvaluator, XPathLimits } from "./evaluator.js";
import { evaluate, select } from "./index.js";

const items = (count) =>
  new DOMParser().parseFromString(
    `<list>${Array.from({ length: count }, (_, i) => `<item n="${i}"/>`).join("")}</list>`,
    "text/xml",
  );

/** Counts the compareDocumentPosition calls made on the nodes of a document. */
function countComparisons(doc) {
  const proto = Object.getPrototypeOf(doc.documentElement);
  const original = proto.compareDocumentPosition;
  const counter = { calls: 0 };
  proto.compareDocumentPosition = function compare(other) {
    counter.calls++;
    return original.call(this, other);
  };
  counter.restore = () => {
    proto.compareDocumentPosition = original;
  };
  return counter;
}

describe("standalone XPath API: document order", () => {
  it("sorts with an index, not compareDocumentPosition, on xmldom", () => {
    const doc = items(200);
    const counter = countComparisons(doc);
    try {
      const nodes = select("//item[@n mod 2 = 0] | //item[@n mod 3 = 0]", doc);
      assert.equal(nodes.length, 133);
      assert.deepEqual(
        nodes.slice(0, 5).map((n) => n.getAttribute("n")),
        ["0", "2", "3", "4", "6"],
      );
      assert.equal(counter.calls, 0);
    } finally {
      counter.restore();
    }
  });

  it("uses a native compareDocumentPosition directly (browsers)", () => {
    const doc = items(50);
    const proto = Object.getPrototypeOf(doc.documentElement);
    const original = proto.compareDocumentPosition;
    let calls = 0;
    // A Proxy around a function reads as native code, like a browser's method
    proto.compareDocumentPosition = new Proxy(original, {
      apply(target, self, args) {
        calls++;
        return Reflect.apply(target, self, args);
      },
    });
    try {
      const nodes = select("//item[@n > 45] | //item[@n < 2]", doc);
      assert.deepEqual(
        nodes.map((n) => n.getAttribute("n")),
        ["0", "1", "46", "47", "48", "49"],
      );
      assert.ok(calls > 0);
    } finally {
      proto.compareDocumentPosition = original;
    }
  });

  it("numbers the document again for each evaluation of a reused evaluator", () => {
    const doc = items(3);
    const evaluator = new XPathEvaluator();
    const run = () =>
      evaluator
        .evaluate(parse("//item | //list"), new XPathContext(doc))
        .map((n) => n.getAttribute("n") ?? n.nodeName);
    assert.deepEqual(run(), ["list", "0", "1", "2"]);
    const list = doc.documentElement;
    list.insertBefore(list.lastChild, list.firstChild);
    assert.deepEqual(run(), ["list", "2", "0", "1"]);
  });
});

describe("standalone XPath API: limits", () => {
  it("passes the evaluator limits through evaluate and select", () => {
    const doc = items(20);
    assert.throws(
      () => select("//item", doc, { maxResultSize: 10 }),
      /maximum size \(10\)/,
    );
    assert.equal(select("//item", doc).length, 20);
    const big = items(XPathLimits.MAX_RESULT_SIZE + 1);
    assert.throws(() => evaluate("//item", big), /maximum size/);
    assert.equal(
      evaluate("count(//item)", big, { maxResultSize: 20000 }),
      XPathLimits.MAX_RESULT_SIZE + 1,
    );
  });
});
