import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { code, parse, xp, xs } from "../testing.test.js";

describe("inline functions", () => {
  it("closes over variables and has no focus", () => {
    assert.equal(xs("let $n := 10 return (function($x) { $x + $n })(1)"), "11");
    assert.equal(code("(function() { . })()", 1), "XPDY0002");
    assert.equal(xs("(function() {})()"), "");
    assert.equal(
      xs(
        "let $f := function($x as xs:integer) as xs:integer { $x * 2 } return $f(4)",
      ),
      "8",
    );
  });

  it("rejects duplicate parameter names", () => {
    assert.equal(code("function($a, $a) { 1 }"), "XQST0039");
  });

  it("recurses through a parameter", () => {
    const fact =
      "let $f := function($f, $n) { if ($n le 1) then 1 else $n * $f($f, $n - 1) } return $f($f, 10)";
    assert.equal(xs(fact), "3628800");
  });
});

describe("maps and arrays", () => {
  it("constructs maps and rejects duplicate keys", () => {
    assert.equal(xs("map{'a': 1, 'b': (2, 3)}?b"), "2 3");
    assert.equal(code("map{1: 'i', 1.0e0: 'd'}"), "XQDY0137");
    assert.equal(code("map{1: 'a', 1.0: 'b'}"), "XQDY0137");
    assert.equal(code("map{(1, 2): 'a'}"), "XPTY0004");
    assert.equal(code("map{(): 'a'}"), "XPTY0004");
  });

  it("constructs arrays with square and curly brackets", () => {
    assert.equal(xs("array:size([1, (2, 3), ()])"), "3");
    assert.equal(xs("array:size(array {1, (2, 3), ()})"), "3");
    assert.equal(xs("[(1, 2), 3]?1"), "1 2");
  });

  it("looks up keys, positions and wildcards", () => {
    const map = "map{'a': 1, 'b': 2, 3: 'c'}";
    assert.equal(xs(`${map}?a`), "1");
    assert.equal(xs(`${map}?3`), "c");
    assert.equal(xs(`${map}?('a', 'b')`), "1 2");
    assert.equal(xs(`${map}?x`), "");
    assert.equal(xs(`count(${map}?*)`), "3");
    assert.equal(xs("[10, 20, 30]?2"), "20");
    assert.equal(xs("[10, 20, 30]?(1, 3)"), "10 30");
    assert.equal(xs("[10, 20, 30]?*"), "10 20 30");
    assert.equal(xs("([1], [2])?1"), "1 2");
    assert.equal(code("[1]?2"), "FOAY0001");
    assert.equal(code("[1]?a"), "XPTY0004");
    assert.equal(code("1?a"), "XPTY0004");
    const doc = parse("<r>2</r>");
    assert.equal(xs("[10, 20]?(/r)", doc), "20");
  });

  it("looks up in the context item with the unary operator", () => {
    assert.equal(xs("map{'a': 1} ! ?a"), "1");
    assert.equal(xs("[1, 2] ! ?*"), "1 2");
    assert.deepEqual(xp("(map{'a': 1}, map{'a': 2})[?a = 2] ! ?a"), ["2"]);
    assert.equal(code("?a"), "XPDY0002");
  });
});
