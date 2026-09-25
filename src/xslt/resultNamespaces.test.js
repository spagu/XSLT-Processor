/**
 * Regression tests for namespaces: prefixes in scope on stylesheet elements
 * (XSLT 1.0 section 2.4), names created by xsl:element and xsl:attribute
 * (7.1.2, 7.1.3), namespace nodes of literal result elements (7.1.1) and
 * attributes added after children.
 */

import { describe, it, mock } from "node:test";
import assert from "node:assert";
import { run, stylesheet, parseXML, dom } from "./harness.test.js";
import {
  attributeName,
  copyNamespaceDeclarations,
  elementName,
  setResultAttribute,
  splitQName,
} from "./resultNamespaces.js";
import { inScopeNamespaces, resolvePrefix } from "./stylesheetNamespaces.js";

const XSL = 'xmlns:xsl="http://www.w3.org/1999/XSL/Transform"';
const xml = (body, ns = "") => stylesheet(body, "xml", ns);

describe("prefixes in scope on stylesheet elements", () => {
  it("resolves a prefix declared on xsl:template", () => {
    const xsl = `<xsl:stylesheet version="1.0" ${XSL}><xsl:output method="text"/><xsl:template match="/" xmlns:f="urn:f"><xsl:value-of select="count(*/f:d)"/></xsl:template></xsl:stylesheet>`;
    assert.strictEqual(run(xsl, "<r><f:d xmlns:f='urn:f'/></r>"), "1");
  });

  it("resolves a prefix declared on an instruction or literal result element", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><xsl:value-of xmlns:f="urn:f" select="count(*/f:d)"/><o xmlns:g="urn:f"><xsl:value-of select="count(*/g:d)"/></o></xsl:template>`,
    );
    assert.strictEqual(run(xsl, "<r><f:d xmlns:f='urn:f'/></r>"), "11");
  });

  it("resolves prefixes of template match patterns on the template", () => {
    const xsl = `<xsl:stylesheet version="1.0" ${XSL}><xsl:output method="text"/><xsl:template match="f:d" xmlns:f="urn:f">F</xsl:template></xsl:stylesheet>`;
    assert.strictEqual(run(xsl, "<r><x:d xmlns:x='urn:f'/><d/></r>"), "F");
  });

  it("resolves prefixes of attribute value templates on the element", () => {
    const xsl = xml(
      `<xsl:template match="/"><o xmlns:f="urn:f" n="{count(*/f:d)}"/></xsl:template>`,
    );
    assert.strictEqual(
      run(xsl, "<r><f:d xmlns:f='urn:f'/></r>"),
      '<o xmlns:f="urn:f" n="1"/>',
    );
  });

  it("keeps the main stylesheet binding when an include rebinds the prefix", () => {
    const imports = {
      "http://x/inc.xsl": `<xsl:stylesheet version="1.0" ${XSL} xmlns:p="urn:other"><xsl:template name="inc"><xsl:value-of select="count(//p:e)"/></xsl:template></xsl:stylesheet>`,
    };
    const xsl = `<xsl:stylesheet version="1.0" ${XSL} xmlns:p="urn:main"><xsl:include href="inc.xsl"/><xsl:output method="text"/>
      <xsl:key name="k" match="p:e" use="'all'"/>
      <xsl:variable name="g" select="count(//p:e)"/>
      <xsl:template match="/"><xsl:value-of select="count(//p:e)"/>,<xsl:value-of select="$g"/>,<xsl:value-of select="count(key('k','all'))"/>,<xsl:call-template name="inc"/></xsl:template></xsl:stylesheet>`;
    const source =
      "<r xmlns:m='urn:main' xmlns:o='urn:other'><m:e/><m:e/><o:e/></r>";
    assert.strictEqual(run(xsl, source, { imports }), "2,2,2,1");
  });

  it("resolves prefixes in attribute sets on the attribute set", () => {
    const xsl = `<xsl:stylesheet version="1.0" ${XSL}><xsl:output method="xml" omit-xml-declaration="yes"/>
      <xsl:attribute-set name="s" xmlns:f="urn:f"><xsl:attribute name="n"><xsl:value-of select="count(//f:d)"/></xsl:attribute></xsl:attribute-set>
      <xsl:template match="/"><xsl:element name="o" use-attribute-sets="s"/></xsl:template></xsl:stylesheet>`;
    assert.strictEqual(run(xsl, "<r><f:d xmlns:f='urn:f'/></r>"), '<o n="1"/>');
  });
});

describe("xsl:element names", () => {
  it("uses the default namespace in scope for an unprefixed name", () => {
    const xsl = xml(
      `<xsl:template match="/"><html xmlns="http://www.w3.org/1999/xhtml"><xsl:element name="p"/></html></xsl:template>`,
    );
    assert.strictEqual(
      run(xsl),
      '<html xmlns="http://www.w3.org/1999/xhtml"><p/></html>',
    );
  });

  it("uses the in-scope binding of a prefixed name", () => {
    const xsl = xml(
      `<xsl:template match="/"><xsl:element name="q:e"/></xsl:template>`,
      'xmlns:q="urn:q"',
    );
    assert.strictEqual(run(xsl), '<q:e xmlns:q="urn:q"/>');
  });

  it("lets the namespace attribute (an AVT) win", () => {
    const xsl = xml(
      `<xsl:template match="/"><o xmlns="urn:d"><xsl:element name="e" namespace="{'urn:n'}"/><xsl:element name="f" namespace=""/></o></xsl:template>`,
    );
    assert.strictEqual(
      run(xsl),
      '<o xmlns="urn:d"><e xmlns="urn:n"/><f xmlns=""/></o>',
    );
  });
});

describe("xsl:attribute names", () => {
  it("puts a prefixed attribute in the namespace bound in scope", () => {
    const xsl = xml(
      `<xsl:template match="/"><o><xsl:attribute name="xl:href">h</xsl:attribute></o></xsl:template>`,
      'xmlns:xl="urn:xl"',
    );
    assert.strictEqual(run(xsl), '<o xmlns:xl="urn:xl" xl:href="h"/>');
  });

  it("generates a prefix for an unprefixed name with a namespace", () => {
    const xsl = xml(
      `<xsl:template match="/"><o><xsl:attribute name="a" namespace="urn:x">1</xsl:attribute><xsl:attribute name="b" namespace="urn:y">2</xsl:attribute></o></xsl:template>`,
    );
    assert.strictEqual(
      run(xsl),
      '<o xmlns:ns1="urn:x" xmlns:ns2="urn:y" ns1:a="1" ns2:b="2"/>',
    );
  });

  it("drops the prefix when the namespace attribute is empty", () => {
    const xsl = xml(
      `<xsl:template match="/"><o><xsl:attribute name="q:a" namespace="">1</xsl:attribute></o></xsl:template>`,
    );
    assert.strictEqual(run(xsl), '<o a="1"/>');
  });

  it("replaces an attribute with the same expanded name", () => {
    const xsl = xml(
      `<xsl:template match="/"><o xmlns:q="urn:q" q:a="1"><xsl:attribute name="q:a">2</xsl:attribute><xsl:attribute name="a">3</xsl:attribute><xsl:attribute name="a">4</xsl:attribute></o></xsl:template>`,
    );
    assert.strictEqual(run(xsl), '<o xmlns:q="urn:q" q:a="2" a="4"/>');
  });

  it("ignores an attribute added after child nodes, warning once", () => {
    const warn = mock.method(console, "warn", () => {});
    try {
      const xsl = xml(
        `<xsl:template match="/"><o><c/><xsl:attribute name="a">1</xsl:attribute><xsl:attribute name="b">2</xsl:attribute></o></xsl:template>`,
      );
      assert.strictEqual(run(xsl), "<o><c/></o>");
      assert.strictEqual(warn.mock.callCount(), 1);
    } finally {
      warn.mock.restore();
    }
  });
});

describe("namespace nodes of literal result elements", () => {
  it("copies namespace declarations in scope", () => {
    const xsl = xml(
      `<xsl:template match="/"><o xmlns:q="urn:q"><i/></o></xsl:template>`,
    );
    assert.strictEqual(run(xsl), '<o xmlns:q="urn:q"><i/></o>');
  });

  it("copies declarations of the stylesheet element once", () => {
    const xsl = xml(
      `<xsl:template match="/"><o><i><j/></i></o></xsl:template>`,
      'xmlns:q="urn:q"',
    );
    assert.strictEqual(run(xsl), '<o xmlns:q="urn:q"><i><j/></i></o>');
  });

  it("omits the XSLT namespace and excluded or extension prefixes", () => {
    const xsl = `<xsl:stylesheet version="1.0" ${XSL} xmlns:a="urn:a" xmlns:b="urn:b" xmlns:c="urn:c" exclude-result-prefixes="a" extension-element-prefixes="b"><xsl:output method="xml" omit-xml-declaration="yes"/>
      <xsl:template match="/"><o xmlns="urn:d" xmlns:e="urn:e" xsl:exclude-result-prefixes="#default e"/></xsl:template></xsl:stylesheet>`;
    assert.strictEqual(run(xsl), '<o xmlns="urn:d" xmlns:c="urn:c"/>');
  });

  it("never copies the stylesheet side of a namespace alias", () => {
    const xsl = `<xsl:stylesheet version="1.0" ${XSL} xmlns:axsl="urn:alias"><xsl:output method="xml" omit-xml-declaration="yes"/>
      <xsl:namespace-alias stylesheet-prefix="axsl" result-prefix="xsl"/>
      <xsl:template match="/"><axsl:stylesheet/></xsl:template></xsl:stylesheet>`;
    assert.strictEqual(
      run(xsl),
      '<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform"/>',
    );
  });

  it("does not copy a declaration clashing with the aliased element name", () => {
    const xsl = `<xsl:stylesheet version="1.0" ${XSL} xmlns:a="urn:a" xmlns:p="urn:1"><xsl:output method="xml" omit-xml-declaration="yes"/>
      <xsl:namespace-alias stylesheet-prefix="a" result-prefix="p" xmlns:p="urn:2"/>
      <xsl:template match="/"><a:x/></xsl:template></xsl:stylesheet>`;
    assert.strictEqual(run(xsl), '<p:x xmlns:p="urn:2"/>');
  });
});

describe("namespace helpers", () => {
  it("splits QNames", () => {
    assert.deepStrictEqual(splitQName("a:b"), { prefix: "a", localName: "b" });
    assert.deepStrictEqual(splitQName("b"), { prefix: "", localName: "b" });
  });

  it("resolves names against a scope", () => {
    const scope = { "": "urn:d", q: "urn:q", u: "" };
    assert.deepStrictEqual(elementName("q:e", null, scope), {
      namespaceUri: "urn:q",
      qname: "q:e",
    });
    assert.deepStrictEqual(elementName("e", "", scope), {
      namespaceUri: null,
      qname: "e",
    });
    assert.deepStrictEqual(attributeName("u:a", null, scope), {
      namespaceUri: null,
      qname: "u:a",
    });
    assert.deepStrictEqual(attributeName("xml:lang", null, scope), {
      namespaceUri: "http://www.w3.org/XML/1998/namespace",
      qname: "xml:lang",
    });
    assert.strictEqual(resolvePrefix(scope, "missing"), null);
  });

  it("returns an empty scope for non-elements", () => {
    assert.deepStrictEqual(inScopeNamespaces(null), {});
    const doc = parseXML("<r xmlns:a='urn:a'><e/></r>");
    const e = doc.documentElement.firstChild;
    assert.strictEqual(
      inScopeNamespaces(e),
      inScopeNamespaces(doc.documentElement),
    );
  });

  it("never creates xmlns attributes and avoids clashing prefixes", () => {
    const doc = dom.window.document.implementation.createDocument(
      null,
      null,
      null,
    );
    const element = doc.createElementNS("urn:e", "p:o");
    setResultAttribute(element, { namespaceUri: null, qname: "xmlns" }, "x");
    setResultAttribute(
      element,
      { namespaceUri: "urn:x", qname: "xmlns:a" },
      "x",
    );
    setResultAttribute(element, { namespaceUri: "urn:a", qname: "p:a" }, "1");
    element.setAttributeNS(
      "http://www.w3.org/2000/xmlns/",
      "xmlns:ns2",
      "urn:z",
    );
    setResultAttribute(element, { namespaceUri: "urn:b", qname: "ns1:b" }, "2");
    const names = Array.from(
      element.attributes,
      (a) => `${a.name}=${a.namespaceURI}`,
    );
    assert.deepStrictEqual(names, [
      "ns1:a=urn:a",
      "xmlns:ns2=http://www.w3.org/2000/xmlns/",
      "ns3:b=urn:b",
    ]);
  });

  it("does not copy a declaration clashing with the copy's own name", () => {
    const doc = dom.window.document.implementation.createDocument(
      null,
      null,
      null,
    );
    const source = parseXML(
      `<p:e xmlns:p="urn:p" xmlns="urn:d"/>`,
    ).documentElement;
    const copy = doc.createElementNS("urn:other", "p:e");
    copyNamespaceDeclarations(source, copy);
    assert.deepStrictEqual(
      Array.from(copy.attributes, (a) => `${a.name}=${a.value}`),
      ["xmlns=urn:d"],
    );
  });
});
