/**
 * Optional differential corpus: the libxslt regression tests.
 *
 * Enabled with BROWSER_DIFF_CORPUS=1 (the corpus downloaded by
 * `npm run conformance:fetch`) or BROWSER_DIFF_CORPUS=<libxslt tests dir>.
 * Only self-contained cases are used: the browser runs them from strings,
 * so cases that need xsl:include/xsl:import, document(), external entities
 * or a stylesheet PI, and cases libxslt itself rejects, are left out.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Markers of cases that need files beyond the source and the stylesheet. */
const EXTERNAL_REFERENCE =
  /<xsl:(?:include|import)\b|document\s*\(|<!DOCTYPE[^>]*(?:SYSTEM|PUBLIC)|<!ENTITY[^>]*(?:SYSTEM|PUBLIC)/;

/**
 * Load the self-contained corpus cases, or none when the corpus is disabled.
 *
 * @returns {Promise<import('./cases.mjs').BrowserCase[]>} Cases (no `expect`)
 */
export async function loadCorpusCases() {
  const setting = process.env.BROWSER_DIFF_CORPUS;
  if (!setting) return [];
  // Loaded on demand: the conformance runner pulls in jsdom
  const { discoverCases } = await import("../../scripts/conformance/cases.mjs");
  const { decodeExpected } =
    await import("../../scripts/conformance/normalize.mjs");
  const { CASE_PARAMETERS } =
    await import("../../scripts/conformance/runCase.mjs");
  const { corpusDir } = await import("../../scripts/fetch-conformance.mjs");
  const testsDir = setting === "1" ? join(corpusDir, "tests") : setting;
  if (!existsSync(testsDir)) {
    throw new Error(`BROWSER_DIFF_CORPUS: ${testsDir} does not exist`);
  }

  const cases = [];
  for (const item of discoverCases(testsDir)) {
    if (item.stylesheet === null || item.expectsError) continue;
    const xsl = decodeExpected(readFileSync(item.stylesheet));
    const xml = decodeExpected(readFileSync(item.source));
    if (EXTERNAL_REFERENCE.test(xsl) || EXTERNAL_REFERENCE.test(xml)) continue;
    cases.push({
      name: item.id,
      xml: stripDeclaration(xml),
      xsl: stripDeclaration(xsl),
      params: { ...CASE_PARAMETERS },
      expect: [],
    });
  }
  return cases;
}

/**
 * Drop the XML declaration: the text is already decoded, and a declared
 * non-UTF-8 encoding would only confuse DOMParser.parseFromString.
 *
 * @param {string} text - Decoded XML
 * @returns {string} XML without its declaration
 */
function stripDeclaration(text) {
  return text.replace(/^\uFEFF?<\?xml\s[^?]*\?>/, "");
}
