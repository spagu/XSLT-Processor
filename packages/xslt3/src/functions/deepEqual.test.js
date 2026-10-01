import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { code, parse, xs } from "../xpath/testing.test.js";

describe("fn:deep-equal", () => {
  it("compares atomic values, maps and arrays", () => {
    assert.equal(xs("deep-equal((1, 'a'), (1.0, 'a'))"), "true");
    assert.equal(
      xs("deep-equal(1, 'a'), deep-equal((1, 2), 1)"),
      "false false",
    );
    assert.equal(xs("deep-equal(xs:double('NaN'), xs:float('NaN'))"), "true");
    assert.equal(xs("deep-equal(map{1: [2]}, map{1.0: [2]})"), "true");
    assert.equal(
      xs("deep-equal(map{1: 2}, map{2: 2}), deep-equal(map{1: 2}, map{1: 3})"),
      "false false",
    );
    assert.equal(
      xs("deep-equal([1, (2, 3)], [1, (2, 3)]), deep-equal([1], [1, 2])"),
      "true false",
    );
    assert.equal(xs("deep-equal(map{}, [])"), "false");
    assert.equal(code("deep-equal(count#1, count#1)"), "FOTY0015");
    assert.equal(
      xs(
        "deep-equal('a', 'a', 'http://www.w3.org/2005/xpath-functions/collation/codepoint')",
      ),
      "true",
    );
  });

  it("compares nodes", () => {
    const a = parse(
      '<r><e x="1" y="2">t<!--c--><i/></e><e y="2" x="1">t<i/></e><e x="1">t<i/></e><e x="1" y="3">t<i/></e></r>',
    );
    assert.equal(xs("deep-equal(/r/e[1], /r/e[2])", a), "true");
    assert.equal(xs("deep-equal(/r/e[1], /r/e[3])", a), "false");
    assert.equal(xs("deep-equal(/r/e[1], /r/e[4])", a), "false");
    assert.equal(xs("deep-equal(/r/e[1], /r/e[1]/i)", a), "false");
    assert.equal(
      xs(
        "deep-equal(/r/e[1]/@x, /r/e[2]/@x), deep-equal(/r/e[1]/@x, /r/e[1]/@y)",
        a,
      ),
      "true false",
    );
    assert.equal(xs("deep-equal(/r/e[1]/text(), /r/e[2]/text())", a), "true");
    assert.equal(xs("deep-equal(/, /)", a), "true");
    assert.equal(xs("deep-equal(/r/e[1], 1)", a), "false");
    assert.equal(
      xs("deep-equal(/r/e[1]/namespace::*, /r/e[2]/namespace::*)", a),
      "true",
    );
  });
});
