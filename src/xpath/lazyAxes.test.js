/**
 * Positional steps (`axis::test[n]`, `axis::test[position() = n]`) stop
 * walking the axis at the n-th node. These tests check the lazy path returns
 * exactly what the general path (a predicate that is not recognised as
 * positional) returns, on every lazily walkable axis.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { select, parse, XPathContext, XPathEvaluator } from "./index.js";
import { AXIS_WALKERS } from "./axes.js";

const doc = new JSDOM(
  `<r><a id="a1"><x id="x1"><z id="z1"/></x>t1<x id="x2"/></a><b id="b1" k="v"/>` +
    `<c id="c1"><y id="y1"/><![CDATA[c]]>t2<y id="y2"/></c><d id="d1"/></r>`,
  { contentType: "application/xml" },
).window.document;

const byId = (id) => doc.querySelector(`[id="${id}"]`);
const label = (n) =>
  n.nodeType === 1
    ? (n.getAttribute("id") ?? n.nodeName)
    : `#${n.nodeType}:${n.nodeValue}`;
const labels = (expr, node) => select(expr, node).map(label);

const contexts = ["a1", "x2", "b1", "c1", "y1", "y2", "d1"];
const tests = ["*", "node()", "text()", "y"];

describe("lazy positional steps", () => {
  for (const axis of Object.keys(AXIS_WALKERS)) {
    it(`${axis}::test[n] matches the general evaluation`, () => {
      for (const id of contexts) {
        for (const test of tests) {
          for (const n of [1, 2, 3, 9]) {
            const general = labels(
              `${axis}::${test}[position() = ${n} and true()]`,
              byId(id),
            );
            assert.deepStrictEqual(
              labels(`${axis}::${test}[${n}]`, byId(id)),
              general,
              `${axis}::${test}[${n}] from ${id}`,
            );
            assert.deepStrictEqual(
              labels(`${axis}::${test}[position() = ${n}]`, byId(id)),
              general,
            );
            assert.deepStrictEqual(
              labels(`${axis}::${test}[${n} = position()]`, byId(id)),
              general,
            );
          }
        }
      }
    });
  }

  it("selects nothing for positions that are not whole numbers from 1", () => {
    for (const n of ["0", "1.5", "-1", "number('x')", "0 div 0"]) {
      assert.deepStrictEqual(
        labels(`following-sibling::*[${n}]`, byId("a1")),
        [],
      );
    }
  });

  it("applies the remaining predicates to the selected node", () => {
    assert.deepStrictEqual(
      labels("following-sibling::*[2][@k]", byId("a1")),
      [],
    );
    assert.deepStrictEqual(labels("following-sibling::*[1][@k]", byId("a1")), [
      "b1",
    ]);
    assert.deepStrictEqual(
      labels("following-sibling::*[1][last()]", byId("a1")),
      ["b1"],
    );
  });

  it("walks from attributes like the general path", () => {
    const attribute = byId("b1").getAttributeNode("k");
    const parentAttribute = byId("a1").getAttributeNode("id");
    assert.deepStrictEqual(labels("following::node()[3]", parentAttribute), [
      "#3:t1",
    ]);
    for (const axis of Object.keys(AXIS_WALKERS)) {
      assert.deepStrictEqual(
        labels(`${axis}::node()[1]`, attribute),
        labels(`${axis}::node()[position() = 1 and true()]`, attribute),
        axis,
      );
    }
  });

  it("does not treat other predicates as positional", () => {
    const evaluator = new XPathEvaluator();
    const step = (expr) => parse(expr).steps[0];
    for (const expr of [
      "x",
      "x[@k]",
      "x[position() != 1]",
      "x[position() = last()]",
      "x[last() = 1]",
      "x[p:position() = 1]",
      "x[position(.) = 1]",
      "x[1 = 1]",
    ]) {
      assert.strictEqual(evaluator.positionalPredicate(step(expr)), null, expr);
    }
    assert.strictEqual(evaluator.positionalPredicate(step("x[2]")), 2);
    assert.strictEqual(
      evaluator.positionalPredicate(step("x[position()=3]")),
      3,
    );
  });

  it("keeps self, parent and attribute steps on the general path", () => {
    const evaluator = new XPathEvaluator();
    const context = new XPathContext(byId("b1"));
    const result = evaluator.evaluate(parse("@*[1]"), context);
    assert.deepStrictEqual(
      result.map((n) => n.name),
      ["id"],
    );
    assert.deepStrictEqual(labels("self::*[1]", byId("b1")), ["b1"]);
    assert.deepStrictEqual(labels("parent::*[1]", byId("b1")), ["r"]);
  });
});
