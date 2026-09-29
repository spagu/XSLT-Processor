/**
 * Tests for names computed by xsl:element and xsl:attribute
 * (XSLT 1.0 sections 7.1.2 and 7.1.3) and the XML name productions.
 */

import { describe, it, mock } from "node:test";
import assert from "node:assert";
import { run, stylesheet } from "./harness.test.js";
import { isNcName, isQName } from "./qname.js";
import { computedAttributeName, computedElementName } from "./computedNames.js";

/**
 * Run a stylesheet, collecting console.warn messages.
 *
 * @param {string} xsl - A complete stylesheet
 * @returns {{output: string, warnings: string[]}} Result and warnings
 */
function runWarned(xsl) {
  const warn = mock.method(console, "warn", () => {});
  try {
    const output = run(xsl);
    return { output, warnings: warn.mock.calls.map((c) => c.arguments[0]) };
  } finally {
    warn.mock.restore();
  }
}

const xml = (template) =>
  stylesheet(`<xsl:template match="/">${template}</xsl:template>`, "xml");

describe("XML names", () => {
  it("accepts NCNames with the XML 1.0 fifth edition characters", () => {
    for (const name of ["a", "_a", "é1", "a-b.c", "a·b", "\u{10000}x"]) {
      assert.ok(isNcName(name), name);
    }
  });

  it("rejects strings that are not NCNames", () => {
    for (const name of ["", "1a", "-a", ".a", "a:b", "a b", "x{", "a'b"]) {
      assert.ok(!isNcName(name), name);
    }
  });

  it("accepts QNames with at most one prefix", () => {
    assert.ok(isQName("p:a"));
    assert.ok(isQName("a"));
    assert.ok(!isQName("a:b:c"));
    assert.ok(!isQName(":a"));
    assert.ok(!isQName("a:"));
  });
});

describe("computed names", () => {
  const scope = { p: "urn:p", "": "urn:d" };

  it("resolves valid element names", () => {
    assert.deepStrictEqual(computedElementName("p:e", null, scope).name, {
      namespaceUri: "urn:p",
      qname: "p:e",
    });
    assert.deepStrictEqual(computedElementName("e", null, scope).name, {
      namespaceUri: "urn:d",
      qname: "e",
    });
  });

  it("drops the prefix of an element in no namespace", () => {
    assert.deepStrictEqual(computedElementName("p:e", "", scope).name, {
      namespaceUri: null,
      qname: "e",
    });
  });

  it("accepts an undeclared prefix when a namespace is given", () => {
    assert.deepStrictEqual(computedElementName("z:e", "urn:z", {}).name, {
      namespaceUri: "urn:z",
      qname: "z:e",
    });
    assert.deepStrictEqual(computedAttributeName("z:a", "urn:z", {}).name, {
      namespaceUri: "urn:z",
      qname: "z:a",
    });
  });

  it("reports invalid names and undeclared prefixes", () => {
    assert.match(computedElementName("x{", null, {}).error, /not a valid/);
    assert.match(computedElementName("z:e", null, {}).error, /prefix "z"/);
    assert.match(computedAttributeName("1a", null, {}).error, /not a valid/);
    assert.match(computedAttributeName("z:a", null, {}).error, /prefix "z"/);
  });

  it("rejects xmlns as an attribute name", () => {
    assert.match(computedAttributeName("xmlns", null, {}).error, /7\.1\.3/);
    assert.match(
      computedAttributeName("xmlns:a", "urn:a", {}).error,
      /7\.1\.3/,
    );
  });
});

describe("xsl:element and xsl:attribute with invalid names", () => {
  for (const name of ["x{", "1a", "-a", "a'b", "a:b:c", ""]) {
    it(`skips an element named "${name}" and its content`, () => {
      const { output, warnings } = runWarned(
        xml(
          `<r><xsl:element name="{&quot;${name}&quot;}"><c/>t</xsl:element></r>`,
        ),
      );
      assert.strictEqual(output, "<r/>");
      assert.strictEqual(warnings.length, 1);
      assert.match(warnings[0], /xsl:element: .* not a valid element name/);
    });

    it(`skips an attribute named "${name}"`, () => {
      const { output, warnings } = runWarned(
        xml(
          `<r><xsl:attribute name="{&quot;${name}&quot;}">1</xsl:attribute></r>`,
        ),
      );
      assert.strictEqual(output, "<r/>");
      assert.match(warnings[0], /xsl:attribute: .* not a valid attribute/);
    });
  }

  it("skips names with an undeclared prefix", () => {
    const { output, warnings } = runWarned(
      xml(
        '<r><xsl:attribute name="yy:a">1</xsl:attribute><xsl:element name="zz:e"/></r>',
      ),
    );
    assert.strictEqual(output, "<r/>");
    assert.strictEqual(warnings.length, 2);
    assert.match(warnings[0], /undefined namespace prefix "yy"/);
    assert.match(warnings[1], /undefined namespace prefix "zz"/);
  });

  it("rejects xmlns and xmlns:* attributes", () => {
    const { output, warnings } = runWarned(
      xml(
        '<r><xsl:attribute name="xmlns">u</xsl:attribute><xsl:attribute name="xmlns:q" namespace="urn:q">u</xsl:attribute></r>',
      ),
    );
    assert.strictEqual(output, "<r/>");
    assert.strictEqual(warnings.length, 2);
  });

  it("reports the same error once per engine", () => {
    const { output, warnings } = runWarned(
      xml(
        '<r><xsl:for-each select="(/|/)"><xsl:element name="1a"/><xsl:element name="1a"/></xsl:for-each></r>',
      ),
    );
    assert.strictEqual(output, "<r/>");
    assert.strictEqual(warnings.length, 1);
  });

  it("creates an element in no namespace without its prefix", () => {
    const { output, warnings } = runWarned(
      stylesheet(
        '<xsl:template match="/"><xsl:element name="p:e" namespace=""/></xsl:template>',
        "xml",
        'xmlns:p="urn:p"',
      ),
    );
    assert.strictEqual(output, "<e/>");
    assert.deepStrictEqual(warnings, []);
  });
});
