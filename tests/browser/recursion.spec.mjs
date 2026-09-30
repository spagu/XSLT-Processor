/**
 * Deep template recursion in a real browser: templates are instantiated from
 * an explicit work stack, so libxslt's 3000 nested templates fit in every
 * engine's call stack, and deeper recursion stops with a clear error.
 */

import { expect, test } from "@playwright/test";
import { ESM_PAGE, openPage } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  await openPage(page, ESM_PAGE);
});

test("3000 nested call-template and apply-templates instantiations", async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const { XSLTProcessor } = window.lib;
    const { parseXml } = window.harness;
    const head =
      '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><xsl:output method="text"/>';
    const callTemplate = (n) =>
      `${head}<xsl:template match="/"><xsl:call-template name="r"><xsl:with-param name="n" select="${n}"/></xsl:call-template></xsl:template>
       <xsl:template name="r"><xsl:param name="n"/><xsl:if test="$n > 0"><xsl:call-template name="r"><xsl:with-param name="n" select="$n - 1"/></xsl:call-template></xsl:if><xsl:if test="$n = 0">done</xsl:if></xsl:template></xsl:stylesheet>`;
    const applyTemplates = (n) =>
      `${head}<xsl:template match="/"><xsl:apply-templates select="*" mode="r"><xsl:with-param name="n" select="${n}"/></xsl:apply-templates></xsl:template>
       <xsl:template match="*" mode="r"><xsl:param name="n"/><xsl:if test="$n > 0"><xsl:apply-templates select="." mode="r"><xsl:with-param name="n" select="$n - 1"/></xsl:apply-templates></xsl:if><xsl:if test="$n = 0">done</xsl:if></xsl:template></xsl:stylesheet>`;
    const run = (xsl, options) => {
      const processor = new XSLTProcessor(options);
      processor.importStylesheet(parseXml(xsl));
      return processor.transformToString(parseXml("<d/>"));
    };
    const errors = [];
    const { error } = console;
    console.error = (_label, err) => errors.push(err.message);
    try {
      return {
        // The "/" rule plus 2999 invocations: 3000 nested templates
        callTemplate: run(callTemplate(2998)),
        applyTemplates: run(applyTemplates(2998)),
        deeper: run(callTemplate(20000), { maxTemplateDepth: 25000 }),
        tooDeep: run(callTemplate(2999)),
        errors,
      };
    } finally {
      console.error = error;
    }
  });

  expect(result.callTemplate).toBe("done");
  expect(result.applyTemplates).toBe("done");
  expect(result.deeper).toBe("done");
  expect(result.tooDeep).toBeNull();
  expect(result.errors).toEqual([
    expect.stringMatching(/^Template recursion too deep: more than 3000/),
  ]);
});
