/**
 * Named top-level objects keyed by expanded name (XSLT 1.0 section 2.4):
 * named templates (6), attribute sets (7.1.4) and decimal formats (12.3),
 * with the libxslt conformance cases they come from.
 */

import { describe, it, mock } from "node:test";
import assert from "node:assert";
import { compile, parseXML, run, stylesheet } from "./harness.test.js";
import {
  expandName,
  requireExpandedName,
  requireExpandedNames,
} from "./declarationNames.js";
import { applyAttributeSets } from "./attributeSets.js";

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

const ROOT = '<xsl:template match="/">';

describe("declaration names", () => {
  const element = parseXML(
    '<e xmlns:p="urn:p" xmlns="urn:default"/>',
  ).documentElement;

  it("expands prefixed names and ignores the default namespace", () => {
    assert.deepStrictEqual(expandName("p:f", element), { key: "{urn:p}f" });
    assert.deepStrictEqual(expandName("f", element), { key: "f" });
  });

  it("reports invalid names and undeclared prefixes", () => {
    assert.deepStrictEqual(expandName("p:0f", element), {
      error: 'invalid QName "p:0f"',
    });
    assert.deepStrictEqual(expandName("q:f", element), {
      error: 'undeclared namespace prefix "q" in "q:f"',
    });
    assert.throws(
      () => requireExpandedName("q:f", element, "where"),
      /^Error: where: undeclared namespace prefix "q"/,
    );
  });

  it("expands name lists", () => {
    assert.deepStrictEqual(requireExpandedNames(" p:a\tb ", element, "w"), [
      "{urn:p}a",
      "b",
    ]);
    assert.deepStrictEqual(requireExpandedNames(null, element, "w"), []);
  });
});

describe("named templates", () => {
  it("rejects two templates of the same name and precedence (REC/test-6.1)", () => {
    const xsl = stylesheet(
      '<xsl:template name="t">1</xsl:template><xsl:template name="t">2</xsl:template>',
    );
    assert.throws(() => compile(xsl), /duplicate template name "t"/);
  });

  it("compares expanded names", () => {
    const xsl = stylesheet(
      `<xsl:template name="a:t" xmlns:a="urn:x">A</xsl:template>${ROOT}<xsl:call-template name="b:t" xmlns:b="urn:x"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl), "A");
    const clash = stylesheet(
      '<xsl:template name="a:t" xmlns:a="urn:x"/><xsl:template name="b:t" xmlns:b="urn:x"/>',
    );
    assert.throws(() => compile(clash), /duplicate template name "b:t"/);
  });

  it("lets an importing stylesheet override a named template", () => {
    const xsl = stylesheet(
      `<xsl:import href="lib.xsl"/><xsl:template name="t">main</xsl:template>${ROOT}<xsl:call-template name="t"/></xsl:template>`,
    );
    const imports = {
      "http://x/lib.xsl": stylesheet(
        '<xsl:template name="t">lib</xsl:template>',
      ),
    };
    assert.strictEqual(run(xsl, "<d/>", { imports }), "main");
  });

  it("rejects xsl:call-template without a name", () => {
    const xsl = stylesheet(`${ROOT}<xsl:call-template/></xsl:template>`);
    assert.throws(() => run(xsl), /xsl:call-template name: invalid QName ""/);
  });

  it("rejects an undeclared prefix in a template name", () => {
    assert.throws(
      () => compile(stylesheet('<xsl:template name="q:t"/>')),
      /xsl:template name: undeclared namespace prefix "q"/,
    );
  });
});

describe("attribute sets", () => {
  const XML_OUT = (body) => stylesheet(body, "xml");

  it("merges sets of the same name (general/bug-189)", () => {
    const xsl = XML_OUT(
      `${ROOT}<e xsl:use-attribute-sets="s"/></xsl:template>` +
        '<xsl:attribute-set name="s"><xsl:attribute name="a">1</xsl:attribute><xsl:attribute name="b">1</xsl:attribute></xsl:attribute-set>' +
        '<xsl:attribute-set name="s"><xsl:attribute name="b">2</xsl:attribute></xsl:attribute-set>',
    );
    assert.strictEqual(run(xsl), '<e a="1" b="2"/>');
  });

  it("merges imported sets, the importing one winning (general/bug-131)", () => {
    const xsl = XML_OUT(
      `<xsl:import href="lib.xsl"/><xsl:attribute-set name="s"><xsl:attribute name="size">8</xsl:attribute></xsl:attribute-set>${ROOT}<e xsl:use-attribute-sets="s"/></xsl:template>`,
    );
    const imports = {
      "http://x/lib.xsl": stylesheet(
        '<xsl:attribute-set name="s"><xsl:attribute name="size">14</xsl:attribute><xsl:attribute name="weight">bold</xsl:attribute></xsl:attribute-set>',
      ),
    };
    assert.strictEqual(
      run(xsl, "<d/>", { imports }),
      '<e size="8" weight="bold"/>',
    );
  });

  it("finds a set by expanded name (general/bug-190)", () => {
    const xsl = XML_OUT(
      `<xsl:attribute-set name="a:s" xmlns:a="urn:x"><xsl:attribute name="v">1</xsl:attribute></xsl:attribute-set>${ROOT}<xsl:element name="e" use-attribute-sets="b:s" xmlns:b="urn:x"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl), '<e v="1"/>');
  });

  it("applies used sets before the own attributes", () => {
    const xsl = XML_OUT(
      '<xsl:attribute-set name="base"><xsl:attribute name="a">base</xsl:attribute><xsl:attribute name="b">base</xsl:attribute></xsl:attribute-set>' +
        '<xsl:attribute-set name="s" use-attribute-sets="base"><xsl:attribute name="a">own</xsl:attribute></xsl:attribute-set>' +
        `${ROOT}<e xsl:use-attribute-sets="s"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl), '<e a="own" b="base"/>');
  });

  it("rejects a set using itself", () => {
    const xsl = XML_OUT(
      '<xsl:attribute-set name="a" use-attribute-sets="b"/><xsl:attribute-set name="b" use-attribute-sets="a"/>' +
        `${ROOT}<e xsl:use-attribute-sets="a"/></xsl:template>`,
    );
    assert.throws(() => run(xsl), /xsl:attribute-set a uses itself/);
  });

  it("ignores unknown sets and applies a shared set twice", () => {
    const applied = [];
    const sets = {
      a: [{ node: "A", uses: ["c"], importPrecedence: 0 }],
      b: [{ node: "B", uses: ["c"], importPrecedence: 0 }],
      c: [{ node: "C", uses: [], importPrecedence: 0 }],
    };
    applyAttributeSets(sets, ["a", "b", "zz"], (node) => applied.push(node));
    assert.deepStrictEqual(applied, ["C", "A", "C", "B"]);
  });

  it("rejects an attribute set without a name", () => {
    assert.throws(
      () => compile(stylesheet("<xsl:attribute-set/>")),
      /xsl:attribute-set name: invalid QName ""/,
    );
  });

  it("rejects an invalid attribute set name", () => {
    assert.throws(
      () => compile(stylesheet('<xsl:attribute-set name="1s"/>')),
      /xsl:attribute-set name: invalid QName "1s"/,
    );
  });
});

describe("decimal formats", () => {
  const FORMAT = (name) =>
    `${ROOT}<xsl:value-of select="format-number(123, '0,00', '${name}')"/></xsl:template>`;

  it("finds a format by expanded name (general/bug-205)", () => {
    const xsl = stylesheet(
      '<xsl:decimal-format xmlns:t="urn:1" name="t:f" decimal-separator=","/>' +
        '<xsl:decimal-format xmlns:t="urn:2" name="t:f" decimal-separator="."/>' +
        FORMAT("n:f").replace("<xsl:template", '<xsl:template xmlns:n="urn:1"'),
    );
    assert.strictEqual(run(xsl), "123,00");
  });

  it("keeps the first of two formats of the same name, with a warning (general/bug-204)", () => {
    const xsl = stylesheet(
      '<xsl:decimal-format xmlns:a="urn:1" name="a:f" decimal-separator=","/>' +
        '<xsl:decimal-format xmlns:b="urn:1" name="b:f" decimal-separator="."/>' +
        FORMAT("a:f").replace("<xsl:template", '<xsl:template xmlns:a="urn:1"'),
    );
    const { result, warnings } = warned(() => run(xsl));
    assert.strictEqual(result, "123,00");
    assert.deepStrictEqual(warnings, [
      'XSLT: xsl:decimal-format: "b:f" is already declared; the first declaration is used',
    ]);
  });

  it("lets an importing stylesheet replace an imported format", () => {
    const xsl = stylesheet(
      `<xsl:import href="lib.xsl"/><xsl:decimal-format name="f" decimal-separator=","/>${FORMAT("f")}`,
    );
    const imports = {
      "http://x/lib.xsl": stylesheet(
        '<xsl:decimal-format name="f" decimal-separator="."/>',
      ),
    };
    assert.strictEqual(run(xsl, "<d/>", { imports }), "123,00");
  });

  it("ignores a format with an invalid name or undeclared prefix, with a warning (general/bug-202, bug-203)", () => {
    const xsl = stylesheet(
      '<xsl:decimal-format xmlns:t="urn:1" name="t:0f"/><xsl:decimal-format name="u:f"/>',
    );
    const { warnings } = warned(() => compile(xsl));
    assert.deepStrictEqual(warnings, [
      'XSLT: xsl:decimal-format: invalid QName "t:0f"; the declaration is ignored',
      'XSLT: xsl:decimal-format: undeclared namespace prefix "u" in "u:f"; the declaration is ignored',
    ]);
  });

  it("rejects an undeclared prefix in format-number()", () => {
    assert.throws(
      () => run(stylesheet(FORMAT("u:f"))),
      /undeclared namespace prefix "u"/,
    );
  });
});
