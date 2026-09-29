/**
 * Document order of attributes and namespace nodes (XPath 1.0 section 5).
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { compareNodeOrder } from "./documentOrder.js";
import { namespaceAxis } from "./namespaceNodes.js";
import { select } from "./index.js";

const doc = new JSDOM('<r xmlns:a="u" b="1" c="2"><k/></r>', {
  contentType: "application/xml",
}).window.document;
const r = doc.documentElement;

/**
 * Order two DOM nodes like the evaluator does.
 *
 * @param {Node} a - First node
 * @param {Node} b - Second node
 * @returns {number} -1 or 1
 */
const compareDom = (a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1);

describe("compareNodeOrder", () => {
  const [xmlNs, aNs] = namespaceAxis(r, new WeakMap());
  const b = r.getAttributeNode("b");
  const c = r.getAttributeNode("c");
  const k = r.firstChild;

  it("puts an element before its namespace nodes, attributes and children", () => {
    assert.ok(compareNodeOrder(r, xmlNs, compareDom) < 0);
    assert.ok(compareNodeOrder(r, b, compareDom) < 0);
    assert.ok(compareNodeOrder(b, r, compareDom) > 0);
    assert.ok(compareNodeOrder(aNs, b, compareDom) < 0);
    assert.ok(compareNodeOrder(b, k, compareDom) < 0);
    assert.ok(compareNodeOrder(k, aNs, compareDom) > 0);
  });

  it("orders namespace nodes by index and attributes by the DOM", () => {
    assert.ok(compareNodeOrder(aNs, xmlNs, compareDom) > 0);
    assert.ok(compareNodeOrder(b, c, compareDom) < 0);
    assert.ok(compareNodeOrder(c, b, compareDom) > 0);
  });

  it("orders a detached attribute as itself", () => {
    const detached = doc.createAttribute("d");
    let seen = null;
    compareNodeOrder(detached, r, (x, y) => {
      seen = [x, y];
      return 1;
    });
    assert.deepStrictEqual(seen, [detached, r]);
  });

  it("sorts a union of an element and its attributes in document order", () => {
    const nodes = select("/r/@c | /r/@b | /r", doc);
    assert.deepStrictEqual(
      nodes.map((node) => node.nodeName),
      ["r", "b", "c"],
    );
  });
});
