/**
 * Tests for the checks run while compiling a stylesheet: invalid patterns
 * (XSLT 1.0 section 5.2), duplicate variable bindings (11.4, 11.5) and
 * undeclared excluded prefixes (7.1.1).
 */

import { describe, it, mock } from "node:test";
import assert from "node:assert";
import { compile, parseXML, run, stylesheet } from "./harness.test.js";
import { checkLocalBindings, xsltLocalName } from "./stylesheetChecks.js";

/**
 * Call a function, collecting console.warn messages.
 *
 * @param {() => *} action - The code to run
 * @returns {{result: *, warnings: string[]}} Its result and the warnings
 */
function warned(action) {
  const warn = mock.method(console, "warn", () => {});
  try {
    const result = action();
    return { result, warnings: warn.mock.calls.map((c) => c.arguments[0]) };
  } finally {
    warn.mock.restore();
  }
}

const INVALID_PATTERNS = [
  "a/..",
  "a/",
  "count(a)",
  "$x",
  "descendant::a",
  "a[",
  "a/self::b",
  "string(a)",
  "a|",
  "",
];

describe("invalid patterns", () => {
  for (const pattern of INVALID_PATTERNS) {
    it(`rejects xsl:template match="${pattern}" at import`, () => {
      const xsl = stylesheet(
        `<xsl:template match="${pattern}">M</xsl:template>`,
      );
      assert.throws(
        () => compile(xsl),
        (error) =>
          error.message.startsWith(
            `xsl:template match: Invalid pattern "${pattern}": `,
          ),
      );
    });
  }

  it("rejects an invalid xsl:key match", () => {
    const xsl = stylesheet('<xsl:key name="k" match="a/.." use="."/>');
    assert.throws(
      () => compile(xsl),
      /xsl:key match: Invalid pattern "a\/\.\."/,
    );
  });

  it("rejects invalid xsl:number count and from patterns anywhere", () => {
    const count = stylesheet(
      '<xsl:template match="/"><r><xsl:if test="false()"><xsl:number count="a/.."/></xsl:if></r></xsl:template>',
    );
    assert.throws(() => compile(count), /xsl:number count: Invalid pattern/);

    const from = stylesheet(
      '<xsl:variable name="v"><xsl:number from="$x"/></xsl:variable>',
    );
    assert.throws(
      () => compile(from),
      /xsl:number from: Invalid pattern "\$x"/,
    );
  });

  it("rejects invalid patterns of a simplified stylesheet", () => {
    const xsl =
      '<r xsl:version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:number count="a["/></r>';
    assert.throws(() => compile(xsl), /xsl:number count: Invalid pattern/);
  });

  it("rejects invalid patterns of an imported stylesheet", () => {
    const xsl = stylesheet('<xsl:import href="lib.xsl"/>');
    const imports = {
      "http://x/lib.xsl": stylesheet(
        '<xsl:template match="a/">x</xsl:template>',
      ),
    };
    assert.throws(
      () => compile(xsl, { imports }),
      /Failed to import stylesheet "lib.xsl": xsl:template match: Invalid pattern "a\/"/,
    );
  });

  it("accepts valid patterns", () => {
    const xsl = stylesheet(
      '<xsl:key name="k" match="e" use="@g"/><xsl:template match="/"><xsl:for-each select="//e"><xsl:number count="e|f" from="/"/></xsl:for-each></xsl:template><xsl:template match="key(\'k\',\'1\')//x | @*|node()">x</xsl:template><xsl:template name="n"/>',
    );
    assert.strictEqual(run(xsl, "<r><e g='1'/><e/></r>"), "12");
  });
});

describe("duplicate bindings", () => {
  const T = (body, attrs = 'match="/"') =>
    `<xsl:template ${attrs}>${body}</xsl:template>`;

  it("warns about two local variables of the same name, the later wins", () => {
    const xsl = stylesheet(
      T(
        '<xsl:variable name="x" select="1"/><xsl:variable name="x" select="2"/><xsl:value-of select="$x"/>',
      ),
    );
    const { result, warnings } = warned(() => run(xsl));
    assert.strictEqual(result, "2");
    assert.deepStrictEqual(warnings, [
      'XSLT: duplicate binding of variable $x in template match="/"; the later one is used (XSLT 1.0 section 11.5)',
    ]);
  });

  it("warns about a param and a variable of the same name", () => {
    const xsl = stylesheet(
      T(
        '<xsl:param name="p" select="1"/><xsl:variable name="p" select="2"/><xsl:value-of select="$p"/>',
        'name="t"',
      ) + T('<xsl:call-template name="t"/>'),
    );
    const { result, warnings } = warned(() => run(xsl));
    assert.strictEqual(result, "2");
    assert.match(warnings[0], /\$p in template name="t"/);
  });

  it("warns about a nested local shadowing another local", () => {
    const xsl = stylesheet(
      T(
        '<xsl:variable name="x" select="1"/><xsl:for-each select="/"><xsl:variable name="x" select="2"/><xsl:value-of select="$x"/></xsl:for-each><xsl:value-of select="$x"/>',
      ),
    );
    const { result, warnings } = warned(() => run(xsl));
    assert.strictEqual(result, "21");
    assert.strictEqual(warnings.length, 1);
  });

  it("stays silent for sibling scopes and locals shadowing globals", () => {
    const xsl = stylesheet(
      '<xsl:variable name="x" select="0"/><xsl:param name="g"/>' +
        T(
          '<xsl:variable name="g" select="$x"/><xsl:if test="1"><xsl:variable name="y" select="1"/><xsl:value-of select="$y"/></xsl:if><xsl:if test="1"><xsl:variable name="y" select="2"/><xsl:value-of select="$y"/></xsl:if><xsl:variable name="x" select="3"/><xsl:value-of select="$x"/>',
        ),
    );
    const { result, warnings } = warned(() => run(xsl));
    assert.strictEqual(result, "123");
    assert.deepStrictEqual(warnings, []);
  });

  it("does not put a variable in scope of its own content", () => {
    const xsl = stylesheet(
      T(
        '<xsl:variable name="x"><xsl:variable name="y" select="1"/><xsl:value-of select="$y"/></xsl:variable><xsl:variable name="y" select="2"/><xsl:value-of select="concat($x, $y)"/>',
      ),
    );
    const { result, warnings } = warned(() => run(xsl));
    assert.strictEqual(result, "12");
    assert.deepStrictEqual(warnings, []);
  });

  it("warns about global params clashing at the same import precedence", () => {
    const xsl = stylesheet(
      '<xsl:param name="p" select="1"/><xsl:param name="p" select="2"/><xsl:variable name="m" select="1"/><xsl:param name="m" select="2"/>' +
        T('<xsl:value-of select="concat($p, $m)"/>'),
    );
    const { result, warnings } = warned(() => run(xsl));
    assert.strictEqual(result, "21");
    assert.deepStrictEqual(warnings, [
      "XSLT: duplicate global binding of variable $p at the same import precedence; the later one is used (XSLT 1.0 section 11.4)",
      "XSLT: duplicate global binding of variable $m at the same import precedence; the xsl:variable is used (XSLT 1.0 section 11.4)",
    ]);
  });

  it("rejects two global variables of the same name and import precedence (libxslt reports/tst-1)", () => {
    const xsl = stylesheet(
      '<xsl:variable name="v" select="1"/><xsl:variable name="v" select="2"/>',
    );
    assert.throws(
      () => compile(xsl),
      /redefinition of global variable \$v at the same import precedence/,
    );
  });

  it("allows an imported global of the same name", () => {
    const xsl = stylesheet(
      '<xsl:import href="lib.xsl"/><xsl:variable name="v" select="2"/>' +
        T('<xsl:value-of select="$v"/>'),
    );
    const imports = {
      "http://x/lib.xsl": stylesheet('<xsl:variable name="v" select="1"/>'),
    };
    const { result, warnings } = warned(() => run(xsl, "<d/>", { imports }));
    assert.strictEqual(result, "2");
    assert.deepStrictEqual(warnings, []);
  });

  it("checks global variable content, attribute sets and simplified stylesheets", () => {
    const dup =
      '<xsl:variable name="a" select="1"/><xsl:variable name="a" select="2"/>';
    const xsl = stylesheet(
      `<xsl:variable name="g">${dup}</xsl:variable><xsl:attribute-set name="s"><xsl:attribute name="a">${dup}</xsl:attribute></xsl:attribute-set>`,
    );
    const { warnings } = warned(() => compile(xsl));
    assert.deepStrictEqual(warnings, [
      'XSLT: duplicate binding of variable $a in variable name="g"; the later one is used (XSLT 1.0 section 11.5)',
      'XSLT: duplicate binding of variable $a in attribute-set name="s"; the later one is used (XSLT 1.0 section 11.5)',
    ]);

    const simplified = `<r xsl:version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">${dup}</r>`;
    assert.match(warned(() => compile(simplified)).warnings[0], /\$a in r;/);
  });

  it("reports duplicates through a callback", () => {
    const template = parseXML(
      '<xsl:template xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:param name="a"/><xsl:param name="a"/></xsl:template>',
    ).documentElement;
    const messages = [];
    checkLocalBindings(template, (message) => messages.push(message));
    assert.deepStrictEqual(messages, [
      "duplicate binding of variable $a in template; the later one is used (XSLT 1.0 section 11.5)",
    ]);
  });
});

describe("top-level text", () => {
  it("rejects text among the top-level elements (libxslt reports/tst-2)", () => {
    const xsl = stylesheet(
      '\n  a not allowed top level element\n<xsl:template match="/"/>',
    );
    assert.throws(
      () => compile(xsl),
      /misplaced text at the top level of the stylesheet: "a not allowed top level element"/,
    );
  });

  it("accepts whitespace, comments and CDATA whitespace", () => {
    const xsl = stylesheet(
      '<!-- c --><![CDATA[ \t ]]>\n<xsl:template match="/">ok</xsl:template>',
    );
    assert.strictEqual(run(xsl), "ok");
  });
});

describe("xsltLocalName", () => {
  it("recognises XSLT elements by namespace or xsl: prefix", () => {
    const doc = parseXML(
      '<xsl:a xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><b/>t</xsl:a>',
    );
    assert.strictEqual(xsltLocalName(doc.documentElement), "a");
    assert.strictEqual(xsltLocalName(doc.documentElement.firstChild), null);
    assert.strictEqual(xsltLocalName(doc.documentElement.lastChild), null);
    assert.strictEqual(xsltLocalName({ nodeType: 1, nodeName: "xsl:c" }), "c");
  });
});

describe("undeclared excluded prefixes", () => {
  it("warns once and ignores the prefix", () => {
    const xsl = stylesheet(
      '<xsl:template match="/"><r><s/></r></xsl:template>',
      "xml",
      'xmlns:p="urn:p" exclude-result-prefixes="p zz #all" extension-element-prefixes="#default"',
    );
    const { result, warnings } = warned(() => run(xsl));
    assert.strictEqual(result, "<r><s/></r>");
    assert.deepStrictEqual(warnings, [
      'XSLT: exclude-result-prefixes: undefined namespace prefix "zz" is ignored',
      'XSLT: exclude-result-prefixes: undefined namespace prefix "#all" is ignored',
      'XSLT: extension-element-prefixes: undefined namespace prefix "#default" is ignored',
    ]);
  });

  it("accepts the always declared xml prefix", () => {
    const xsl = stylesheet(
      '<xsl:template match="/"><r xsl:exclude-result-prefixes="xml"/></xsl:template>',
      "xml",
    );
    const { result, warnings } = warned(() => run(xsl));
    assert.strictEqual(result, "<r/>");
    assert.deepStrictEqual(warnings, []);
  });
});
