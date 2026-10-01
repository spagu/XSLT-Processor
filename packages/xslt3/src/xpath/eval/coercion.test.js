import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateXPath } from "../index.js";
import { code, parse, xs } from "../testing.test.js";

const compat = { backwardsCompatible: true };

describe("the coercion rules", () => {
  it("atomizes and casts untyped values to the expected type", () => {
    const doc = parse("<r><n>2</n><q>p:x</q></r>");
    assert.equal(
      xs(
        "let $f := function($a as xs:integer) { $a + 1 } return $f(/r/n)",
        doc,
      ),
      "3",
    );
    assert.equal(
      code("let $f := function($a as xs:integer) { $a } return $f(/r/q)", doc),
      "FORG0001",
    );
    assert.equal(code("local-name-from-QName(/r/q)", doc), "XPTY0117");
    assert.equal(
      xs(
        "let $f := function($a as xs:anyAtomicType) { $a instance of xs:untypedAtomic } return $f(/r/n)",
        doc,
      ),
      "true",
    );
  });

  it("promotes numbers and URIs", () => {
    const [value] = evaluateXPath(
      "let $f := function($a as xs:double) { $a } return $f(1)",
    );
    assert.equal(value.type.localName, "double");
    assert.equal(
      xs(
        "let $f := function($a as xs:float) { $a } return $f(1.5) instance of xs:float",
      ),
      "true",
    );
    assert.equal(
      xs(
        "let $f := function($a as xs:string) { $a } return $f(xs:anyURI('u')) instance of xs:string",
      ),
      "true",
    );
    assert.equal(
      code("let $f := function($a as xs:string) { $a } return $f(1)"),
      "XPTY0004",
    );
    assert.equal(
      xs(
        "let $f := function($a as xs:numeric) { $a } return $f(xs:untypedAtomic('1')) instance of xs:double",
      ),
      "true",
    );
  });

  it("checks results and cardinality", () => {
    assert.equal(
      code("let $f := function() as xs:integer { 'a' } return $f()"),
      "XPTY0004",
    );
    assert.equal(
      code("let $f := function($a as xs:integer) { $a } return $f(())"),
      "XPTY0004",
    );
    assert.equal(
      code("let $f := function($a as empty-sequence()) { 1 } return $f(1)"),
      "XPTY0004",
    );
  });

  it("coerces function items to typed function tests", () => {
    assert.equal(
      xs(
        "let $f := function($g as function(xs:integer) as item()*) { $g(2) } return $f(function($x as xs:decimal) { $x * 2 })",
      ),
      "4",
    );
    assert.equal(
      xs(
        "let $f := function($g as function(xs:string) as item()*) { $g('a') } return $f(function($x) { $x || 'b' })",
      ),
      "ab",
    );
    assert.equal(
      xs(
        "let $f := function($g as function(item()) as xs:string) { $g(5) } return $f(string#1)",
      ),
      "5",
    );
    assert.equal(
      code(
        "let $f := function($g as function(item()) as xs:integer) { $g(5) } return $f(string#1)",
      ),
      "XPTY0004",
    );
    assert.equal(
      code(
        "let $f := function($g as function(item(), item()) as item()) { 1 } return $f(string#1)",
      ),
      "XPTY0004",
    );
    assert.equal(
      xs(
        "let $f := function($m as function(xs:anyAtomicType) as item()*) { $m('a') } return $f(map{'a': 1})",
      ),
      "1",
    );
  });

  it("applies the XPath 1.0 conversions in compatibility mode", () => {
    assert.equal(xs("concat((1, 2), 'x')", null, compat), "1x");
    assert.equal(xs("string-length((1, 23))", null, compat), "1");
    assert.equal(xs("string-length(())", null, compat), "0");
    assert.equal(xs("count(subsequence((1, 2, 3), '2'))", null, compat), "2");
    assert.equal(xs("count(subsequence((1, 2, 3), ()))", null, compat), "0");
    assert.equal(xs("string-join((1, 2), '-')", null, compat), "1-2");
    assert.equal(xs("name((/r, /r))", parse("<r/>"), compat), "r");
  });
});
