import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkBodies, errorCode, runBody } from "../testing.test.js";

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
