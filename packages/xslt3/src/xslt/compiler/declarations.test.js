import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileStylesheet } from "../api.js";
import { errorCode, parse, run, stylesheet } from "../testing.test.js";

/**
 * Runs declarations with a template for "/" that has a given body.
 * @param {string} declarations
 * @param {string} body
 * @param {object} [options] - `version`, `attributes`, transform options
 * @returns {string}
 */
const runWith = (declarations, body, options = {}) =>
  run(
    stylesheet(
      `${declarations}<xsl:template match="/">${body}</xsl:template>`,
      {
        version: options.version,
        attributes: `expand-text="yes" xmlns:f="urn:f" ${options.attributes ?? ""}`,
        exclude: "f",
      },
    ),
    options.xml ?? "<doc><a k='1'>x</a><a k='2'>y</a><a k='1'>z</a></doc>",
    options,
  );

/**
 * Asserts error codes of declaration sets.
 * @param {Array<[string, string, string?]>} cases - Declarations, code, body
 * @param {object} [options]
 */
const checkErrors = (cases, options) => {
  for (const [declarations, code, body = "<out/>"] of cases) {
    assert.equal(
      errorCode(() => runWith(declarations, body, options)),
      code,
      declarations,
    );
  }
};

describe("global variables and parameters", () => {
  it("are evaluated on first use, in any order", () => {
    assert.equal(
      runWith(
        '<xsl:variable name="a" select="$b + 1"/><xsl:variable name="b" select="1"/><xsl:param name="p" as="xs:integer" select="3"/>',
        "<out>{$a}{$p}</out>",
        { params: { p: 7n } },
      ),
      "<out>27</out>",
    );
  });

  it("are checked", () => {
    checkErrors([
      ['<xsl:param name="p" required="yes"/>', "XTDE0050"],
      ['<xsl:variable name="a" select="$a"/>', "XTDE0640", "<out>{$a}</out>"],
      ['<xsl:variable name="a"/><xsl:variable name="a"/>', "XTSE0630"],
      ['<xsl:variable name="a" required="yes"/>', "XTSE0090"],
      ['<xsl:param name="a" tunnel="yes"/>', "XTSE0020"],
      ['<xsl:param name="p" as="xs:integer"/>', "XTTE0590", "<out>{$p}</out>"],
    ]);
    assert.equal(
      runWith('<xsl:param name="a" tunnel="no"/>', "<out>[{$a}]</out>"),
      "<out>[]</out>",
    );
  });
});

describe("stylesheet functions", () => {
  it("are called from XPath", () => {
    const declarations =
      '<xsl:function name="f:fact" as="xs:integer"><xsl:param name="n" as="xs:integer"/>' +
      '<xsl:sequence select="if ($n le 1) then 1 else $n * f:fact($n - 1)"/></xsl:function>' +
      '<xsl:function name="f:nodes"><a/><xsl:value-of select="1"/></xsl:function>';
    assert.equal(
      runWith(
        declarations,
        "<out>{f:fact(5)} {count(f:nodes())} {function-available('f:fact', 1)}</out>",
      ),
      "<out>120 2 true</out>",
    );
  });

  it("are checked", () => {
    checkErrors([
      ['<xsl:function name="g"/>', "XTSE0740"],
      ['<xsl:function name="1x"/>', "XTSE0020"],
      ["<xsl:function/>", "XTSE0010"],
      ['<xsl:function name="xs:f"/>', "XTSE0080"],
      ['<xsl:function name="f:f"/><xsl:function name="f:f"/>', "XTSE0770"],
      ['<xsl:function name="f:f" override="maybe"/>', "XTSE0020"],
      [
        '<xsl:function name="f:f"><xsl:param name="a" select="1"/></xsl:function>',
        "XTSE0760",
      ],
      [
        '<xsl:function name="f:f" as="xs:integer">x</xsl:function>',
        "XTTE0780",
        "<out>{f:f()}</out>",
      ],
      [
        '<xsl:function name="f:f"><xsl:param name="a" as="xs:integer"/></xsl:function>',
        "XPTY0004",
        "<out>{f:f('x')}</out>",
      ],
      [
        '<xsl:function name="f:f"><xsl:sequence select="current()"/></xsl:function>',
        "XPDY0002",
        "<out>{f:f()}</out>",
      ],
      [
        '<xsl:function name="f:f"><xsl:copy/></xsl:function>',
        "XTTE0945",
        "<out>{f:f()}</out>",
      ],
      [
        '<xsl:function name="f:f"><xsl:result-document/></xsl:function>',
        "XTDE1480",
        "<out>{f:f()}</out>",
      ],
    ]);
  });
});

describe("keys", () => {
  it("index nodes by values", () => {
    const declarations =
      '<xsl:key name="k" match="a" use="@k"/><xsl:key name="k" match="b" use="@k"/>' +
      '<xsl:key name="n" match="a"><xsl:sequence select="string-length(.)"/></xsl:key>' +
      '<xsl:key name="c" match="a" use="." collation="http://www.w3.org/2005/xpath-functions/collation/html-ascii-case-insensitive"/>';
    assert.equal(
      runWith(
        declarations,
        "<out>{key('k', '1')} {key('k', ('2', 1))} {count(key('n', 1))} {key('c', 'X')} {key('k', '1', /doc/a[3])} {count(key('k', xs:double('NaN')))}</out>",
      ),
      "<out>x z y 3 x z 0</out>",
    );
  });

  it("are checked", () => {
    checkErrors([
      ['<xsl:key name="k" match="a" use="1">x</xsl:key>', "XTSE1205"],
      ['<xsl:key name="k" match="a"/>', "XTSE1205"],
      [
        '<xsl:key name="k" match="a" use="1"/><xsl:key name="k" match="b" use="1" collation="http://www.w3.org/2005/xpath-functions/collation/html-ascii-case-insensitive"/>',
        "XTSE1220",
      ],
      ["", "XTDE1260", "<out>{key('none', 1)}</out>"],
      [
        '<xsl:key name="k" match="a" use="1"/>',
        "XPTY0004",
        "<out>{key('k', 1, 1)}</out>",
      ],
      [
        '<xsl:key name="k" match="a" use="1"/>',
        "XTDE1270",
        "<xsl:variable name='e' as='element()'><e/></xsl:variable><out>{$e/key('k', 1)}</out>",
      ],
      [
        '<xsl:key name="k" match="a" use="1"/>',
        "XTDE1270",
        "<out>{(1)!key('k', 1)}</out>",
      ],
      [
        '<xsl:key name="k" match="a[key(\'k\', 1)]" use="1"/>',
        "XTDE0640",
        "<out>{key('k', 1)}</out>",
      ],
    ]);
  });

  it("compare strings in backwards-compatible mode", () => {
    assert.equal(
      runWith(
        '<xsl:key name="k" match="a" use="@k"/>',
        "<out><xsl:value-of select=\"count(key('k', 1))\"/></out>",
        { version: "1.0" },
      ),
      "<out>2</out>",
    );
  });
});

describe("output declarations", () => {
  it("are merged by name and precedence", () => {
    const compiled = compileStylesheet(
      parse(
        stylesheet(
          '<xsl:output method="xml" cdata-section-elements="a"/><xsl:output indent="yes" cdata-section-elements="b" use-character-maps="m"/>' +
            '<xsl:output name="t" method="f:custom" xmlns:f="urn:f"/>' +
            '<xsl:character-map name="m" use-character-maps="n"><xsl:output-character character="x" string="y"/></xsl:character-map>' +
            '<xsl:character-map name="n"><xsl:output-character character="x" string="z"/><xsl:output-character character="w" string="v"/></xsl:character-map>',
        ),
      ),
    );
    assert.deepEqual(compiled.output, {
      method: "xml",
      indent: "yes",
      "cdata-section-elements": ["{}a", "{}b"],
      "use-character-maps": new Map([
        ["x", "y"],
        ["w", "v"],
      ]),
    });
    assert.equal(compiled.outputs.get("{}t").method, "{urn:f}custom");
    assert.deepEqual(compileStylesheet(parse(stylesheet(""))).output, {});
  });

  it("are checked", () => {
    checkErrors([
      ['<xsl:output method="xml"/><xsl:output method="text"/>', "XTSE1560"],
      ["<xsl:output><b/></xsl:output>", "XTSE0260"],
      ['<xsl:character-map name="m"><b/></xsl:character-map>', "XTSE0010"],
      [
        '<xsl:character-map name="m"><xsl:output-character character="ab" string="c"/></xsl:character-map>',
        "XTSE0020",
      ],
    ]);
    for (const [declarations, code] of [
      ['<xsl:output use-character-maps="none"/>', "XTSE1590"],
      [
        '<xsl:output use-character-maps="m"/><xsl:character-map name="m" use-character-maps="m"/>',
        "XTSE1600",
      ],
    ]) {
      assert.equal(
        errorCode(() => compileStylesheet(parse(stylesheet(declarations)))),
        code,
      );
    }
  });
});

describe("decimal formats", () => {
  it("are used by format-number", () => {
    assert.equal(
      runWith(
        '<xsl:decimal-format decimal-separator="," grouping-separator="."/><xsl:decimal-format name="f:d" NaN="none"/>',
        "<out>{format-number(1234.5, '#.##0,0')} {format-number(number('x'), '0', 'f:d')}</out>",
      ),
      "<out>1.234,5 none</out>",
    );
    checkErrors([
      [
        '<xsl:decimal-format NaN="a"/><xsl:decimal-format NaN="b"/>',
        "XTSE1290",
      ],
      ['<xsl:decimal-format decimal-separator="ab"/>', "XTSE0020"],
      ['<xsl:decimal-format zero-digit="1"/>', "XTSE1295"],
      ['<xsl:decimal-format zero-digit="a"/>', "XTSE1295"],
      ['<xsl:decimal-format percent="."/>', "XTSE1300"],
      ['<xsl:decimal-format digit="5"/>', "XTSE1300"],
    ]);
    assert.equal(
      runWith(
        '<xsl:decimal-format zero-digit="&#x1D7D8;"/>',
        "<out>{format-number(12, '&#x1D7D8;&#x1D7D8;')}</out>",
      ),
      "<out>\u{1D7D9}\u{1D7DA}</out>",
    );
  });

  it("are overridden by higher precedence despite conflicts", () => {
    const xsl = (body) =>
      `<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">${body}</xsl:stylesheet>`;
    assert.equal(
      run(
        xsl(
          '<xsl:import href="low.xsl"/><xsl:decimal-format NaN="c"/><xsl:template match="/">{format-number(number("x"), "0")}</xsl:template>',
        ).replace("<xsl:stylesheet", '<xsl:stylesheet expand-text="yes"'),
        "<doc/>",
        {
          baseUri: "file:///m/main.xsl",
          loadStylesheet: () =>
            xsl('<xsl:decimal-format NaN="a"/><xsl:decimal-format NaN="b"/>'),
        },
      ),
      "c",
    );
  });
});

describe("reserved names and output methods", () => {
  it("are checked", () => {
    checkErrors(
      [
        ['<xsl:variable name="xs:v"/>', "XTSE0080"],
        ['<xsl:template name="xsl:t"/>', "XTSE0080"],
        ['<xsl:template name="xsl:initial-template"/>', ""],
        ['<xsl:output method="bad"/>', "XTSE1570"],
        [
          '<xsl:character-map name="m"/><xsl:character-map name="m"/>',
          "XTSE1580",
        ],
      ].filter(([, code]) => code),
    );
    assert.equal(
      runWith(
        '<xsl:output method="f:mine"/><xsl:output name="h" method="html"/>',
        "<out/>",
      ),
      "<out/>",
    );
    checkErrors([
      ["", "XTSE0080", '<xsl:call-template name="xsl:t"/>'],
      [
        "",
        "XTDE0835",
        '<xsl:element name="e" namespace="http://www.w3.org/2000/xmlns/"/>',
      ],
      ["", "XTDE0835", '<xsl:element name="xml:e" namespace="urn:x"/>'],
      [
        "",
        "XTDE0865",
        '<out><xsl:attribute name="a" namespace="http://www.w3.org/2000/xmlns/"/></out>',
      ],
    ]);
  });
});
