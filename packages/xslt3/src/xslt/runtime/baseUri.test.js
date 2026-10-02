import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkBodies, errorCode, parse, runBody } from "../testing.test.js";

const options = {
  attributes: 'xml:base="http://example.org/s/" expand-text="yes"',
};

describe("base URIs of constructed nodes", () => {
  it("come from the stylesheet and xml:base", () => {
    checkBodies(
      [
        [
          '<xsl:variable name="t" xml:base="t/"><e xml:base="e/"><f/></e></xsl:variable><out>{base-uri($t)} {base-uri($t/e/f)}</out>',
          "<out>http://example.org/s/t/ http://example.org/s/t/e/</out>",
        ],
        [
          '<xsl:variable name="e" as="element()"><e xml:base="e/"/></xsl:variable><out>{base-uri($e)}</out>',
          "<out>http://example.org/s/e/</out>",
        ],
        [
          '<xsl:variable name="e" as="element()"><xsl:element name="e"/></xsl:variable><out>{base-uri($e)}</out>',
          "<out>http://example.org/s/</out>",
        ],
        [
          '<xsl:variable name="c" as="element()"><xsl:copy-of select="/doc/a"/></xsl:variable><out>{base-uri($c)}</out>',
          "<out>http://example.org/d/a/</out>",
        ],
      ],
      {
        ...options,
        xml: '<doc xml:base="http://example.org/d/"><a xml:base="a/"/></doc>',
      },
    );
  });

  it("are kept by copies, inherited once attached", () => {
    checkBodies(
      [
        [
          '<xsl:variable name="c" as="element()"><xsl:for-each select="/doc/a"><xsl:copy/></xsl:for-each></xsl:variable><out>{base-uri($c)}</out>',
          "<out>http://example.org/d/a/</out>",
        ],
        [
          '<xsl:variable name="t"><xsl:copy-of select="/doc/a"/></xsl:variable><out>{base-uri($t/a)}</out>',
          "<out>http://example.org/s/a/</out>",
        ],
        [
          '<xsl:variable name="d" as="document-node()"><xsl:copy-of select="doc(\'x.xml\')"/></xsl:variable><xsl:variable name="s" as="document-node()"><xsl:copy select="doc(\'x.xml\')"><z/></xsl:copy></xsl:variable><out>{base-uri($d)} {base-uri($s/z)}</out>',
          "<out>http://example.org/x.xml http://example.org/x.xml</out>",
        ],
        [
          '<xsl:variable name="m" as="item()*"><xsl:apply-templates select="doc(\'x.xml\'), /doc/a" mode="m"/></xsl:variable><out>{base-uri($m[1])} {base-uri($m[2])}</out>',
          "<out>http://example.org/x.xml http://example.org/d/a/</out>",
        ],
        [
          "<out>[{base-uri(/doc/namespace::xml)}] {base-uri(/doc/b/c)} {base-uri(/doc/f/g)}</out>",
          "<out>[] http://parent.com http://a/c</out>",
        ],
      ],
      {
        ...options,
        declarations:
          '<xsl:mode name="m" on-no-match="shallow-copy"/><xsl:template match="a/node()" mode="m"/>',
        xml: '<doc xml:base="http://example.org/d/"><a xml:base="a/"/><b><c xml:base="http://parent.com"/></b><f xml:base="http://a/b#f"><g xml:base="c"/></f></doc>',
        documentLoader: () => {
          const document = parse("<x/>");
          document.documentURI = "http://example.org/x.xml";
          return document;
        },
      },
    );
  });
});

describe("unknown extension functions in backwards-compatible mode", () => {
  it("fail only when called", () => {
    const declarations =
      '<xsl:variable name="unused" select="ext:f()" xmlns:ext="urn:ext"/>';
    assert.equal(
      runBody("<out/>", "<doc/>", { version: "1.0", declarations }),
      "<out/>",
    );
    assert.equal(
      errorCode(() =>
        runBody(
          '<xsl:value-of select="ext:f()" xmlns:ext="urn:ext"/>',
          "<doc/>",
          { version: "1.0" },
        ),
      ),
      "XTDE1425",
    );
    assert.equal(
      errorCode(() =>
        runBody('<xsl:value-of select="ext:f()" xmlns:ext="urn:ext"/>'),
      ),
      "XPST0017",
    );
    assert.equal(
      errorCode(() =>
        runBody('<xsl:value-of select="unknown()"/>', "<doc/>", {
          version: "1.0",
        }),
      ),
      "XPST0017",
    );
    assert.equal(
      errorCode(() =>
        runBody('<xsl:value-of select="1 +"/>', "<doc/>", { version: "1.0" }),
      ),
      "XPST0003",
    );
  });
});
