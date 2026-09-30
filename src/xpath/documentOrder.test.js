/**
 * Document order of attributes and namespace nodes (XPath 1.0 section 5).
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import {
  DocumentOrderIndex,
  compareDomPositions,
  compareNodeOrder,
  hasNativePositionComparison,
  hasPositionComparison,
} from "./documentOrder.js";
import { XSLTProcessor } from "../index.js";
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

describe("DocumentOrderIndex", () => {
  const source = new JSDOM('<r xmlns:a="u" b="1" c="2"><k><l/></k><m/></r>', {
    contentType: "application/xml",
  }).window.document;
  const root = source.documentElement;
  const [k, m] = [root.firstChild, root.lastChild];
  const l = k.firstChild;
  const [b, c] = [root.getAttributeNode("b"), root.getAttributeNode("c")];
  const [xmlNs, aNs] = namespaceAxis(root, new WeakMap());

  it("sorts elements, namespace nodes and attributes in document order", () => {
    const order = new DocumentOrderIndex();
    const nodes = [m, c, l, aNs, k, b, xmlNs, root, source];
    assert.strictEqual(order.sort(nodes), nodes);
    assert.deepStrictEqual(nodes, [source, root, xmlNs, aNs, b, c, k, l, m]);
  });

  it("orders trees by first use and numbers added nodes again", () => {
    const order = new DocumentOrderIndex();
    const other = source.implementation.createDocument(null, "o", null);
    assert.ok(order.positionOf(other.documentElement) < order.positionOf(l));
    const added = other.createElement("n");
    other.documentElement.appendChild(added);
    assert.ok(order.positionOf(added) > order.positionOf(root));
    assert.ok(order.positionOf(other.documentElement) > order.positionOf(l));
  });

  it("numbers detached attributes and orphans of inconsistent trees", () => {
    const order = new DocumentOrderIndex();
    assert.strictEqual(order.positionOf(source.createAttribute("d")), 0);
    const parent = { nodeType: 1, parentNode: null, firstChild: null };
    const orphan = { nodeType: 1, parentNode: parent };
    assert.strictEqual(order.positionOf(orphan), 2);
    assert.strictEqual(order.positionOf(parent), 1);
    const stray = { nodeType: 2, ownerElement: root };
    assert.deepStrictEqual(order.sort([stray, k, root]), [root, stray, k]);
  });
});

describe("compareDomPositions and hasPositionComparison", () => {
  it("reads compareDocumentPosition", () => {
    const k = r.firstChild;
    assert.strictEqual(compareDomPositions(r, k), -1);
    assert.strictEqual(compareDomPositions(k, r), 1);
    const disconnected = { compareDocumentPosition: () => 1 };
    assert.strictEqual(compareDomPositions(disconnected, r), 0);
  });

  it("looks at the element of a namespace node", () => {
    const [xmlNs] = namespaceAxis(r, new WeakMap());
    assert.strictEqual(hasPositionComparison(xmlNs), true);
    assert.strictEqual(hasPositionComparison({ nodeType: 1 }), false);
  });
});

describe("hasNativePositionComparison", () => {
  it("tells built-in methods from JavaScript ones", () => {
    assert.strictEqual(hasNativePositionComparison(r), false);
    assert.strictEqual(hasNativePositionComparison({}), false);
    const native = { compareDocumentPosition: Array.prototype.push };
    assert.strictEqual(hasNativePositionComparison(native), true);
  });

  it("lets transformations use a native compareDocumentPosition", () => {
    const source = new JSDOM("<r><a/><b x='1'/></r>", {
      contentType: "application/xml",
    }).window.document;
    // A bound method reports [native code], as browser methods do
    source.compareDocumentPosition =
      source.compareDocumentPosition.bind(source);
    const processor = new XSLTProcessor();
    processor.importStylesheet(
      new JSDOM(
        `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:output method="text"/>
          <xsl:template match="/"><xsl:for-each select="//b/@x | //b | //a"><xsl:value-of select="name()"/></xsl:for-each></xsl:template>
        </xsl:stylesheet>`,
        { contentType: "application/xml" },
      ).window.document,
    );
    assert.strictEqual(processor.transformToString(source), "abx");
    assert.strictEqual(processor.engine.xpathEvaluator.documentOrder, null);
  });
});
