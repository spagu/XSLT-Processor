import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileStylesheet } from "../api.js";
import {
  checkBodies,
  createDocument,
  errorCode,
  run,
  show,
  stylesheet,
  XSL,
} from "../testing.test.js";

describe("use-when, static variables and shadow attributes", () => {
  it("include elements conditionally", () => {
    const xsl = stylesheet(
      '<xsl:param name="mode" static="yes" select="\'b\'"/>' +
        '<xsl:variable name="v" static="yes" select="$mode || \'!\'"/>' +
        '<xsl:variable name="w" static="yes"/>' +
        '<xsl:template match="/" use-when="$mode = \'a\'">a</xsl:template>' +
        '<xsl:template match="/" use-when="$mode = \'b\'"><out _a="{$v}{$w}"><x xsl:use-when="system-property(\'xsl:version\') = \'3.0\'"/>' +
        "<y xsl:use-when=\"function-available('concat')\"/><z xsl:use-when=\"element-available('xsl:nonsense')\"/></out></xsl:template>",
    );
    assert.equal(run(xsl), '<out _a="b!"><x/><y/></out>');
    assert.equal(run(xsl, "<doc/>", { staticParams: { mode: "a" } }), "a");
    assert.equal(
      run(
        stylesheet(
          '<xsl:template match="/"><xsl:value-of _select="{1 + 1}"/></xsl:template>',
        ),
      ),
      "2",
    );
    assert.equal(
      errorCode(() => run(stylesheet('<xsl:variable static="yes"/>'))),
      "XTSE0010",
    );
  });
});

describe("standard attributes", () => {
  it("exclude every namespace with #all and #default", () => {
    checkBodies([
      [
        '<out xmlns:p="urn:p" xmlns="urn:d" xsl:exclude-result-prefixes="#all"><p:x/></out>',
        '<out xmlns="urn:d"><p:x xmlns:p="urn:p"/></out>',
      ],
    ]);
    checkBodies([
      [
        '<out xmlns="urn:d" xsl:exclude-result-prefixes="#default"><x xmlns=""/></out>',
        '<out xmlns="urn:d"><x xmlns=""/></out>',
      ],
    ]);
  });

  it("read namespaces from names when there are no declarations", () => {
    const document = createDocument();
    const root = document.createElementNS(XSL, "xsl:stylesheet");
    root.setAttribute("version", "3.0");
    const template = document.createElementNS(XSL, "xsl:template");
    template.setAttribute("name", "t");
    template.appendChild(document.createTextNode("built"));
    root.appendChild(template);
    document.appendChild(root);
    assert.equal(
      show(
        compileStylesheet(document).transform({
          initialTemplate: "t",
          createDocument,
        }).principal,
      ),
      "built",
    );
  });

  it("are checked", () => {
    const cases = [
      [stylesheet('<xsl:template match="/" bad="1"/>'), "XTSE0090"],
      [stylesheet('<xsl:template match="/" xsl:name="t"/>'), "XTSE0090"],
      [stylesheet("", { exclude: "none" }), "XTSE0808"],
      [
        stylesheet("", { attributes: 'extension-element-prefixes="none"' }),
        "XTSE1430",
      ],
      [
        stylesheet("", { attributes: 'default-collation="urn:none"' }),
        "XTSE0125",
      ],
      [stylesheet("", { version: "x" }), "XTSE0110"],
      [
        stylesheet('<xsl:template match="/" mode="m" default-mode="1"/>'),
        "XTSE0545",
      ],
      [stylesheet('<xsl:template name="u:t"/>'), "XTSE0280"],
    ];
    for (const [xsl, code] of cases) {
      assert.equal(
        errorCode(() => run(xsl)),
        code,
        xsl,
      );
    }
  });

  it("set the default collation, namespace and mode", () => {
    checkBodies(
      [
        [
          "<out>{default-collation()}</out>",
          "<out>http://www.w3.org/2005/xpath-functions/collation/codepoint</out>",
        ],
        [
          '<out>{count(//*)}<xsl:for-each select="//*" xpath-default-namespace="urn:d">{name()}</xsl:for-each></out>',
          "<out>1d</out>",
        ],
      ],
      {
        attributes:
          'expand-text="yes" default-collation="urn:none http://www.w3.org/2005/xpath-functions/collation/codepoint"',
        xml: '<d xmlns="urn:d"/>',
      },
    );
    assert.equal(
      run(
        stylesheet(
          '<xsl:template match="/" mode="m"><xsl:apply-templates select="*"/></xsl:template><xsl:template match="d" mode="#default">in m</xsl:template>',
          { attributes: 'default-mode="m"' },
        ),
        "<d/>",
      ),
      "in m",
    );
    assert.equal(
      run(
        stylesheet('<xsl:template match="/" mode="#unnamed">u</xsl:template>', {
          attributes: 'default-mode="#unnamed"',
        }),
      ),
      "u",
    );
  });

  it("handle extension elements and forwards compatibility", () => {
    checkBodies(
      [
        [
          "<out><e:x><xsl:fallback>fb</xsl:fallback></e:x></out>",
          "<out>fb</out>",
        ],
        ["<out><e:x/></out>", "XTDE1450"],
        [
          "<out><xsl:future><xsl:fallback>f</xsl:fallback></xsl:future></out>",
          "<out>f</out>",
        ],
        ["<out><xsl:future/></out>", "XTSE0010"],
        ['<out><xsl:value-of select="1" future="x"/></out>', "<out>1</out>"],
      ],
      {
        attributes: 'xmlns:e="urn:e" extension-element-prefixes="e"',
        version: "4.0",
      },
    );
    checkBodies([
      ["<xsl:include href='x'/>", "XTSE0170"],
      ["<xsl:import href='x'/>", "XTSE0190"],
      ["<xsl:template/>", "XTSE0010"],
      ["<xsl:fallback/><out/>", "<out/>"],
    ]);
  });
});

describe("whitespace", () => {
  it("is stripped from the stylesheet and kept where significant", () => {
    checkBodies([
      ["<out> <a/> </out>", "<out><a/></out>"],
      [
        '<out xml:space="preserve"> <a/> </out>',
        '<out xml:space="preserve"> <a/> </out>',
      ],
      [
        '<xsl:choose xml:space="preserve"> <xsl:when test="1">w</xsl:when> </xsl:choose>',
        "w",
      ],
      ["<out>a<!--c-->b</out>", "<out>ab</out>"],
    ]);
  });

  it("is stripped from source documents", () => {
    const declarations =
      '<xsl:strip-space elements="*"/><xsl:preserve-space elements="p q:* *:r"/>';
    checkBodies([["<out>{count(//text())}</out>", "<out>6</out>"]], {
      declarations,
      attributes: 'expand-text="yes" xmlns:q="urn:q"',
      exclude: "q",
      xml: '<doc> <p> </p> <q:x xmlns:q="urn:q"> </q:x> <r> </r> <s xml:space="preserve"> <t> </t> </s> <u xml:space="default"/> </doc>',
    });
    checkBodies([["<out>{count(//text())}</out>", "<out>2</out>"]], {
      declarations: '<xsl:strip-space elements="Q{urn:q}*"/>',
      attributes: 'expand-text="yes"',
      xml: '<doc> <x xmlns="urn:q"> </x> </doc>',
    });
    checkBodies([["<out/>", "XTSE0270"]], {
      declarations:
        '<xsl:strip-space elements="a"/><xsl:preserve-space elements="a"/>',
    });
    checkBodies([["<out/>", "XTSE0280"]], {
      declarations: '<xsl:strip-space elements="none:*"/>',
    });
  });
});

describe("namespace aliases", () => {
  it("are checked", () => {
    checkBodies([["<out/>", "XTSE0812"]], {
      declarations:
        '<xsl:namespace-alias stylesheet-prefix="a" result-prefix="#default"/>',
    });
    checkBodies([["<out/>", "XTSE0810"]], {
      attributes: 'xmlns:a="urn:a" xmlns:b="urn:b" xmlns:c="urn:c"',
      declarations:
        '<xsl:namespace-alias stylesheet-prefix="a" result-prefix="b"/><xsl:namespace-alias stylesheet-prefix="a" result-prefix="c"/>',
    });
  });
});
