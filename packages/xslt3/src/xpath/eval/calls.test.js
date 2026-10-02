import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateXPath } from "../index.js";
import { code, xs } from "../testing.test.js";

describe("static function calls", () => {
  it("calls library and constructor functions", () => {
    assert.equal(xs("count((1, 2))"), "2");
    assert.equal(xs("fn:count((1, 2))"), "2");
    assert.equal(xs("Q{http://www.w3.org/2005/xpath-functions}count(1)"), "1");
    assert.equal(xs("xs:integer('3') + 1"), "4");
    assert.equal(xs("concat('a', 'b', 'c', 'd')"), "abcd");
    assert.equal(xs("xs:integer(())"), "");
    assert.equal(xs("xs:error(())"), "");
  });

  it("raises XPST0017 for unknown functions", () => {
    assert.equal(code("count()"), "XPST0017");
    assert.equal(code("xs:anyAtomicType(1)"), "XPST0017");
    assert.equal(code("xs:untyped(1)"), "XPST0017");
    assert.equal(code("xs:integer(1, 2)"), "XPST0017");
    assert.equal(code("concat('a')"), "XPST0017");
    assert.equal(code("fn:concat#1"), "XPST0017");
    assert.equal(code("transform(map{})"), "XPST0017");
    assert.equal(code("transform(?)"), "XPST0017");
    assert.equal(code("fn:transform#1"), "XPST0017");
  });

  it("evaluates position() and last() from the focus", () => {
    assert.equal(xs("(5, 6, 7)[position() = last()]"), "7");
    assert.equal(code("position()"), "XPDY0002");
    assert.equal(code("last()"), "XPDY0002");
  });

  it("applies function arguments partially", () => {
    assert.equal(xs("let $f := concat('a', ?, 'c') return $f('b')"), "abc");
    assert.equal(xs("let $f := count(?) return function-arity($f)"), "1");
    assert.equal(xs("let $f := xs:integer(?) return $f('5') + 1"), "6");
    assert.equal(
      xs("let $f := function($a, $b) { $a - $b } return $f(?, 1)(10)"),
      "9",
    );
    assert.equal(xs("let $m := map{1: 'x'} return $m(?)(1)"), "x");
    assert.equal(code("let $f := count(?) return $f(1, 2)"), "XPTY0004");
  });
});

describe("named function references", () => {
  it("gives function items with names and arities", () => {
    assert.equal(xs("count#1((1, 2))"), "2");
    assert.equal(xs("function-name(count#1)"), "fn:count");
    assert.equal(xs("function-arity(concat#5)"), "5");
    assert.equal(xs("xs:date#1('2000-01-01')"), "2000-01-01");
    assert.equal(xs("xs:NMTOKENS#1('a b') ! string()"), "a b");
    assert.equal(code("concat#2000000"), "FOAR0002");
  });

  it("keeps the focus of focus-dependent functions", () => {
    assert.equal(xs("(10, 20) ! position#0"), "function#0 function#0");
    assert.equal(xs("(10, 20) ! position#0()"), "1 2");
    assert.equal(xs("(10, 20) ! last#0()"), "2 2");
    assert.equal(xs("let $f := ('abc' ! string-length#0) return $f()"), "3");
  });
});

describe("dynamic function calls and the arrow operator", () => {
  it("calls function items, maps and arrays", () => {
    assert.equal(xs("let $f := function($x) { $x * 2 } return $f(3)"), "6");
    assert.equal(xs("map{'a': 1}('a')"), "1");
    assert.equal(xs("[10, 20](2)"), "20");
    assert.equal(code("1(2)"), "XPTY0004");
    assert.equal(code("(count#1, count#1)(1)"), "XPTY0004");
    assert.equal(code("count#1(1, 2)"), "XPTY0004");
  });

  it("passes the left operand of => as the first argument", () => {
    assert.equal(xs("(1, 2, 3) => count()"), "3");
    assert.equal(xs("'a' => concat('b')"), "ab");
    assert.equal(
      xs("let $f := function($a, $b) { $a + $b } return 1 => $f(2)"),
      "3",
    );
    assert.equal(xs("1 => (function($a) { $a + 1 })()"), "2");
  });

  it("returns the function item of a static call through evaluateXPath", () => {
    const [f] = evaluateXPath("concat#3");
    assert.equal(f.name.localName, "concat");
    assert.equal(f.invoke([[], [], []])[0].value, "");
  });
});
