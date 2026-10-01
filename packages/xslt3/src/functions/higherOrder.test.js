import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { code, xs } from "../xpath/testing.test.js";

describe("higher-order functions", () => {
  it("maps, filters and folds sequences", () => {
    assert.equal(xs("for-each((1, 2), function($x) { $x * 10 })"), "10 20");
    assert.equal(xs("filter(1 to 5, function($x) { $x mod 2 = 0 })"), "2 4");
    assert.equal(code("filter(1, function($x) { 1 })"), "XPTY0004");
    assert.equal(
      code("filter(1, function($x) { (true(), true()) })"),
      "XPTY0004",
    );
    assert.equal(xs("fold-left(1 to 3, 'x', concat#2)"), "x123");
    assert.equal(xs("fold-right(1 to 3, 'x', concat#2)"), "123x");
    assert.equal(
      xs("for-each-pair((1, 2, 3), (10, 20), function($a, $b) { $a + $b })"),
      "11 22",
    );
  });

  it("applies functions to arrays of arguments", () => {
    assert.equal(xs("apply(concat#3, ['a', 'b', 'c'])"), "abc");
    assert.equal(code("apply(concat#3, ['a'])"), "FOAP0001");
  });

  it("describes and looks up functions", () => {
    assert.equal(
      xs("function-name(concat#2), function-arity(concat#2)"),
      "fn:concat 2",
    );
    assert.equal(
      xs("function-name(function() { 1 }), function-name(map{})"),
      "",
    );
    assert.equal(xs("function-arity(map{}), function-arity([])"), "1 1");
    assert.equal(xs("function-lookup(xs:QName('fn:count'), 1)((1, 2))"), "2");
    assert.equal(xs("function-lookup(xs:QName('fn:count'), 7)"), "");
    assert.equal(xs("function-lookup(xs:QName('fn:transform'), 1)"), "");
    assert.equal(xs("function-lookup(xs:QName('xs:integer'), 1)('4')"), "4");
    assert.equal(
      xs("(5, 6) ! function-lookup(xs:QName('fn:position'), 0)()"),
      "1 2",
    );
    assert.equal(
      code("function-lookup(xs:QName('fn:count'), 2000000)"),
      "FOAR0002",
    );
  });
});

describe("map functions", () => {
  it("reads maps", () => {
    const m = "map{'a': 1, 'b': (2, 3)}";
    assert.equal(
      xs(`map:size(${m}), map:contains(${m}, 'a'), map:contains(${m}, 'z')`),
      "2 true false",
    );
    assert.equal(
      xs(`sort(map:keys(${m})), map:get(${m}, 'b'), map:get(${m}, 'z')`),
      "a b 2 3",
    );
    assert.equal(
      xs(`map:for-each(${m}, function($k, $v) { $k || count($v) })`),
      "a1 b2",
    );
    assert.equal(
      xs("map:find((map{'a': 1}, [map{'a': 2, 'c': map{'a': 3}}], 4), 'a')?*"),
      "1 2 3",
    );
  });

  it("builds maps", () => {
    assert.equal(
      xs("map:put(map{'a': 1}, 'a', 2)?a, map:put(map{}, 'b', 3)?b"),
      "2 3",
    );
    assert.equal(
      xs("map:size(map:remove(map{'a': 1, 'b': 2}, ('a', 'z')))"),
      "1",
    );
    assert.equal(xs("map:entry('k', 'v')?k"), "v");
  });

  it("merges maps by the duplicates option", () => {
    const maps = "(map{'a': 1}, map{'a': 2, 'b': 3})";
    assert.equal(xs(`map:merge(${maps})?a`), "1");
    assert.equal(
      xs(`map:merge(${maps}, map{'duplicates': 'use-first'})?a`),
      "1",
    );
    assert.equal(
      xs(`map:merge(${maps}, map{'duplicates': 'use-last'})?a`),
      "2",
    );
    assert.equal(xs(`map:merge(${maps}, map{'duplicates': 'use-any'})?a`), "1");
    assert.equal(
      xs(`map:merge(${maps}, map{'duplicates': 'combine'})?a`),
      "1 2",
    );
    assert.equal(xs(`map:merge(${maps}, map{})?b`), "3");
    assert.equal(
      code(`map:merge(${maps}, map{'duplicates': 'reject'})`),
      "FOJS0003",
    );
    assert.equal(
      code(`map:merge(${maps}, map{'duplicates': 'bad'})`),
      "FOJS0005",
    );
    assert.equal(code(`map:merge(${maps}, map{'duplicates': 1})`), "XPTY0004");
    assert.equal(code(`map:merge(${maps}, map{'duplicates': ()})`), "XPTY0004");
  });
});

describe("array functions", () => {
  it("reads and changes arrays", () => {
    assert.equal(xs("array:size([1, 2]), array:get([1, 2], 2)"), "2 2");
    assert.equal(
      xs("array:put([1, 2], 1, 9)?*, array:append([1], 2)?*"),
      "9 2 1 2",
    );
    assert.equal(code("array:put([1], 2, 9)"), "FOAY0001");
    assert.equal(
      xs("array:subarray([1, 2, 3], 2)?*, array:subarray([1, 2, 3], 1, 2)?*"),
      "2 3 1 2",
    );
    assert.equal(xs("array:size(array:subarray([1, 2], 3))"), "0");
    assert.equal(code("array:subarray([1], 1, -1)"), "FOAY0002");
    assert.equal(code("array:subarray([1], 3)"), "FOAY0001");
    assert.equal(code("array:subarray([1], 0)"), "FOAY0001");
    assert.equal(code("array:subarray([1, 2], 2, 5)"), "FOAY0001");
    assert.equal(
      xs(
        "array:remove([1, 2, 3], (1, 3))?*, array:size(array:remove([1], ()))",
      ),
      "2 1",
    );
    assert.equal(code("array:remove([1], 2)"), "FOAY0001");
    assert.equal(
      xs(
        "array:insert-before([1, 2], 2, 9)?*, array:insert-before([1], 2, 9)?*",
      ),
      "1 9 2 1 9",
    );
    assert.equal(code("array:insert-before([1], 3, 9)"), "FOAY0001");
    assert.equal(code("array:insert-before([1], 0, 9)"), "FOAY0001");
  });

  it("takes heads, tails, reverses, joins and flattens", () => {
    assert.equal(
      xs("array:head([(1, 2), 3]), array:tail([1, 2, 3])?*"),
      "1 2 2 3",
    );
    assert.equal(code("array:head([])"), "FOAY0001");
    assert.equal(code("array:tail([])"), "FOAY0001");
    assert.equal(
      xs("array:reverse([1, 2])?*, array:join(([1], [2, 3]))?*"),
      "2 1 1 2 3",
    );
    assert.equal(xs("array:flatten((1, [2, [3, (4, [5])]]))"), "1 2 3 4 5");
  });

  it("applies functions to members", () => {
    assert.equal(
      xs("array:for-each([1, 2], function($m) { $m * 2 })?*"),
      "2 4",
    );
    assert.equal(
      xs("array:filter([1, 2, 3], function($m) { $m gt 1 })?*"),
      "2 3",
    );
    assert.equal(code("array:filter([1], function($m) { 1 })"), "XPTY0004");
    assert.equal(xs("array:fold-left([1, 2], 'x', concat#2)"), "x12");
    assert.equal(xs("array:fold-right([1, 2], 'x', concat#2)"), "12x");
    assert.equal(
      xs("array:for-each-pair([1, 2], [3], function($a, $b) { $a + $b })?*"),
      "4",
    );
  });

  it("sorts members", () => {
    assert.equal(xs("array:sort([3, 1, 2])?*"), "1 2 3");
    assert.equal(xs("array:sort(['b', 'a'], ())?*"), "a b");
    assert.equal(
      xs("array:sort([(2, 1), (1, 3)], (), function($m) { $m[2] })?1"),
      "2 1",
    );
  });
});
