import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkBodies,
  errorCode,
  show,
  stylesheet,
  transform,
} from "../testing.test.js";

/**
 * Runs a template body and returns the whole result.
 * @param {string} body
 * @param {object} [options]
 * @returns {object}
 */
const result = (body, options = {}) =>
  transform(
    stylesheet(
      `${options.declarations ?? ""}<xsl:template match="/">${body}</xsl:template>`,
    ),
    "<doc/>",
    options,
  );

describe("xsl:message", () => {
  it("collects messages as documents", () => {
    const seen = [];
    const { messages } = result(
      '<xsl:message select="1">x</xsl:message><xsl:message><a/></xsl:message>',
      { onMessage: (message) => seen.push(message) },
    );
    assert.deepEqual(messages.map(show), ["1x", "<a/>"]);
    assert.equal(seen.length, 2);
  });

  it("keeps a message that cannot be a document as a sequence", () => {
    const { messages } = result(
      '<xsl:message><xsl:attribute name="a">1</xsl:attribute></xsl:message>',
    );
    assert.equal(show(messages[0]), "@a=1");
  });

  it("terminates", () => {
    checkBodies([
      ['<xsl:message terminate="yes">stop</xsl:message>', "XTMM9000"],

      [
        '<xsl:message terminate="yes" error-code="1 2">stop</xsl:message>',
        "XTMM9000",
      ],
      ["<xsl:message terminate=\"{'perhaps'}\"/>", "XTDE0030"],
      ['<xsl:message terminate="perhaps"/>', "XTSE0020"],
      ['<xsl:message terminate="no"/><out/>', "<out/>"],
    ]);
    assert.equal(
      errorCode(() =>
        result(
          '<xsl:message terminate="{\'yes\'}" error-code="Q{{urn:e}}MINE"/>',
        ),
      ),
      "MINE",
    );
  });
});

describe("xsl:result-document", () => {
  it("collects secondary results", () => {
    const { principal, secondary } = result(
      '<xsl:result-document href="a.xml" method="xml" indent="{\'yes\'}"><a/></xsl:result-document>' +
        '<xsl:result-document href="b.xml" format="f">text</xsl:result-document><out/>',
      { declarations: '<xsl:output name="f" method="text"/>' },
    );
    assert.equal(show(principal), "<out/>");
    assert.equal(show(secondary.get("a.xml").document), "<a/>");
    assert.deepEqual(secondary.get("a.xml").output, {
      method: "xml",
      indent: "yes",
    });
    assert.equal(show(secondary.get("b.xml").document), "text");
    assert.equal(secondary.get("b.xml").output.method, "text");
  });

  it("resolves URIs against the base output URI", () => {
    const { secondary } = result(
      '<xsl:result-document href="a.xml">{current-output-uri()}</xsl:result-document>',
      { baseOutputUri: "file:///out/main.xml" },
    );
    assert.equal(
      show(secondary.get("file:///out/a.xml").document),
      "{current-output-uri()}",
    );
  });

  it("replaces the principal result without href", () => {
    const { principal } = result(
      "<xsl:result-document><b/></xsl:result-document>",
    );
    assert.equal(show(principal), "<b/>");
  });

  it("takes serialization parameters from its attributes", () => {
    const { output } = result(
      '<xsl:result-document method="p:m" cdata-section-elements="a p:b" item-separator=" | " use-character-maps="c" xmlns:p="urn:p"><b/></xsl:result-document>',
      {
        declarations:
          '<xsl:output indent="yes"/><xsl:character-map name="c"><xsl:output-character character="x" string="y"/></xsl:character-map>',
      },
    );
    assert.deepEqual(output, {
      indent: "yes",
      method: "{urn:p}m",
      "cdata-section-elements": ["{}a", "{urn:p}b"],
      "item-separator": " | ",
      "use-character-maps": new Map([["x", "y"]]),
    });
    assert.deepEqual(result("<out/>").output, { method: "xml" });
  });

  it("raises its errors", () => {
    checkBodies(
      [
        [
          '<xsl:result-document href="a"/><xsl:result-document href="a"/>',
          "XTDE1490",
        ],
        ["<xsl:result-document/><out/>", "XTDE1490"],
        [
          '<xsl:variable name="v"><xsl:result-document href="a"/></xsl:variable><out>{$v}</out>',
          "XTDE1480",
        ],
        ['<xsl:result-document format="none"/>', "XTDE1460"],
      ],
      { attributes: 'expand-text="yes"' },
    );
    assert.equal(
      errorCode(() =>
        result('<xsl:result-document format="p:x" xmlns:p="urn:p"/>'),
      ),
      "XTDE1460",
    );
  });

  it("reports the current output URI", () => {
    checkBodies(
      [
        ["<out>{current-output-uri()}</out>", "<out>file:///o.xml</out>"],
        [
          '<xsl:variable name="v">{current-output-uri()}</xsl:variable><out>[{$v}]</out>',
          "<out>[]</out>",
        ],
      ],
      { attributes: 'expand-text="yes"', baseOutputUri: "file:///o.xml" },
    );
    checkBodies([["<out>[{current-output-uri()}]</out>", "<out>[]</out>"]], {
      attributes: 'expand-text="yes"',
    });
  });
});

describe("xsl:map, xsl:map-entry, xsl:try", () => {
  it("builds maps", () => {
    checkBodies(
      [
        [
          '<xsl:variable name="m" as="map(*)"><xsl:map><xsl:map-entry key="1" select="2"/><xsl:map-entry key="\'b\'">x</xsl:map-entry></xsl:map></xsl:variable><out>{$m(1)}{$m?b}</out>',
          "<out>2x</out>",
        ],
        ["<xsl:map><a/></xsl:map>", "XTTE3375"],
        [
          '<xsl:map><xsl:map-entry key="1" select="1"/><xsl:map-entry key="1" select="2"/></xsl:map>',
          "XTDE3365",
        ],
        ['<xsl:map-entry key="(1, 2)" select="1"/>', "XPTY0004"],
        ['<xsl:map-entry key="1" select="1">x</xsl:map-entry>', "XTSE3280"],
      ],
      { attributes: 'expand-text="yes"' },
    );
  });

  it("catches errors", () => {
    checkBodies(
      [
        [
          '<out><xsl:try><xsl:sequence select="1 div 0"/><xsl:catch errors="err:FOAR0001" select="$err:code, $err:description"/></xsl:try></out>',
          "<out>err:FOAR0001 Division by zero in div</out>",
        ],
        [
          "<out><xsl:try select=\"error(QName('urn:e', 'e:mine'), 'm', 7)\"><xsl:catch errors=\"e:*\">{$err:value}</xsl:catch></xsl:try></out>",
          "<out>7</out>",
        ],
        [
          '<out><xsl:try select="1 div 0"><xsl:catch errors="*:XYZ Q{urn:x}*">no</xsl:catch><xsl:catch errors="*:FOAR0001">yes</xsl:catch></xsl:try></out>',
          "<out>yes</out>",
        ],
        [
          '<out><xsl:try select="1"><xsl:catch/></xsl:try></out>',
          "<out>1</out>",
        ],
        [
          '<out><xsl:try select="1 div 0"><xsl:catch>c</xsl:catch></xsl:try></out>',
          "<out>c</out>",
        ],
        [
          '<xsl:try select="1 div 0"><xsl:catch errors="XYZ"/></xsl:try>',
          "FOAR0001",
        ],
        ['<xsl:try select="1"/>', "XTSE0010"],
        ['<xsl:try select="1"><xsl:catch/><b/></xsl:try>', "XTSE0010"],
        ['<xsl:try select="1">x<xsl:catch/></xsl:try>', "XTSE3140"],
        [
          '<xsl:try select="1"><xsl:catch select="1">x</xsl:catch></xsl:try>',
          "XTSE3150",
        ],
      ],
      {
        attributes:
          'expand-text="yes" xmlns:err="http://www.w3.org/2005/xqt-errors" xmlns:e="urn:e"',
        exclude: "err e",
      },
    );
  });
});
