/**
 * Attribute value template tests (XSLT 1.0 section 7.6.2) and the AVT-valued
 * attributes of xsl:number (section 7.7).
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { evaluateAvt, parseAvt } from "./avt.js";
import { run, stylesheet } from "./harness.test.js";

describe("parseAvt", () => {
  it("splits literal text and expressions", () => {
    assert.deepStrictEqual(parseAvt("a{@b}c"), ["a", { expr: "@b" }, "c"]);
  });

  it("keeps braces inside string literals of an expression", () => {
    assert.deepStrictEqual(parseAvt("{'}'}"), [{ expr: "'}'" }]);
    assert.deepStrictEqual(parseAvt(`{concat("{", 'x')}`), [
      { expr: `concat("{", 'x')` },
    ]);
  });

  it("unescapes doubled braces and keeps a lone closing brace", () => {
    assert.deepStrictEqual(parseAvt("{{a}}b}"), ["{a}b}"]);
  });

  it("caches parsed templates", () => {
    assert.strictEqual(parseAvt("x{1}"), parseAvt("x{1}"));
  });

  it("rejects an unclosed expression", () => {
    assert.throws(() => parseAvt("a{'}"), /Unclosed expression/);
  });
});

describe("evaluateAvt", () => {
  it("returns plain values unchanged without parsing", () => {
    assert.strictEqual(
      evaluateAvt("plain", () => assert.fail("no expression")),
      "plain",
    );
  });

  it("evaluates every expression", () => {
    assert.strictEqual(
      evaluateAvt("{a}-{b}}}", (e) => e.toUpperCase()),
      "A-B}",
    );
  });
});

describe("attribute value templates in stylesheets", () => {
  const xml = (body) => stylesheet(body, "xml");

  it("handles braces inside string literals", () => {
    const xsl = xml(
      `<xsl:template match="/"><o c="{'}'}" d="{concat('{', 'x')}" e="{{{1+1}}}"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl), '<o c="}" d="{x" e="{2}"/>');
  });
});

describe("xsl:number attributes", () => {
  it("groups digits with grouping-separator and grouping-size", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><xsl:number value="1234567" grouping-separator="," grouping-size="3"/>|<xsl:number value="1234567" grouping-separator="{'.'}" grouping-size="{2}" format="001"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl), "1,234,567|1.23.45.67");
  });

  it("ignores grouping unless both attributes are valid", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><xsl:number value="12345" grouping-separator=","/>|<xsl:number value="12345" grouping-separator="," grouping-size="0"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl), "12345|12345");
  });

  it("evaluates format as an attribute value template", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><xsl:number value="3" format="{'a'}"/></xsl:template>`,
    );
    assert.strictEqual(run(xsl), "c");
  });
});
