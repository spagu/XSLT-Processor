import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateXPath } from "../xpath/index.js";
import { code, parse, xs } from "../xpath/testing.test.js";

const doc = parse("<r><a>1</a><a>x</a></r>");

describe("core functions", () => {
  it("computes booleans", () => {
    assert.equal(
      xs("true(), false(), not(()), boolean('a')"),
      "true false true true",
    );
    assert.equal(code("boolean((1, 2))"), "FORG0006");
  });

  it("converts to strings, typed values and numbers", () => {
    assert.equal(xs("string(1.0), string(()), string(/r/a[2])", doc), "1  x");
    assert.equal(xs("/r/a[1]/string()", doc), "1");
    assert.equal(code("string()"), "XPDY0002");
    assert.equal(code("string(map{})"), "FOTY0014");
    assert.equal(xs("data((1, /r/a[1]))", doc), "1 1");
    assert.equal(xs("/r/a[2]/data()", doc), "x");
    assert.equal(xs("number('1e1'), number(()), number('a')"), "10 NaN NaN");
    assert.equal(xs("/r/a ! number()", doc), "1 NaN");
  });

  it("concatenates and joins strings", () => {
    assert.equal(xs("concat('a', (), 1, true())"), "a1true");
    assert.equal(xs("string-join(('a', 'b'))"), "ab");
    assert.equal(xs("string-join((1, 2), ', ')"), "1, 2");
    assert.equal(code("concat((1, 2), 'a')"), "XPTY0004");
  });

  it("counts codepoints", () => {
    assert.equal(xs("string-length('a\u{1F600}b'), string-length(())"), "3 0");
    assert.equal(xs("'abc' ! string-length()"), "3");
  });
});

describe("errors, trace and documents", () => {
  it("raises errors with codes, descriptions and values", () => {
    assert.equal(code("error()"), "FOER0000");
    assert.equal(code("error(())"), "FOER0000");
    assert.equal(code("error(xs:QName('err:XPTY0004'))"), "XPTY0004");
    assert.equal(code("error(QName('urn:x', 'x:E'), 'boom')"), "Q{urn:x}E");
    try {
      evaluateXPath("error(xs:QName('err:E1'), 'd', (1, 2))");
      assert.fail("no error");
    } catch (error) {
      assert.match(error.message, /d$/);
      assert.equal(error.qname.localName, "E1");
      assert.equal(error.errorObject.length, 2);
    }
  });

  it("loads documents", () => {
    const options = { documentLoader: () => doc };
    assert.equal(xs("doc('u')/r/a[1]/string()", null, options), "1");
    assert.equal(xs("doc(())", null, options), "");
    assert.equal(
      xs("doc-available('u'), doc-available(())", null, options),
      "true false",
    );
    assert.equal(xs("doc-available('u')"), "false");
    assert.equal(xs("doc-available(':/')"), "false");
  });
});

describe("the dynamic context functions", () => {
  it("returns collation, language, base URI and environment", () => {
    assert.equal(
      xs("default-collation()"),
      "http://www.w3.org/2005/xpath-functions/collation/codepoint",
    );
    assert.equal(xs("default-language()"), "en");
    assert.equal(xs("static-base-uri()"), "");
    assert.equal(xs("static-base-uri()", null, { baseUri: "urn:b" }), "urn:b");
    assert.equal(xs("available-environment-variables()"), "");
    assert.equal(xs("environment-variable('PATH')"), "");
  });
});
