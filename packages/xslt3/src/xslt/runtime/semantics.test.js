import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkBodies,
  errorCode,
  parse,
  run,
  stylesheet,
  transform,
} from "../testing.test.js";
import { isStrippedText } from "./strip.js";

const options = { attributes: 'expand-text="yes"' };

describe("stylesheet functions with cache", () => {
  it("return the same result for the same arguments", () => {
    checkBodies(
      [
        [
          "<xsl:variable name=\"e\" select=\"(1, 2, 1, 2) ! f:e(.)\"/><out>{count($e | ())} {f:fib(80)} {f:q(xs:QName('a:x'), xs:QName('b:x'))} {f:n(/doc, /doc)}</out>",
          "<out>2 23416728348467685 false true</out>",
        ],
      ],
      {
        ...options,
        attributes:
          'expand-text="yes" xmlns:f="urn:f" xmlns:a="urn:a" xmlns:b="urn:b"',
        exclude: "f a b",
        declarations: `<xsl:function name="f:e" new-each-time="no"><xsl:param name="n"/><e>{$n}</e></xsl:function>
          <xsl:function name="f:fib" cache="yes" as="xs:integer"><xsl:param name="n" as="xs:integer"/><xsl:sequence select="if ($n le 2) then 1 else f:fib($n - 1) + f:fib($n - 2)"/></xsl:function>
          <xsl:function name="f:q" cache="true"><xsl:param name="a"/><xsl:param name="b"/><xsl:sequence select="$a eq $b"/></xsl:function>
          <xsl:function name="f:n" cache="yes"><xsl:param name="a"/><xsl:param name="b"/><xsl:sequence select="$a is $b"/></xsl:function>`,
      },
    );
  });
});

describe("xsl:try", () => {
  it("does not catch the errors of variables declared outside", () => {
    checkBodies(
      [
        [
          '<xsl:variable name="q" select="1 div 0"/><out><xsl:try>{$q}<xsl:catch>caught</xsl:catch></xsl:try></out>',
          "FOAR0001",
        ],
        [
          '<out><xsl:try><xsl:variable name="q" select="1 div 0"/><xsl:try>{$q}<xsl:catch>inner</xsl:catch></xsl:try><xsl:catch>outer</xsl:catch></xsl:try></out>',
          "<out>outer</out>",
        ],
        [
          "<out><xsl:try>{$g}<xsl:catch>caught</xsl:catch></xsl:try></out>",
          "FOAR0001",
        ],
        [
          '<out><xsl:try><xsl:value-of select="1 div 0"/><xsl:catch>{$err:module} {$err:line-number}</xsl:catch></xsl:try></out>',
          "<out>file:///s/m.xsl 1</out>",
        ],
      ],
      {
        ...options,
        attributes:
          'expand-text="yes" xmlns:err="http://www.w3.org/2005/xqt-errors"',
        exclude: "err",
        declarations: '<xsl:variable name="g" select="1 div 0"/>',
        baseUri: "file:///s/m.xsl",
      },
    );
  });
});

describe("grouping", () => {
  it("uses composite keys", () => {
    checkBodies(
      [
        [
          '<xsl:for-each-group select="(1, 2), (1, 2), (2, 1)" group-adjacent="1" composite="yes">[{current-grouping-key()}]</xsl:for-each-group>',
          "[1]",
        ],
        [
          '<xsl:for-each-group select="doc/e" group-by="@a, @b" composite="yes">[{current-grouping-key()}:{count(current-group())}]</xsl:for-each-group>',
          "[x 1:2][x 2:1]",
        ],
        [
          '<xsl:for-each-group select="doc/e" group-adjacent="@a, @b" composite="yes">[{count(current-group())}]</xsl:for-each-group>',
          "[1][1][1]",
        ],
        [
          '<xsl:for-each-group select="1 to 3" group-by=". mod 2"><xsl:variable name="g" select="current-group#0"/>{$g()}</xsl:for-each-group>',
          "XTDE1061",
        ],
        [
          '<xsl:for-each-group select="1 to 3" group-by=". mod 2">{function() {current-grouping-key()}()}</xsl:for-each-group>',
          "XTDE1071",
        ],
      ],
      {
        ...options,
        xml: '<doc><e a="x" b="1"/><e a="x" b="2"/><e a="x" b="1"/></doc>',
      },
    );
  });
});

describe("template rules", () => {
  it("have no current rule after a change of focus", () => {
    checkBodies([['<xsl:apply-templates select="doc"/>', "XTDE0560"]], {
      ...options,
      declarations:
        '<xsl:template match="doc"><xsl:copy select="."><xsl:next-match/></xsl:copy></xsl:template>',
    });
    checkBodies([['<xsl:apply-templates select="doc"/>', "XTDE0560"]], {
      ...options,
      declarations:
        '<xsl:template match="doc"><xsl:call-template name="t"/></xsl:template><xsl:template name="t"><xsl:context-item use="absent"/><xsl:next-match/></xsl:template>',
    });
  });

  it("deep-skip processes the children of documents", () => {
    checkBodies([['<xsl:apply-templates select="/" mode="d"/>', "<e/>"]], {
      declarations:
        '<xsl:mode name="d" on-no-match="deep-skip"/><xsl:template match="doc" mode="d"><e/></xsl:template>',
    });
  });
});

describe("availability", () => {
  it("knows list constructors, catch and unparsed entities", () => {
    checkBodies(
      [
        [
          "<out>{function-available('xs:NMTOKENS', 1)} {element-available('xsl:catch')} {unparsed-entity-uri('e', /)}|</out>",
          "<out>true true |</out>",
        ],
        [
          "<out xmlns:x=\"http://www.w3.org/1999/XSL/Transform\">{element-available('value-of')}</out>",
          "<out>false</out>",
        ],
      ],
      options,
    );
    const xsl = stylesheet(
      `<xsl:template match="/"><out>{element-available('xsl:evaluate')} {system-property('xsl:supports-dynamic-evaluation')} <value-of xmlns="http://www.w3.org/1999/XSL/Transform" select="element-available('value-of')"/></out></xsl:template>`,
      options,
    );
    assert.equal(run(xsl), "<out>true yes true</out>");
    assert.equal(
      run(xsl, "<doc/>", { dynamicEvaluation: false }),
      "<out>false no true</out>",
    );
  });
});

describe("sources", () => {
  it("drop a source text node that is stripped", () => {
    const doc = parse('<a><b> </b><c xml:space="preserve"> </c></a>');
    const rules = [{ uri: null, local: null, strip: true }];
    const [b, c] = [...doc.documentElement.childNodes];
    assert.equal(isStrippedText(b.firstChild, rules), true);
    assert.equal(isStrippedText(c.firstChild, rules), false);
    assert.equal(isStrippedText(b, rules), false);
    assert.equal(
      isStrippedText(parse("<a>x</a>").documentElement.firstChild, rules),
      false,
    );
    const xsl = stylesheet(
      '<xsl:strip-space elements="*"/><xsl:template name="main"><out><xsl:try>{exists(.)}<xsl:catch>absent</xsl:catch></xsl:try></out></xsl:template>',
      options,
    );
    const compiled = transform(xsl, null, {
      initialTemplate: "main",
      source: b.firstChild,
    });
    assert.equal(compiled.principal.documentElement.textContent, "absent");
  });
});

describe("global variables and context items", () => {
  it("are checked", () => {
    assert.equal(
      errorCode(() =>
        run(
          stylesheet(
            '<xsl:global-context-item use="required" as="document-node( )"/><xsl:global-context-item use="optional"/><xsl:template match="/"/>',
          ),
        ),
      ),
      "XTSE3087",
    );
  });
});
