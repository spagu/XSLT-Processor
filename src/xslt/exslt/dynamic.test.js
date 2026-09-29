/**
 * EXSLT dynamic module tests: `dyn:evaluate()` is opt-in, and once enabled
 * behaves as libexslt `dynamic.c`.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { XSLTProcessor } from "../../XSLTProcessor.js";
import { parseXML, stylesheet } from "../harness.test.js";
import {
  EXSLT_PREFIXES,
  assertValues,
  runTemplate,
  valueOf,
} from "./exsltHarness.test.js";

const ENABLED = {
  xml: "<r><n>1</n><n>2</n><e>count(//n)</e></r>",
  configure: (engine) => {
    engine.enableDynamicEvaluate = true;
  },
};

describe("dyn:evaluate() disabled (default)", () => {
  it("should not be reported by function-available()", () => {
    assert.strictEqual(valueOf("function-available('dyn:evaluate')"), "false");
  });

  it("should refuse to evaluate", () => {
    assert.throws(
      () => valueOf("dyn:evaluate('1')"),
      /dyn:evaluate\(\) is disabled/,
    );
  });

  it("should stay disabled for values other than true", () => {
    assert.throws(
      () =>
        valueOf("dyn:evaluate('1')", {
          configure: (engine) => {
            engine.enableDynamicEvaluate = "yes";
          },
        }),
      /disabled/,
    );
  });
});

describe("dyn:evaluate() enabled", () => {
  it("should evaluate expressions in the current context", () => {
    assertValues(
      [
        ["function-available('dyn:evaluate')", "true"],
        ["dyn:evaluate('1 + 2')", "3"],
        ["dyn:evaluate('//n[2]')", "2"],
        ["dyn:evaluate(/r/e)", "2"],
        ["dyn:evaluate('math:abs(-3)')", "3"],
        ["count(dyn:evaluate(''))", "0"],
        ["count(dyn:evaluate('1 +'))", "0"],
        ["count(dyn:evaluate('//n'))", "2"],
      ],
      ENABLED,
    );
  });

  it("should see variables and the context node", () => {
    const out = runTemplate(
      `<xsl:variable name="x" select="5"/><xsl:value-of select="dyn:evaluate('$x * 2')"/>` +
        `<xsl:for-each select="//n">,<xsl:value-of select="dyn:evaluate('. * 10 + position()')"/></xsl:for-each>`,
      ENABLED,
    );
    assert.strictEqual(out, "10,11,22");
  });

  it("should propagate evaluation errors and check the arity", () => {
    assert.throws(
      () => valueOf("dyn:evaluate('$undefined')", ENABLED),
      /Undefined variable/,
    );
    assert.throws(
      () => valueOf("dyn:evaluate()", ENABLED),
      /dyn:evaluate\(\) expects 1/,
    );
  });
});

describe("dyn:evaluate() through XSLTProcessor", () => {
  it("should be enabled on the engine after importStylesheet()", () => {
    const processor = new XSLTProcessor();
    const template =
      `<xsl:template match="/"><xsl:choose>` +
      `<xsl:when test="function-available('dyn:evaluate')"><xsl:value-of select="dyn:evaluate('1 + 1')"/></xsl:when>` +
      `<xsl:otherwise>off</xsl:otherwise></xsl:choose></xsl:template>`;
    processor.importStylesheet(
      parseXML(stylesheet(template, "text", EXSLT_PREFIXES)),
    );
    const source = parseXML("<d/>");
    assert.strictEqual(processor.transformToString(source), "off");

    processor.engine.enableDynamicEvaluate = true;
    assert.strictEqual(processor.transformToString(source), "2");
  });
});
