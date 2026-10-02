import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXSLT_MODULES,
  exsltModule,
  exsltSupport,
  isStandardNamespace,
  isUnsupportedExsltName,
  readDefinedFunctions,
  readElements,
  readExtensionPrefixes,
  readFunctionCalls,
  readNamespaces,
  readScriptPrefixes,
} from "./namespaces.js";

describe("EXSLT knowledge", () => {
  it("maps namespaces to modules and modules to their support", () => {
    assert.equal(exsltModule("http://exslt.org/common"), "common");
    assert.equal(exsltModule("http://exslt.org/random/"), "random");
    assert.equal(exsltModule("urn:x"), null);
    assert.equal(exsltSupport("strings"), "supported");
    assert.equal(exsltSupport("dynamic"), "opt-in");
    assert.equal(exsltSupport("functions"), "unsupported");
    assert.equal(exsltSupport("constructor"), "unsupported");
    assert.equal(Object.keys(EXSLT_MODULES).length, 9);
  });

  it("knows the EXSLT names the library lacks", () => {
    assert.equal(
      isUnsupportedExsltName("dates-and-times", "format-date"),
      true,
    );
    assert.equal(isUnsupportedExsltName("dates-and-times", "date"), false);
    assert.equal(isUnsupportedExsltName("toString", "x"), false);
  });

  it("treats W3C namespaces as standard", () => {
    assert.equal(isStandardNamespace("http://www.w3.org/2001/XMLSchema"), true);
    assert.equal(isStandardNamespace("http://saxon.sf.net/"), false);
  });
});

describe("readers", () => {
  it("keeps the first namespace of a prefix", () => {
    const namespaces = readNamespaces(
      `<a xmlns:p="one" xmlns:q='two'><b xmlns:p="three"/></a>`,
    );
    assert.deepEqual(
      [...namespaces],
      [
        ["p", "one"],
        ["q", "two"],
      ],
    );
  });

  it("reads prefixed calls in attribute values only, once each", () => {
    const content = `<a select="p:f(1) + p:f(2) + q:g ( 3 )" test='r:h()'>s:t(4)</a>`;
    assert.deepEqual(readFunctionCalls(content), [
      { prefix: "p", name: "f" },
      { prefix: "q", name: "g" },
      { prefix: "r", name: "h" },
    ]);
  });

  it("reads prefixed elements once each", () => {
    assert.deepEqual(readElements("<a:b/><a:b/><c:d>"), [
      { prefix: "a", name: "b" },
      { prefix: "c", name: "d" },
    ]);
  });

  it("reads the stylesheet's own functions and msxsl:script prefixes", () => {
    const content = `<xsl:function name="my:f"/><func:function name='e:g'/><xsl:function/><msxsl:script implements-prefix=" user "/>`;
    assert.deepEqual([...readDefinedFunctions(content)], ["my:f", "e:g"]);
    assert.deepEqual([...readScriptPrefixes(content)], ["user"]);
  });

  it("reads extension-element-prefixes without #default or duplicates", () => {
    const content = `<x extension-element-prefixes="a  b #default"/><y xsl:extension-element-prefixes="b c"/>`;
    assert.deepEqual(readExtensionPrefixes(content), ["a", "b", "c"]);
  });
});
