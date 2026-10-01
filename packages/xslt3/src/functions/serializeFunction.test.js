import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import { evaluateXPath } from "../xpath/index.js";
import { flattenArrays, normalizeSequence } from "../serialize/sequence.js";

const doc = new DOMParser().parseFromString(
  "<r>" +
    '<output:serialization-parameters xmlns:output="http://www.w3.org/2010/xslt-xquery-serialization">' +
    '<output:method value="text"/></output:serialization-parameters>' +
    "<e>$</e></r>",
  "text/xml",
);
const string = (expr) => evaluateXPath(expr, doc)[0].value;
const code = (expr) => {
  try {
    evaluateXPath(expr, doc);
    return null;
  } catch (error) {
    return error.code;
  }
};

describe("fn:serialize", () => {
  it("serializes with the F&O defaults", () => {
    assert.equal(string("serialize(/r/e)"), "<e>$</e>");
    assert.equal(string("serialize((1, 'a'))"), "1 a");
    assert.equal(string("serialize(/r/e, ())"), "<e>$</e>");
  });

  it("takes parameters as an element or a map", () => {
    assert.equal(string("serialize(/r/e, /r/*:serialization-parameters)"), "$");
    assert.equal(
      string("serialize(/r/e, map { 'use-character-maps': map { '$': '£' } })"),
      "<e>£</e>",
    );
    assert.equal(
      string("serialize(/r/e, map { 'omit-xml-declaration': () })"),
      "<e>$</e>",
    );
    assert.equal(
      string("serialize([1, 2], map { 'method': 'json' })"),
      "[1,2]",
    );
  });

  it("reports errors", () => {
    assert.equal(code("serialize(/r/e, 1)"), "XPTY0004");
    assert.equal(code("serialize(/r/e, /r/e)"), "XPTY0004");
    assert.equal(code("serialize(/r/e, map { 'indent': 'yes' })"), "XPTY0004");
    assert.equal(code("serialize(name#1)"), "SENR0001");
    assert.equal(code("serialize(map {})"), "SENR0001");
  });
});

describe("sequence normalization", () => {
  const items = (expr) => evaluateXPath(expr, doc);

  it("flattens arrays", () => {
    assert.equal(flattenArrays(items("[1, [2, []], 3]")).length, 3);
  });

  it("merges text and replaces documents by their children", () => {
    const fragment = doc.createDocumentFragment();
    fragment.appendChild(doc.createTextNode("t"));
    fragment.appendChild(doc.createCDATASection("c"));
    const entries = normalizeSequence([
      ...items("(1, 2, /r/e/text(), '', 3)"),
      fragment,
    ]);
    assert.deepEqual(entries, ["1 2$ 3tc"]);
    assert.deepEqual(normalizeSequence([]), []);
    assert.deepEqual(normalizeSequence(items("(1, 2)"), "|"), ["1|2"]);
    assert.equal(
      normalizeSequence(items("/r/e/text(), /r/e"), ",")[1].nodeName,
      "e",
    );
  });
});
