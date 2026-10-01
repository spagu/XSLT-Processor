import { describe, it } from "node:test";
import { checkBodies } from "../testing.test.js";

describe("literal result elements", () => {
  it("copy names, namespaces and attribute value templates", () => {
    checkBodies([
      ['<out a="{1+1}" b="x{{y}}"/>', '<out a="2" b="x{y}"/>'],
      ['<p:out xmlns:p="urn:p"/>', '<p:out xmlns:p="urn:p"/>'],
      [
        '<out xmlns:q="urn:q" xmlns:r="urn:r" xsl:exclude-result-prefixes="r"><in/></out>',
        '<out xmlns:q="urn:q"><in/></out>',
      ],
      ['<out><in xmlns=""/></out>', "<out><in/></out>"],
      [
        '<a xmlns="urn:a"><b xmlns=""/></a>',
        '<a xmlns="urn:a"><b xmlns=""/></a>',
      ],
      ['<out p:a="1" xmlns:p="urn:p"/>', '<out xmlns:p="urn:p" p:a="1"/>'],
      ['<out xsl:if="x"/>', "XTSE0805"],
    ]);
  });

  it("apply namespace aliases", () => {
    checkBodies([['<a:out a:x="1"/>', '<b:out xmlns:b="urn:b" b:x="1"/>']], {
      attributes: 'xmlns:a="urn:a" xmlns:b="urn:b"',
      declarations:
        '<xsl:namespace-alias stylesheet-prefix="a" result-prefix="b"/>',
    });
    checkBodies([["<a:out/>", "<out/>"]], {
      attributes: 'xmlns:a="urn:a"',
      declarations:
        '<xsl:namespace-alias stylesheet-prefix="a" result-prefix="#default"/>',
    });
  });

  it("are ignored attributes in forwards-compatible mode", () => {
    checkBodies([['<out xsl:future="x"/>', "<out/>"]], { version: "4.0" });
  });
});

describe("xsl:element and xsl:attribute", () => {
  it("compute element names", () => {
    checkBodies([
      ['<xsl:element name="e{1}"/>', "<e1/>"],
      ['<xsl:element name="p:e" namespace="urn:x"/>', '<p:e xmlns:p="urn:x"/>'],
      ['<xsl:element name="e" namespace="urn:x"/>', '<e xmlns="urn:x"/>'],
      ['<xsl:element name="p:e" namespace=""/>', "<e/>"],
      ['<xsl:element name="p:e" xmlns:p="urn:p"/>', '<p:e xmlns:p="urn:p"/>'],
      ['<xsl:element name="e" xmlns="urn:d"/>', '<e xmlns="urn:d"/>'],
      ['<xsl:element name="xml:e"/>', "<xml:e/>"],
      ['<xsl:element name="1e"/>', "XTDE0820"],
      ['<xsl:element name="q:e"/>', "XTDE0830"],
      ["<xsl:element/>", "XTSE0010"],
    ]);
  });

  it("compute attributes", () => {
    checkBodies([
      [
        '<out><xsl:attribute name="a" select="1 to 3"/></out>',
        '<out a="1 2 3"/>',
      ],
      [
        '<out><xsl:attribute name="a" select="1 to 3" separator=","/></out>',
        '<out a="1,2,3"/>',
      ],
      [
        '<out><xsl:attribute name="a"><xsl:sequence select="1, 2"/></xsl:attribute></out>',
        '<out a="12"/>',
      ],
      [
        '<out><xsl:attribute name="a" namespace="urn:n">v</xsl:attribute></out>',
        '<out xmlns:ns0="urn:n" ns0:a="v"/>',
      ],
      [
        '<out xmlns:p="urn:1"><xsl:attribute name="p:a" namespace="urn:2">v</xsl:attribute></out>',
        '<out xmlns:p="urn:1" xmlns:p_1="urn:2" p_1:a="v"/>',
      ],
      [
        '<out xmlns:p="urn:1"><xsl:attribute name="p:a">1</xsl:attribute><xsl:attribute name="p:a">2</xsl:attribute></out>',
        '<out xmlns:p="urn:1" p:a="2"/>',
      ],
      [
        '<out><xsl:attribute name="xmlns:a" namespace="urn:n">v</xsl:attribute></out>',
        '<out xmlns:ns0="urn:n" ns0:a="v"/>',
      ],
      ['<out><xsl:attribute name="xmlns">v</xsl:attribute></out>', "XTDE0855"],
      ['<out><xsl:attribute name="a b">v</xsl:attribute></out>', "XTDE0850"],
      ['<out><xsl:attribute name="q:a">v</xsl:attribute></out>', "XTDE0860"],
      ['<out><b/><xsl:attribute name="a">v</xsl:attribute></out>', "XTDE0410"],
      ['<xsl:attribute name="a">v</xsl:attribute>', "XTDE0420"],
      [
        '<out><xsl:attribute name="a" select="1">v</xsl:attribute></out>',
        "XTSE0840",
      ],
    ]);
  });

  it("returns parentless attributes in a sequence", () => {
    checkBodies(
      [
        [
          '<xsl:variable name="a" as="attribute()"><xsl:attribute name="x" namespace="urn:n">1</xsl:attribute></xsl:variable><out><xsl:sequence select="$a"/>{namespace-uri($a)}</out>',
          '<out xmlns:ns0="urn:n" ns0:x="1">urn:n</out>',
        ],
      ],
      { attributes: 'expand-text="yes"' },
    );
  });
});

describe("attribute sets", () => {
  const declarations =
    '<xsl:attribute-set name="a" use-attribute-sets="b"><xsl:attribute name="x">1</xsl:attribute></xsl:attribute-set>' +
    '<xsl:attribute-set name="b"><xsl:attribute name="y">{name(.)}</xsl:attribute></xsl:attribute-set>';

  it("add their attributes before the element's own", () => {
    checkBodies(
      [
        ['<out xsl:use-attribute-sets="a" x="2"/>', '<out y="" x="2"/>'],
        ['<xsl:element name="e" use-attribute-sets="a"/>', '<e y="" x="1"/>'],
        [
          '<xsl:for-each select="doc"><xsl:copy use-attribute-sets="b"/></xsl:for-each>',
          '<doc y="doc"/>',
        ],
      ],
      { declarations, attributes: 'expand-text="yes"' },
    );
  });

  it("merge declarations of the same name", () => {
    checkBodies([['<out xsl:use-attribute-sets="s"/>', '<out x="2" y="1"/>']], {
      declarations:
        '<xsl:attribute-set name="s"><xsl:attribute name="x">1</xsl:attribute><xsl:attribute name="y">1</xsl:attribute></xsl:attribute-set>' +
        '<xsl:attribute-set name="s"><xsl:attribute name="x">2</xsl:attribute></xsl:attribute-set>',
    });
  });

  it("are checked", () => {
    checkBodies([
      ['<out xsl:use-attribute-sets="none"/>', "XTSE0710"],
      ['<out xsl:use-attribute-sets="#x"/>', "XTSE0710"],
    ]);
    checkBodies([["<out xsl:use-attribute-sets='a'/>", "XTSE0720"]], {
      declarations: '<xsl:attribute-set name="a" use-attribute-sets="a"/>',
    });
    checkBodies([["<out/>", "XTSE0010"]], {
      declarations: '<xsl:attribute-set name="a"><b/></xsl:attribute-set>',
    });
  });
});
