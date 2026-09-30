/**
 * Representative stylesheets (cases.mjs) through the library in each engine.
 */

import { expect, test } from "@playwright/test";
import { CASES } from "./cases.mjs";
import { ESM_PAGE, openPage } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  await openPage(page, ESM_PAGE);
});

for (const testCase of CASES) {
  test(`stylesheet: ${testCase.name}`, async ({ page }) => {
    const results = await page.evaluate((item) => {
      const { XSLTProcessor } = window.lib;
      const { runCase } = window.harness;
      return {
        string: runCase(XSLTProcessor, item, "string"),
        fragment: runCase(XSLTProcessor, item, "fragment"),
        document: runCase(XSLTProcessor, item, "document"),
      };
    }, testCase);

    for (const [mode, result] of Object.entries(results)) {
      expect(result.error, `${mode} threw`).toBeNull();
    }

    // Expected snippets appear in the given order in transformToString
    let from = 0;
    for (const snippet of testCase.expect) {
      const at = results.string.output.indexOf(snippet, from);
      expect(
        at,
        `"${snippet}" in ${results.string.output}`,
      ).toBeGreaterThanOrEqual(0);
      from = at + snippet.length;
    }
  });
}
