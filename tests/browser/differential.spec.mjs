/**
 * Differential test: the library against the browser's native XSLTProcessor.
 *
 * Informational only: differences never fail the run. Each one is recorded
 * as a test annotation, attached as JSON and printed as a summary table.
 * The test is skipped in engines that no longer ship a native processor.
 *
 * Set BROWSER_DIFF_CORPUS=1 to also run the libxslt conformance corpus
 * (`npm run conformance:fetch` first), or set it to the path of a libxslt
 * `tests/` directory. Set BROWSER_DIFF_OUT=<dir> to also write the full
 * differences of each engine to <dir>/differences-<engine>.json.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "@playwright/test";
import { CASES } from "./cases.mjs";
import { loadCorpusCases } from "./corpus.mjs";
import { ESM_PAGE, normalizeMarkup, openPage, textTable } from "./helpers.mjs";

/** API methods both processors implement. */
const MODES = Object.freeze(["fragment", "document"]);

/** Longest excerpt of an output shown in the summary table. */
const EXCERPT = 160;

/**
 * Shorten a result for the summary table.
 *
 * @param {{output: string|null, error: string|null}} result - Run result
 * @returns {string} One-line excerpt
 */
function excerpt(result) {
  const text =
    result.error !== null ? `ERROR: ${result.error}` : String(result.output);
  const line = text.replace(/\s+/g, " ");
  return line.length > EXCERPT ? `${line.slice(0, EXCERPT)}...` : line;
}

test("native XSLTProcessor vs library (informational)", async ({
  page,
  browserName,
}, testInfo) => {
  test.setTimeout(10 * 60_000);
  await openPage(page, ESM_PAGE);
  const hasNative = await page.evaluate(
    () => window.NativeXSLTProcessor !== null,
  );
  test.skip(!hasNative, `${browserName} has no native XSLTProcessor`);

  const cases = [...CASES, ...(await loadCorpusCases())];
  const differences = [];
  let compared = 0;

  for (const testCase of cases) {
    for (const mode of MODES) {
      const { native, library } = await page.evaluate(
        ({ item, runMode }) => {
          const { runCase } = window.harness;
          return {
            native: runCase(window.NativeXSLTProcessor, item, runMode),
            library: runCase(window.lib.XSLTProcessor, item, runMode),
          };
        },
        { item: testCase, runMode: mode },
      );
      compared += 1;
      const same =
        (native.error !== null && library.error !== null) ||
        (native.error === null &&
          library.error === null &&
          normalizeMarkup(native.output) === normalizeMarkup(library.output));
      if (!same) {
        differences.push({ name: testCase.name, mode, native, library });
        testInfo.annotations.push({
          type: "difference",
          description: `${testCase.name} [${mode}]\n  native:  ${excerpt(native)}\n  library: ${excerpt(library)}`,
        });
      }
    }
  }

  const report = JSON.stringify(differences, null, 2);
  await testInfo.attach(`differences-${browserName}.json`, {
    body: report,
    contentType: "application/json",
  });
  if (process.env.BROWSER_DIFF_OUT) {
    mkdirSync(process.env.BROWSER_DIFF_OUT, { recursive: true });
    writeFileSync(
      join(process.env.BROWSER_DIFF_OUT, `differences-${browserName}.json`),
      report,
    );
  }
  const rows = differences.map((d) => [
    d.name,
    d.mode,
    excerpt(d.native),
    excerpt(d.library),
  ]);
  console.log(
    `\n[${browserName}] native vs library: ${compared} comparisons, ${differences.length} differences\n` +
      (rows.length > 0
        ? textTable(["case", "mode", "native", "library"], rows)
        : ""),
  );
});
