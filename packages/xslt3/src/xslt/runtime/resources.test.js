import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkBodies, parse, run, stylesheet } from "../testing.test.js";
import { startsWithElement } from "./streamAvailable.js";

const options = { attributes: 'expand-text="yes"' };

describe("resources of a transformation", () => {
  it("read text relative to the calling module", () => {
    const seen = [];
    checkBodies(
      [
        [
          "<out>{unparsed-text('a.txt')} {unparsed-text-available('none.txt')}</out>",
          "<out>text false</out>",
        ],
      ],
      {
        ...options,
        baseUri: "file:///s/main.xsl",
        textLoader: (uri) => (
          seen.push(uri),
          uri.endsWith("a.txt") ? "text" : null
        ),
      },
    );
    assert.deepEqual(seen, ["file:///s/a.txt", "file:///s/none.txt"]);
  });

  it("strip collections and documents with the rules of the package", () => {
    const documents = () => [parse("<c> <d/> </c>"), 7];
    checkBodies(
      [
        [
          "<out>{count(collection()[1]/c/node())} {collection()[2]} {count(collection('c')[1]/c/node())}</out>",
          "<out>1 7 1</out>",
        ],
        ["<out>{count(collection('none'))}</out>", "FODC0002"],
      ],
      {
        ...options,
        declarations: '<xsl:strip-space elements="*"/>',
        baseUri: "file:///s/main.xsl",
        collections: (uri) =>
          uri === null || uri === "file:///s/c" ? documents() : null,
      },
    );
  });

  it("tell whether a document can be streamed", () => {
    const texts = {
      "file:///s/ok.xml": "<a/>",
      "file:///s/start.xml":
        "<?xml version='1.0'?><!--c--><!DOCTYPE a [<!ENTITY e 'x'>]><a><b>",
      "file:///s/dtd.xml": "<!DOCTYPE a [<!ENTITY e 'x'>]>",
    };
    checkBodies(
      [
        [
          "<out>{stream-available('ok.xml')} {stream-available('start.xml')} {stream-available('dtd.xml')} {stream-available('none.xml')} {stream-available(())}</out>",
          "<out>true true false false false</out>",
        ],
      ],
      {
        ...options,
        baseUri: "file:///s/main.xsl",
        documentLoader: (uri) =>
          uri.endsWith("ok.xml") ? parse("<a/>") : null,
        textLoader: (uri) => texts[uri] ?? null,
      },
    );
    assert.equal(startsWithElement("﻿ <?pi?> <a>"), true);
    assert.equal(startsWithElement("text"), false);
  });
});

describe("fn:current-output-uri", () => {
  it("is absent in dynamic calls, inline functions and patterns", () => {
    checkBodies(
      [
        [
          "<out>{current-output-uri()} {empty(current-output-uri#0())} {empty(function() {current-output-uri()}())}</out>",
          "<out>file:///out/r.xml true true</out>",
        ],
        ['<xsl:apply-templates select="doc" mode="m"/>', "<out>true</out>"],
      ],
      {
        ...options,
        declarations:
          '<xsl:template match="doc[empty(current-output-uri())]" mode="m"><out>true</out></xsl:template>',
        baseOutputUri: "file:///out/r.xml",
      },
    );
  });
});

describe("fn:function-lookup in packages", () => {
  it("finds the functions of the calling package, never xsl:original", () => {
    const used =
      `<xsl:package name="urn:used" version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:f="urn:f">
      <xsl:function name="f:hidden" visibility="private"><xsl:sequence select="1"/></xsl:function>
      <xsl:function name="f:add" visibility="public"><xsl:sequence select="2"/></xsl:function>
      <xsl:template name="t" visibility="public"><r>{exists(function-lookup(xs:QName('f:hidden'), 0))} {exists(function-lookup(xs:QName('f:mine'), 0))}</r></xsl:template>
    </xsl:package>`.replace(
        "<xsl:package",
        '<xsl:package expand-text="yes" exclude-result-prefixes="#all" xmlns:xs="http://www.w3.org/2001/XMLSchema"',
      );
    const xsl = stylesheet(
      `<xsl:use-package name="urn:used"><xsl:override><xsl:function name="f:add" visibility="public"><xsl:sequence select="exists(function-lookup(xs:QName('xsl:original'), 0))"/></xsl:function></xsl:override></xsl:use-package>
       <xsl:function name="f:mine"><xsl:sequence select="3"/></xsl:function>
       <xsl:template match="/"><out><xsl:call-template name="t"/>{f:add()}</out></xsl:template>`,
      { attributes: 'expand-text="yes" xmlns:f="urn:f"', exclude: "f" },
    );
    assert.equal(
      run(xsl, "<doc/>", { resolvePackage: () => parse(used) }),
      "<out><r>true false</r>false</out>",
    );
  });
});
