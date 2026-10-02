import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { code, xs } from "../xpath/testing.test.js";

describe("fn:load-xquery-module", () => {
  it("raises FOQM0006: there is no XQuery processor", () => {
    assert.equal(code("load-xquery-module('urn:m')"), "FOQM0006");
    assert.equal(code("load-xquery-module('urn:m', map{})"), "FOQM0006");
    assert.equal(code("load-xquery-module(1)"), "XPTY0004");
  });
});

describe("dynamic function calls", () => {
  it("run in a context marked as dynamic", () => {
    // the mark only matters to XSLT's current-output-uri(); calls work
    assert.equal(xs("(function($x) {$x + 1})(1), concat#2('a', 'b')"), "2 ab");
  });
});
