/**
 * Axis traversal tests: document order of results and proximity positions
 * on reverse axes (XPath 1.0 section 2.4).
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { select, parse, XPathContext, XPathEvaluator } from "./index.js";

const doc = new JSDOM(
  `<r><a id="a1"><x id="x1"/><x id="x2"/></a><b id="b1"/><c id="c1"><y id="y1"/></c><d id="d1"/></r>`,
  { contentType: "application/xml" },
).window.document;

const byId = (id) => doc.querySelector(`[id="${id}"]`);
const ids = (expr, node) => select(expr, node).map((n) => n.getAttribute("id"));

describe("reverse axes use proximity positions in predicates", () => {
  it("preceding-sibling::*[1] is the nearest preceding sibling", () => {
    assert.deepStrictEqual(ids("preceding-sibling::*[1]", byId("d1")), ["c1"]);
    assert.deepStrictEqual(ids("preceding-sibling::*[last()]", byId("d1")), [
      "a1",
    ]);
  });

  it("preceding::*[1] is the nearest preceding node, excluding ancestors", () => {
    assert.deepStrictEqual(ids("preceding::*[1]", byId("y1")), ["b1"]);
    assert.deepStrictEqual(ids("preceding::*[2]", byId("y1")), ["x2"]);
    assert.deepStrictEqual(ids("preceding::*", byId("y1")), [
      "a1",
      "x1",
      "x2",
      "b1",
    ]);
  });

  it("ancestor::*[1] is the parent", () => {
    assert.strictEqual(
      select("ancestor::*[1]", byId("y1"))[0].getAttribute("id"),
      "c1",
    );
    assert.strictEqual(select("ancestor::*[1]", byId("y1"))[0].nodeName, "c");
  });

  it("ancestor-or-self::*[1] is the node itself", () => {
    assert.deepStrictEqual(ids("ancestor-or-self::*[1]", byId("y1")), ["y1"]);
  });

  it("position() counts from the context node on reverse axes", () => {
    assert.deepStrictEqual(
      ids("preceding-sibling::*[position() <= 2]", byId("d1")),
      ["b1", "c1"],
    );
  });

  it("still returns reverse-axis node-sets in document order", () => {
    assert.deepStrictEqual(ids("preceding-sibling::*", byId("d1")), [
      "a1",
      "b1",
      "c1",
    ]);
  });
});

describe("forward axes", () => {
  it("following::* excludes descendants and is in document order", () => {
    assert.deepStrictEqual(ids("following::*", byId("a1")), [
      "b1",
      "c1",
      "y1",
      "d1",
    ]);
    assert.deepStrictEqual(ids("following::*[1]", byId("x1")), ["x2"]);
  });

  it("descendant::* is in document order", () => {
    assert.deepStrictEqual(ids("descendant::*", doc.documentElement), [
      "a1",
      "x1",
      "x2",
      "b1",
      "c1",
      "y1",
      "d1",
    ]);
  });

  it("deduplicates and orders results from several context nodes", () => {
    assert.deepStrictEqual(ids("//x/following::*", doc), [
      "x2",
      "b1",
      "c1",
      "y1",
      "d1",
    ]);
    assert.deepStrictEqual(
      ids("//*[@id='y1' or @id='x2']/ancestor::*[@id]", doc),
      ["a1", "c1"],
    );
  });

  it("handles wide documents without exceeding the call stack", () => {
    const items = "<i/>".repeat(150000);
    const wide = new JSDOM(`<r>${items}<last/></r>`, {
      contentType: "application/xml",
    }).window.document;
    const evaluator = new XPathEvaluator({ maxResultSize: 1000000 });
    const count = (expr) =>
      evaluator.evaluate(parse(expr), new XPathContext(wide));

    assert.strictEqual(count("count(//i)"), 150000);
    assert.strictEqual(count("count(/r/i[1]/following::*)"), 150000);
    assert.strictEqual(count("count(/r/last/preceding::*)"), 150000);
  });
});

describe("axis edge cases", () => {
  const deep = new JSDOM(
    `<r><a id="a"><b id="b"><c id="c"/><d id="d"/></b><e id="e"/></a><t id="t" k="v"><u id="u"/></t><z id="z"/></r>`,
    { contentType: "application/xml" },
  ).window.document;
  const at = (id) => deep.querySelector(`[id="${id}"]`);
  const idsIn = (expr, node) =>
    select(expr, node).map((n) => n.getAttribute("id"));

  it("walks nested subtrees on the preceding axis", () => {
    assert.deepStrictEqual(idsIn("preceding::*", at("z")), [
      "a",
      "b",
      "c",
      "d",
      "e",
      "t",
      "u",
    ]);
    assert.deepStrictEqual(idsIn("preceding::*[1]", at("t")), ["e"]);
    assert.deepStrictEqual(idsIn("preceding::*[3]", at("t")), ["c"]);
  });

  it("treats an attribute as positioned before its owner's children", () => {
    const attr = at("t").getAttributeNode("k");
    assert.deepStrictEqual(idsIn("following::*", attr), ["u", "z"]);
    assert.deepStrictEqual(idsIn("preceding::*[1]", attr), ["e"]);
    assert.deepStrictEqual(idsIn("parent::*", attr), ["t"]);
    assert.deepStrictEqual(idsIn("ancestor::*[1]", attr), ["t"]);
    assert.deepStrictEqual(idsIn("following-sibling::*", attr), []);
    assert.deepStrictEqual(idsIn("preceding-sibling::*", attr), []);
  });

  it("enforces the result limit while merging several context nodes", () => {
    const evaluator = new XPathEvaluator({ maxResultSize: 3 });
    assert.throws(
      () =>
        evaluator.evaluate(
          parse("//*/descendant-or-self::*"),
          new XPathContext(deep),
        ),
      /exceeds maximum size/,
    );
  });

  it("matches HTML element names case-insensitively", () => {
    const html = new JSDOM("<!DOCTYPE html><body><DIV id='x'></DIV></body>")
      .window.document;
    assert.strictEqual(select("//DIV", html).length, 1);
    assert.strictEqual(select("//div", html).length, 1);
    assert.strictEqual(select("//span", html).length, 0);
  });
});
