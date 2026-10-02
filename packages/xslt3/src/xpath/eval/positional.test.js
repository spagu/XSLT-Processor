import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseXPath } from "../syntax/index.js";
import { parse, xs } from "../testing.test.js";
import { isPositionIndependent } from "./positional.js";
import { createStaticContext } from "./staticContext.js";

const sc = createStaticContext({ namespaces: { f: "urn:f" } }, null);
const independent = (predicate) =>
  isPositionIndependent(parseXPath(predicate), sc);

describe("position-independent predicates", () => {
  it("accepts boolean and node-valued predicates", () => {
    assert.ok(independent("@a = 1"));
    assert.ok(independent("a and b"));
    assert.ok(independent("b"));
    assert.ok(independent("a/b"));
    assert.ok(independent("some $x in a satisfies $x"));
    assert.ok(independent(". instance of element()"));
    assert.ok(independent("not(a)"));
    assert.ok(independent("fn:exists(a)"));
  });

  it("rejects numbers, unknown functions and focus size or position", () => {
    assert.ok(!independent("1"));
    assert.ok(!independent("$n"));
    assert.ok(!independent("count(a)"));
    assert.ok(!independent("f:not(a)"));
    assert.ok(!independent("Q{http://www.w3.org/2005/xpath-functions}not(a)"));
    assert.ok(!independent("a/string()"));
    assert.ok(!independent("/"));
    assert.ok(!independent("position() = 1"));
    assert.ok(!independent("(a, last#0) = 1"));
    const other = createStaticContext(
      { defaultFunctionNamespace: "urn:x" },
      null,
    );
    assert.ok(!isPositionIndependent(parseXPath("not(a)"), other));
  });

  it("keeps the meaning of // with positional predicates", () => {
    const doc = parse("<r><a><b/><b/></a><a><b/></a></r>");
    assert.equal(xs("count(//b[1])", doc), "2");
    assert.equal(xs("count(//b[position() = 1])", doc), "2");
    assert.equal(xs("count(//b[true()])", doc), "3");
    assert.equal(xs("count((//b)[1])", doc), "1");
  });
});
