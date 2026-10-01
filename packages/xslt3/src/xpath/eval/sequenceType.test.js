import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { code, parse, xs } from "../testing.test.js";

const doc = parse('<r xmlns:p="urn:p" a="1"><p:e/><!--c--><?pi x?>t</r>');

describe("item type matching", () => {
  it("matches kind tests", () => {
    assert.equal(xs("(/) instance of document-node()", doc), "true");
    assert.equal(xs("(/) instance of document-node(element(r))", doc), "true");
    assert.equal(xs("(/) instance of document-node(element(x))", doc), "false");
    assert.equal(xs("/r instance of document-node()", doc), "false");
    assert.equal(xs("/r instance of element()", doc), "true");
    assert.equal(xs("/r instance of element(r, xs:untyped)", doc), "true");
    assert.equal(xs("/r instance of element(*, xs:anyType)", doc), "true");
    assert.equal(xs("/r instance of element(r, xs:string)", doc), "false");
    assert.equal(xs("/r/@a instance of attribute(a)", doc), "true");
    assert.equal(
      xs("/r/@a instance of attribute(*, xs:untypedAtomic)", doc),
      "true",
    );
    assert.equal(
      xs("/r/@a instance of attribute(a, xs:integer)", doc),
      "false",
    );
    assert.equal(xs("/r/@a instance of attribute(a, xs:anyType)", doc), "true");
    assert.equal(xs("/r/comment() instance of comment()", doc), "true");
    assert.equal(
      xs(
        "/r/processing-instruction() instance of processing-instruction(pi)",
        doc,
      ),
      "true",
    );
    assert.equal(xs("/r/text() instance of text()", doc), "true");
    assert.equal(xs("/r/text() instance of node()", doc), "true");
    assert.equal(xs("1 instance of node()", doc), "false");
    assert.equal(
      xs("/r/namespace::p instance of namespace-node()", doc),
      "true",
    );
  });

  it("rejects schema tests and unknown type annotations", () => {
    assert.equal(code("1 instance of schema-element(e)"), "XPST0008");
    assert.equal(code("1 instance of schema-attribute(a)"), "XPST0008");
    assert.equal(code("1 instance of element(e, xs:foo)"), "XPST0008");
    assert.equal(
      code("1 instance of document-node(schema-element(p:e))"),
      "XPST0081",
    );
  });

  it("matches function, map and array tests", () => {
    assert.equal(xs("map{} instance of map(*)"), "true");
    assert.equal(
      xs("map{1: 'a'} instance of map(xs:integer, xs:string)"),
      "true",
    );
    assert.equal(
      xs("map{1: 'a'} instance of map(xs:string, xs:string)"),
      "false",
    );
    assert.equal(
      xs("map{1: 1} instance of map(xs:integer, xs:string)"),
      "false",
    );
    assert.equal(xs("[1, 2] instance of array(xs:integer)"), "true");
    assert.equal(xs("[1, 'a'] instance of array(xs:integer)"), "false");
    assert.equal(xs("[] instance of array(*)"), "true");
    assert.equal(xs("1 instance of function(*)"), "false");
    assert.equal(xs("[] instance of function(*)"), "true");
    assert.equal(xs("true#0 instance of function() as xs:boolean"), "true");
    assert.equal(xs("true#0 instance of function() as xs:string"), "false");
    assert.equal(xs("true#0 instance of function(item()) as item()"), "false");
    assert.equal(xs("1 instance of function() as item()"), "false");
    assert.equal(
      xs(
        "function($a as xs:decimal) { $a } instance of function(xs:integer) as item()*",
      ),
      "true",
    );
    assert.equal(
      xs(
        "function($a as xs:integer) { $a } instance of function(xs:decimal) as item()*",
      ),
      "false",
    );
  });

  it("matches maps and arrays against function tests by their content", () => {
    assert.equal(
      xs("map{1: 'A'} instance of function(xs:integer) as xs:string?"),
      "true",
    );
    assert.equal(
      xs("map{1: 'A'} instance of function(xs:integer) as xs:string"),
      "false",
    );
    assert.equal(
      xs("map{} instance of function(xs:integer) as empty-sequence()"),
      "true",
    );
    assert.equal(xs("map{} instance of function(item()) as item()*"), "false");
    assert.equal(
      xs("map{} instance of function(xs:integer, xs:integer) as item()*"),
      "false",
    );
    assert.equal(
      xs("['a'] instance of function(xs:integer) as xs:string"),
      "true",
    );
    assert.equal(
      xs("['a'] instance of function(xs:string) as xs:string"),
      "false",
    );
  });
});
