/**
 * Tests for helpers of the engine modules that the end-to-end suites reach
 * only partly.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { selectNodes } from "./controlFlow.js";
import { splitUnionPattern } from "./templateRules.js";
import { run, stylesheet } from "../harness.test.js";
import { XsltEngine } from "../engine.js";

describe("selectNodes", () => {
  const engineReturning = (value) => ({ evaluateXPath: () => value });

  it("keeps a node list", () => {
    const nodes = [{}, {}];
    assert.strictEqual(selectNodes(engineReturning(nodes), "*", {}), nodes);
  });

  it("wraps a single value and drops an empty one", () => {
    assert.deepStrictEqual(selectNodes(engineReturning("x"), "'x'", {}), ["x"]);
    assert.deepStrictEqual(selectNodes(engineReturning(""), "''", {}), []);
  });
});

describe("splitUnionPattern", () => {
  it("splits on top-level bars only", () => {
    assert.deepStrictEqual(splitUnionPattern("a | b[c|d] | e['|']"), [
      "a ",
      " b[c|d] ",
      " e['|']",
    ]);
  });

  it("keeps empty inner alternatives and drops a trailing empty one", () => {
    assert.deepStrictEqual(splitUnionPattern("a||b|"), ["a", "", "b"]);
    assert.deepStrictEqual(splitUnionPattern('x["a]|b"]'), ['x["a]|b"]']);
    assert.deepStrictEqual(splitUnionPattern(""), []);
  });
});

describe("instruction edge cases", () => {
  it("xsl:text ignores comments among its text", () => {
    const xsl = stylesheet(
      '<xsl:template match="/"><xsl:text>a<!--c-->b</xsl:text></xsl:template>',
    );
    assert.strictEqual(run(xsl), "ab");
  });

  it("xsl:apply-imports without a current template applies the built-in rules", () => {
    const xsl = stylesheet(
      '<xsl:variable name="v"><xsl:apply-imports/></xsl:variable>' +
        '<xsl:template match="/">[<xsl:value-of select="$v"/>]</xsl:template>',
    );
    assert.strictEqual(run(xsl, "<d>hi</d>"), "[hi]");
  });

  it("clearing an unknown parameter is a no-op", () => {
    const engine = new XsltEngine();
    engine.clearParameterValue("missing");
    assert.deepStrictEqual(engine.globalParameters, {});
  });
});

describe("xsl:number count patterns", () => {
  it("numbers without the memo when count refers to a variable", () => {
    const xsl = stylesheet(
      '<xsl:variable name="k" select="\'b\'"/>' +
        '<xsl:template match="/"><xsl:for-each select="//i[@k=$k]">' +
        '<xsl:number count="i[@k=$k]"/>,</xsl:for-each></xsl:template>',
    );
    const xml = '<d><i k="a"/><i k="b"/><i k="a"/><i k="b"/><i k="b"/></d>';
    assert.strictEqual(run(xsl, xml), "1,2,3,");
  });
});
