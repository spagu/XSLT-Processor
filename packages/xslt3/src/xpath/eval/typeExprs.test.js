import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateXPath } from "../index.js";
import { code, parse, xp, xs } from "../testing.test.js";

describe("instance of and treat as", () => {
  it("matches sequence types", () => {
    assert.equal(xs("1 instance of xs:integer"), "true");
    assert.equal(xs("1 instance of xs:decimal+"), "true");
    assert.equal(xs("(1, 2) instance of xs:integer"), "false");
    assert.equal(xs("() instance of empty-sequence()"), "true");
    assert.equal(xs("1 instance of empty-sequence()"), "false");
    assert.equal(xs("() instance of xs:integer?"), "true");
    assert.equal(xs("() instance of xs:integer+"), "false");
    assert.equal(xs("1.5 instance of xs:numeric"), "true");
    assert.equal(xs("'a' instance of xs:numeric"), "false");
  });

  it("raises XPDY0050 when treat as fails", () => {
    assert.equal(xs("(1, 2) treat as xs:integer+"), "1 2");
    assert.equal(code("'a' treat as xs:integer"), "XPDY0050");
  });

  it("rejects unknown and non-atomic types", () => {
    assert.equal(code("1 instance of xs:unknown"), "XPST0051");
    assert.equal(code("1 instance of xs:untyped"), "XPST0051");
    assert.equal(code("1 instance of my:type"), "XPST0081");
    assert.equal(code("1 instance of Q{urn:x}type"), "XPST0051");
  });
});

describe("cast as and castable as", () => {
  it("casts single atomic values", () => {
    assert.equal(xs("'12' cast as xs:integer + 1"), "13");
    assert.deepEqual(xp("() cast as xs:integer?"), []);
    assert.equal(code("() cast as xs:integer"), "XPTY0004");
    assert.equal(code("(1, 2) cast as xs:string"), "XPTY0004");
    assert.equal(code("'x' cast as xs:integer"), "FORG0001");
  });

  it("casts to xs:numeric and to list types", () => {
    const [value] = evaluateXPath("'1' cast as xs:numeric");
    assert.equal(value.type.localName, "double");
    assert.equal(xs("1 cast as xs:numeric"), "1");
    assert.equal(xs("true() cast as xs:numeric"), "1");
    assert.equal(code("xs:date('2000-01-01') cast as xs:numeric"), "XPTY0004");
    assert.equal(xs("count(' a  b ' cast as xs:NMTOKENS)"), "2");
    assert.equal(xs("count(xs:IDREFS('a b c'))"), "3");
    assert.equal(code("'1a' cast as xs:ENTITIES"), "FORG0001");
  });

  it("casts strings to QNames with the static namespaces", () => {
    const options = { namespaces: { p: "urn:p" } };
    assert.equal(
      xs("namespace-uri-from-QName('p:a' cast as xs:QName)", null, options),
      "urn:p",
    );
    assert.equal(
      xs("namespace-uri-from-QName('a' cast as xs:QName)", null, {
        namespaces: [{ prefix: "", uri: "urn:d" }],
      }),
      "urn:d",
    );
  });

  it("raises the static errors of casts", () => {
    assert.equal(code("1 cast as xs:anyAtomicType"), "XPST0080");
    assert.equal(code("1 cast as xs:NOTATION"), "XPST0080");
    assert.equal(code("1 cast as xs:anySimpleType"), "XPST0080");
    assert.equal(code("1 cast as xs:nothing"), "XPST0051");
    assert.equal(code("1 castable as xs:anyAtomicType"), "XPST0080");
  });

  it("tells whether a cast would succeed", () => {
    assert.equal(xs("'12' castable as xs:integer"), "true");
    assert.equal(xs("'x' castable as xs:integer"), "false");
    assert.equal(xs("() castable as xs:integer?"), "true");
    assert.equal(xs("() castable as xs:integer"), "false");
    assert.equal(xs("(1, 2) castable as xs:integer"), "false");
    const doc = parse("<r>5</r>");
    assert.equal(xs("/r castable as xs:byte", doc), "true");
    assert.equal(code("map{} castable as xs:string"), "FOTY0013");
  });
});
