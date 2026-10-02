import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateXPath } from "../xpath/index.js";
import { code, xs } from "../xpath/testing.test.js";

const C = "'http://www.w3.org/2005/xpath-functions/collation/codepoint'";

describe("count, empty, exists through the library", () => {
  it("tests and accesses sequences", () => {
    assert.equal(xs("count(()), empty(()), exists(1)"), "0 true true");
    assert.equal(
      xs("head((1, 2)), tail((1, 2, 3)), reverse((1, 2))"),
      "1 2 3 2 1",
    );
    assert.equal(xs("head(()), unordered((3, 1))"), "3 1");
    assert.equal(
      xs("zero-or-one(1), one-or-more((1, 2)), exactly-one(3)"),
      "1 1 2 3",
    );
    assert.equal(code("zero-or-one((1, 2))"), "FORG0003");
    assert.equal(code("one-or-more(())"), "FORG0004");
    assert.equal(code("exactly-one(())"), "FORG0005");
  });
});

describe("fn:sort", () => {
  it("sorts by atomized value or by key, stably", () => {
    assert.equal(xs("sort((3, 1, 2))"), "1 2 3");
    assert.equal(xs("sort(('b', 'a'), ())"), "a b");
    assert.equal(xs(`sort(('b', 'a'), ${C})`), "a b");
    assert.equal(xs("sort((1, -3, 2), (), function($x) { -$x })"), "2 1 -3");
    assert.equal(xs("sort(('aa', 'b', 'cc'), (), string-length#1)"), "b aa cc");
    assert.equal(xs("sort((xs:double('NaN'), 1))"), "NaN 1");
    assert.equal(xs("sort((1, xs:double('NaN')))"), "NaN 1");
    assert.equal(
      xs("sort(([2, 1], [1, 2], [1]))!string-join(?*, '')"),
      "1 12 21",
    );
    assert.equal(evaluateXPath("sort((3, 1))")[0].value, 1n);
    assert.equal(code("sort((1, 'a'))"), "XPTY0004");
    assert.equal(code("sort((xs:QName('a'), xs:QName('b')))"), "XPTY0004");
    assert.equal(xs("sort((xs:QName('a'), xs:QName('a')))"), "a a");
  });
});
