/**
 * `xsl:key` index registry tests.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { KeyIndexRegistry } from "./keys.js";

let dom;

function parseXML(xmlString) {
  return new dom.window.DOMParser().parseFromString(
    xmlString,
    "application/xml",
  );
}

/**
 * Build a registry over element name patterns and attribute based `use` values.
 *
 * @param {Object} keys - Key declarations by name
 * @returns {{registry: KeyIndexRegistry, builds: string[]}} Registry and build log
 */
function createRegistry(keys) {
  const builds = [];
  const registry = new KeyIndexRegistry({
    keys,
    matchesPattern: (node, pattern) =>
      node.nodeType === 1 && node.nodeName === pattern,
    evaluateUse: (node, expression) => {
      builds.push(`${node.nodeName}/${expression}`);
      if (expression.startsWith("@")) {
        const value = node.getAttribute(expression.slice(1));
        return value === null ? [] : [value];
      }
      return [node.textContent];
    },
  });

  return { registry, builds };
}

describe("KeyIndexRegistry", () => {
  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      contentType: "text/html",
    });
  });

  it("should find every node sharing a key value", () => {
    const doc = parseXML(
      '<root><i t="a">1</i><i t="b">2</i><i t="a">3</i></root>',
    );
    const { registry } = createRegistry({ byType: { match: "i", use: "@t" } });

    const nodes = registry.lookup("byType", "a", doc);

    assert.strictEqual(nodes.length, 2);
    assert.strictEqual(nodes[0].textContent, "1");
    assert.strictEqual(nodes[1].textContent, "3");
  });

  it("should union several key values without duplicates", () => {
    const doc = parseXML('<root><i t="a"/><i t="b"/></root>');
    const { registry } = createRegistry({ byType: { match: "i", use: "@t" } });

    assert.strictEqual(
      registry.lookup("byType", ["a", "b", "a"], doc).length,
      2,
    );
  });

  it("should return an empty node-set for an unknown value", () => {
    const doc = parseXML('<root><i t="a"/></root>');
    const { registry } = createRegistry({ byType: { match: "i", use: "@t" } });

    assert.deepStrictEqual(registry.lookup("byType", "zzz", doc), []);
  });

  it("should throw for an undeclared key", () => {
    const doc = parseXML("<root/>");
    const { registry } = createRegistry({});

    assert.throws(() => registry.lookup("missing", "a", doc), /Undefined key/);
  });

  it("should build each index only once per document", () => {
    const doc = parseXML('<root><i t="a"/></root>');
    const { registry, builds } = createRegistry({
      byType: { match: "i", use: "@t" },
    });

    registry.lookup("byType", "a", doc);
    registry.lookup("byType", "a", doc);

    assert.strictEqual(builds.length, 1);
  });

  it("should index each document separately", () => {
    const first = parseXML('<root><i t="a">first</i></root>');
    const second = parseXML('<root><i t="a">second</i></root>');
    const { registry } = createRegistry({ byType: { match: "i", use: "@t" } });

    assert.strictEqual(
      registry.lookup("byType", "a", first)[0].textContent,
      "first",
    );
    assert.strictEqual(
      registry.lookup("byType", "a", second)[0].textContent,
      "second",
    );
  });

  it("should rebuild indexes after clear", () => {
    const doc = parseXML('<root><i t="a"/></root>');
    const { registry, builds } = createRegistry({
      byType: { match: "i", use: "@t" },
    });

    registry.lookup("byType", "a", doc);
    registry.clear();
    registry.lookup("byType", "a", doc);

    assert.strictEqual(builds.length, 2);
  });

  it("should support several keys over the same document", () => {
    const doc = parseXML('<root><i t="a">one</i><j t="a">two</j></root>');
    const { registry } = createRegistry({
      byI: { match: "i", use: "@t" },
      byJ: { match: "j", use: "@t" },
    });

    assert.strictEqual(registry.lookup("byI", "a", doc)[0].textContent, "one");
    assert.strictEqual(registry.lookup("byJ", "a", doc)[0].textContent, "two");
  });

  it("should skip nodes whose use expression yields nothing", () => {
    const doc = parseXML('<root><i/><i t="a"/></root>');
    const { registry } = createRegistry({ byType: { match: "i", use: "@t" } });

    assert.strictEqual(registry.lookup("byType", "a", doc).length, 1);
  });

  it("should visit attribute nodes while indexing", () => {
    const doc = parseXML('<root><i t="a"/></root>');
    const { registry, builds } = createRegistry({
      byType: { match: "i", use: "text()" },
    });

    registry.lookup("byType", "", doc);

    assert.deepStrictEqual(builds, ["i/text()"]);
  });
});
