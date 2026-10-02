import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSequenceType } from "../syntax/types.js";
import { TokenStream } from "../syntax/tokenStream.js";
import { compileSequenceType } from "./sequenceType.js";
import { createStaticContext } from "./staticContext.js";
import { isSubtype } from "./subtype.js";

const sc = createStaticContext({}, null);
const type = (text) =>
  compileSequenceType(parseSequenceType(new TokenStream(text)), sc);
const sub = (a, b) => isSubtype(type(a), type(b));

describe("subtypes of sequence types", () => {
  it("compares occurrences and empty sequences", () => {
    assert.ok(sub("xs:integer", "xs:decimal*"));
    assert.ok(sub("xs:integer+", "xs:integer*"));
    assert.ok(!sub("xs:integer*", "xs:integer+"));
    assert.ok(!sub("xs:integer?", "xs:integer"));
    assert.ok(sub("empty-sequence()", "xs:string?"));
    assert.ok(sub("empty-sequence()", "empty-sequence()"));
    assert.ok(!sub("empty-sequence()", "xs:string"));
    assert.ok(!sub("xs:string?", "empty-sequence()"));
  });

  it("compares atomic and node types", () => {
    assert.ok(sub("xs:integer", "xs:numeric"));
    assert.ok(sub("xs:numeric", "xs:anyAtomicType"));
    assert.ok(!sub("xs:numeric", "xs:double"));
    assert.ok(!sub("xs:integer", "node()"));
    assert.ok(sub("element(a)", "node()"));
    assert.ok(sub("element(a)", "element()"));
    assert.ok(!sub("element(a)", "element(b)"));
    assert.ok(!sub("element()", "attribute()"));
    assert.ok(!sub("node()", "element()"));
    assert.ok(sub("document-node(element(a))", "document-node()"));
    assert.ok(sub("document-node(element(a))", "document-node(element())"));
    assert.ok(!sub("document-node()", "document-node(element(a))"));
    assert.ok(sub("element(a)", "item()"));
    assert.ok(!sub("item()", "xs:string"));
  });

  it("compares function, map and array types", () => {
    assert.ok(sub("map(*)", "function(*)"));
    assert.ok(sub("map(xs:integer, xs:string)", "map(*)"));
    assert.ok(sub("map(xs:integer, xs:string)", "map(xs:decimal, item()*)"));
    assert.ok(!sub("map(*)", "map(xs:integer, xs:string)"));
    assert.ok(sub("array(xs:string)", "array(*)"));
    assert.ok(sub("array(xs:string)", "array(item()*)"));
    assert.ok(!sub("array(*)", "array(xs:string)"));
    assert.ok(!sub("array(*)", "map(*)"));
    assert.ok(!sub("map(*)", "array(*)"));
    assert.ok(!sub("function(*)", "map(*)"));
    assert.ok(!sub("function(*)", "function() as item()"));
    assert.ok(sub("map(*)", "function(xs:string) as item()*"));
    assert.ok(
      sub("map(xs:string, xs:integer)", "function(xs:string) as xs:integer?"),
    );
    assert.ok(
      sub("map(xs:string, xs:integer+)", "function(xs:string) as xs:integer*"),
    );
    assert.ok(
      sub("map(xs:string, xs:integer*)", "function(xs:string) as xs:integer*"),
    );
    assert.ok(
      !sub("map(xs:string, xs:integer)", "function(xs:string) as xs:integer"),
    );
    assert.ok(sub("array(xs:string)", "function(xs:integer) as xs:string"));
    assert.ok(sub("array(*)", "function(xs:integer) as item()*"));
    assert.ok(!sub("array(*)", "function(xs:string) as item()*"));
    assert.ok(
      sub(
        "function(xs:decimal) as xs:integer",
        "function(xs:integer) as xs:decimal",
      ),
    );
    assert.ok(
      !sub("function(xs:integer) as xs:integer", "function() as xs:integer"),
    );
    assert.ok(!sub("function() as item()", "map(*)"));
    assert.ok(!sub("map(*)", "xs:string"));
    assert.ok(!sub("array(*)", "node()"));
  });
});
