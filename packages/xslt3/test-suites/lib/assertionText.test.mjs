/**
 * Unit tests of the pure assertion helpers and the XML comparison.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertionExpression,
  errorCodeMatches,
  errorLocalName,
  serializationEquals,
  serializationMatches,
  stringValueMatches,
  toRegExp,
} from "./assertionText.mjs";
import { parseFragment, xmlDifference } from "./xmlCompare.mjs";

const a = (kind, value = "", extra = {}) => ({
  kind,
  value,
  children: [],
  ...extra,
});

describe("assertion text helpers", () => {
  it("matches error codes in any notation", () => {
    assert.equal(
      errorLocalName("Q{http://www.w3.org/2005/xqt-errors}FOER0000"),
      "FOER0000",
    );
    assert.equal(errorLocalName("err:XPTY0004"), "XPTY0004");
    assert.equal(errorLocalName(undefined), "");
    assert.equal(errorCodeMatches("*", undefined), true);
    assert.equal(errorCodeMatches("XPST0003", "err:XPST0003"), true);
    assert.equal(errorCodeMatches("XPST0003", "XPST0017"), false);
  });

  it("compares string values with and without normalize-space", () => {
    assert.equal(stringValueMatches("a  b ", "a b", true), true);
    assert.equal(stringValueMatches("a  b", "a b", false), false);
  });

  it("translates XPath regex flags", () => {
    assert.equal(toRegExp("a.c", "q").test("a.c"), true);
    assert.equal(toRegExp("a.c", "q").test("abc"), false);
    assert.equal(toRegExp("a b [ ]c", "x").source, "ab[ ]c");
    assert.equal(toRegExp("A", "i").flags, "iu");
    assert.equal(toRegExp("^a$", "ms").flags, "msu");
    assert.equal(serializationMatches("<out>x</out>", "<out>", ""), true);
    assert.equal(serializationMatches("<out>x</out>", "^x$"), false);
  });

  it("compares serializations ignoring line endings and outer space", () => {
    assert.equal(serializationEquals("a\r\nb\n", "a\nb"), true);
    assert.equal(serializationEquals("a", "b"), false);
  });

  it("builds the XPath expression of value assertions", () => {
    assert.equal(
      assertionExpression(a("assert", " $result = 1 ")),
      "boolean($result = 1)",
    );
    assert.match(
      assertionExpression(a("assert-eq", "1")),
      /deep-equal\(\$result, \(1\)\)/,
    );
    assert.equal(
      assertionExpression(a("assert-deep-eq", "(1,2)")),
      "deep-equal($result, ((1,2)))",
    );
    assert.match(
      assertionExpression(a("assert-permutation", "1,2")),
      /^let \$expected := \(1,2\)/,
    );
    assert.equal(
      assertionExpression(a("assert-type", "xs:integer")),
      "$result instance of xs:integer",
    );
    assert.match(assertionExpression(a("assert-true")), /and \$result$/);
    assert.match(assertionExpression(a("assert-false")), /not\(\$result\)$/);
    assert.equal(assertionExpression(a("assert-empty")), "empty($result)");
    assert.equal(
      assertionExpression(a("assert-count", " 3 ")),
      "count($result) eq 3",
    );
    assert.equal(assertionExpression(a("assert-xml", "<a/>")), null);
  });
});

describe("xml comparison", () => {
  it("parses fragments, dropping declaration and doctype", () => {
    assert.equal(
      parseFragment('<?xml version="1.0"?><!DOCTYPE a><a/>').childNodes.length,
      1,
    );
    assert.equal(parseFragment("text<a/>").childNodes.length, 2);
  });

  it("finds equality regardless of attribute order and namespace declarations", () => {
    assert.equal(
      xmlDifference('<a x="1" y="2"><b/></a>', '<a y="2" x="1"><b/></a>'),
      "",
    );
    assert.equal(
      xmlDifference('<p:a xmlns:p="u"/>', '<q:a xmlns:q="u"/>', {
        ignorePrefixes: true,
      }),
      "",
    );
    assert.equal(xmlDifference("<a>x<![CDATA[y]]></a>", "<a>xy</a>"), "");
    assert.equal(
      xmlDifference("<a><!--c--><?pi d?></a>", "<a><!--c--><?pi d?></a>"),
      "",
    );
  });

  it("reports the first difference", () => {
    assert.match(
      xmlDifference('<p:a xmlns:p="u"/>', '<q:a xmlns:q="u"/>'),
      /element p:a vs q:a/,
    );
    assert.match(xmlDifference('<a x="1"/>', '<a x="2"/>'), /attributes of a/);
    assert.match(xmlDifference('<a x="1"/>', "<a/>"), /attributes of a/);
    assert.match(xmlDifference("<a>x</a>", "<a>y</a>"), /text "x" vs "y"/);
    assert.match(
      xmlDifference("<a/><b/>", "<a/>"),
      /2 children expected, got 1/,
    );
    assert.match(xmlDifference("<a/>", "text"), /child 1 kind differs/);
    assert.match(
      xmlDifference("<a><!--x--></a>", "<a><!--y--></a>"),
      /#comment differs/,
    );
    assert.match(xmlDifference("<a/>", "<a>"), /result is not well-formed/);
    assert.match(
      xmlDifference("<a>", "<a/>"),
      /expected XML is not well-formed/,
    );
  });
});
