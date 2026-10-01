import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { code, parse, xp, xs } from "../testing.test.js";

const compat = { backwardsCompatible: true };

describe("logical operators", () => {
  it("short-circuits on the effective boolean value", () => {
    assert.equal(xs("1 and 'a'"), "true");
    assert.equal(xs("0 and error()"), "false");
    assert.equal(xs("1 or error()"), "true");
    assert.equal(xs("() or ''"), "false");
  });
});

describe("comparisons", () => {
  it("compares sequences with general comparisons", () => {
    assert.equal(xs("(1, 2) = (2, 3)"), "true");
    assert.equal(xs("(1, 2) != 1"), "true");
    assert.equal(xs("() = ()"), "false");
    assert.equal(xs("'1' = 1", null, compat), "true");
    assert.equal(code("'1' = 1"), "XPTY0004");
  });

  it("compares single values with value comparisons", () => {
    assert.equal(xs("1 eq 1.0"), "true");
    assert.equal(xs("'a' lt 'b'"), "true");
    assert.deepEqual(xp("() eq 1"), []);
    assert.deepEqual(xp("1 eq ()"), []);
    assert.equal(code("(1, 2) eq 1"), "XPTY0004");
    const doc = parse("<r><a>x</a></r>");
    assert.equal(xs("/r/a eq 'x'", doc), "true");
  });

  it("compares node identity and document order", () => {
    const doc = parse("<r><a/><b/></r>");
    assert.equal(xs("/r/a is /r/a", doc), "true");
    assert.equal(xs("/r/a is /r/b", doc), "false");
    assert.equal(xs("/r/a << /r/b", doc), "true");
    assert.equal(xs("/r/a >> /r/b", doc), "false");
    assert.deepEqual(xp("/r/c is /r/a", doc), []);
    assert.deepEqual(xp("/r/a is ()", doc), []);
    assert.equal(code("1 is 1"), "XPTY0004");
    assert.equal(code("/r/* is /r/a", doc), "XPTY0004");
  });
});

describe("string concatenation and ranges", () => {
  it("concatenates string values, empty as the empty string", () => {
    assert.equal(xs("1 || () || 'b'"), "1b");
    assert.equal(code("(1, 2) || 'a'"), "XPTY0004");
  });

  it("builds integer ranges", () => {
    assert.equal(xs("1 to 3"), "1 2 3");
    assert.deepEqual(xp("3 to 1"), []);
    assert.deepEqual(xp("() to 1"), []);
    assert.deepEqual(xp("1 to ()"), []);
    const doc = parse("<r>2</r>");
    assert.equal(xs("1 to /r", doc), "1 2");
    assert.equal(code("1 to 2.5"), "XPTY0004");
    assert.equal(code("1 to 100000000000"), "XPDY0130");
  });
});

describe("arithmetic", () => {
  it("evaluates binary and unary operators", () => {
    assert.equal(xs("1 + 2 * 3 - 4 div 2"), "5");
    assert.equal(xs("7 idiv 2, 7 mod 2"), "3 1");
    assert.equal(xs("-(1), +(2), --3"), "-1 2 3");
    assert.deepEqual(xp("() + 1"), []);
    assert.deepEqual(xp("1 + ()"), []);
    assert.deepEqual(xp("-()"), []);
    assert.equal(code("(1, 2) + 1"), "XPTY0004");
    assert.equal(code("1 div 0"), "FOAR0001");
  });

  it("follows the XPath 1.0 rules in compatibility mode", () => {
    assert.equal(xs("(1, 2) + 1", null, compat), "2");
    assert.equal(xs("() + 1", null, compat), "NaN");
    assert.equal(xs("'2' * true()", null, compat), "2");
    assert.equal(xs("'a' + 1", null, compat), "NaN");
    assert.equal(xs("-'3'", null, compat), "-3");
    assert.equal(
      xs("xs:date('2020-01-02') - xs:date('2020-01-01')", null, compat),
      "P1D",
    );
  });
});
