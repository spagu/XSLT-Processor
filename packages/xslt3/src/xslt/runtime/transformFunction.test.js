import { describe, it } from "node:test";
import { checkBodies, parse, stylesheet } from "../testing.test.js";

const inner = stylesheet(
  `<xsl:param name="p" select="0"/>
   <xsl:template name="main"><xsl:param name="t" select="0"/><a>{$p + $t}</a><xsl:result-document href="http://x/s.xml"><s/></xsl:result-document></xsl:template>
   <xsl:template match=".[. instance of xs:integer]" mode="m"><xsl:sequence select="round(?, .)"/></xsl:template>
   <xsl:template match="*"><m>{name()}</m></xsl:template>
   <xsl:function name="f:twice" xmlns:f="urn:f" visibility="public"><xsl:param name="x"/><xsl:sequence select="2 * $x"/></xsl:function>`,
  { attributes: 'expand-text="yes"' },
);

const options = {
  attributes: 'expand-text="yes"',
  baseUri: "file:///s/main.xsl",
  loadStylesheet: (uri) => {
    if (uri === "file:///s/inner.xsl") return inner;
    if (uri === "file:///s/broken.xsl") throw new Error("broken");
    return null;
  },
  resolvePackage: (name) =>
    name === "urn:pkg"
      ? {
          source: `<xsl:package name="urn:pkg" version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:template name="main" visibility="public"><p/></xsl:template></xsl:package>`,
          baseUri: "file:///s/pkg.xsl",
        }
      : undefined,
};

const call = (map, path = "?output") =>
  `<out><xsl:sequence select="transform(map {${map}})${path}"/></out>`;

describe("fn:transform", () => {
  it("runs a stylesheet found by location, node, text or package", () => {
    checkBodies(
      [
        [
          call(
            "'stylesheet-location': 'inner.xsl', 'initial-template': QName('', 'main'), 'stylesheet-params': map {QName('', 'p'): 2}, 'template-params': map {QName('', 't'): 3}",
          ),
          "<out><a>5</a></out>",
        ],
        [
          call(
            "'stylesheet-location': 'inner.xsl', 'initial-template': QName('', 'main')",
            "('http://x/s.xml')",
          ),
          "<out><s/></out>",
        ],
        [
          call(
            "'stylesheet-node': doc('inner.xsl'), 'source-node': /, 'delivery-format': 'serialized', 'serialization-params': map {'omit-xml-declaration': true()}",
          ),
          "<out>&lt;m&gt;doc&lt;/m&gt;</out>",
        ],
        [
          call(
            "'stylesheet-text': serialize(doc('inner.xsl')), 'initial-match-selection': 3, 'initial-mode': QName('', 'm'), 'delivery-format': 'raw'",
            "?output(3.14159)",
          ),
          "<out>3.142</out>",
        ],
        [
          call(
            "'stylesheet-location': 'inner.xsl', 'initial-function': QName('urn:f', 'twice'), 'function-params': [21], 'delivery-format': 'raw'",
          ),
          "<out>42</out>",
        ],
        [
          call(
            "'package-name': 'urn:pkg', 'package-version': '1', 'initial-template': QName('', 'main')",
          ),
          "<out><p/></out>",
        ],
        [
          call(
            "'stylesheet-location': 'inner.xsl', 'initial-template': QName('', 'main'), 'delivery-format': 'raw', 'base-output-uri': 'file:///o/'",
            "=> map:keys() => count()",
          ),
          "<out>2</out>",
        ],
      ],
      {
        ...options,
        xml: "<doc/>",
        documentLoader: (uri) =>
          uri.endsWith("inner.xsl") ? parse(inner) : null,
      },
    );
  });

  it("raises FOXT0002 when there is no stylesheet", () => {
    checkBodies(
      [
        [call("'stylesheet-location': 'none.xsl'"), "FOXT0002"],
        [call("'stylesheet-location': 'broken.xsl'"), "FOXT0002"],
        [call("'package-name': 'urn:none'"), "FOXT0002"],
        [call("'initial-template': QName('', 'main')"), "FOXT0002"],
      ],
      options,
    );
  });

  it("raises the errors of the transformation", () => {
    checkBodies(
      [
        [
          call(
            "'stylesheet-location': 'inner.xsl', 'initial-template': QName('', 'none')",
          ),
          "XTDE0040",
        ],
      ],
      options,
    );
  });
});
