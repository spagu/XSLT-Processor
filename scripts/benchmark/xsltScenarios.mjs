/**
 * Scenarios of the XSLT engine benchmark (`--suite xslt`), in three groups:
 *
 * - `v1`: the XSLT 1.0 stylesheets of the 1.1.3 vs 1.2.0 suite
 *   (inputs.mjs), run by both engines; @tradik/xslt3 runs them in
 *   backwards-compatible mode (they declare version="1.0");
 * - `rewrite`: the same tasks written idiomatically in XSLT 2.0/3.0
 *   (xsltRewrites.mjs), run by @tradik/xslt3; `of` names the v1 scenario
 *   whose output they must reproduce;
 * - `only30`: XSLT 3.0 tasks that 1.0 cannot express (xslt30Inputs.mjs).
 *
 * @module scripts/benchmark/xsltScenarios
 */

import { INPUTS, LARGE_TEXT_MB } from "./inputs.mjs";
import { XSLT30_INPUTS } from "./xslt30Inputs.mjs";
import { REWRITES } from "./xsltRewrites.mjs";

/** Engine names in legend order (the colours of svg.mjs SERIES). */
export const XSLT_ENGINES = Object.freeze(["1.0 package", "xslt3"]);

/**
 * @typedef {Object} XsltScenario
 * @property {string} id - Stable identifier (results-xslt.json key)
 * @property {string} label - Short label for charts and tables
 * @property {"v1"|"rewrite"|"only30"} group - Scenario group
 * @property {string} input - Input set name in the group's generators
 * @property {readonly string[]} engines - Engines it runs on
 * @property {string} [of] - The v1 scenario a rewrite reproduces
 * @property {string} [construct] - What a rewrite uses instead
 */

const v1 = (id, label, input = id) => ({
  id,
  label,
  group: "v1",
  input,
  engines: XSLT_ENGINES,
});

const rewrite = (of, input, label, construct) => ({
  id: `${of}Rewrite`,
  label,
  group: "rewrite",
  input,
  of,
  construct,
  engines: ["xslt3"],
});

const only30 = (id, label) => ({
  id,
  label,
  group: "only30",
  input: id,
  engines: ["xslt3"],
});

/** @type {readonly XsltScenario[]} */
export const XSLT_SCENARIOS = Object.freeze([
  v1("catalog", "Issue #9 catalogue (3 MB HTML)"),
  v1("applyTemplates", "apply-templates item[@id], 8,000"),
  v1("muenchian", "Muenchian grouping, 8,000"),
  v1("numberAny", 'xsl:number level="any", 8,000'),
  v1("followingSibling", "following-sibling::x[1], 8,000"),
  v1("sort", "Sort 20,000 by two keys", "sortTwoKeys"),
  v1("identity", "Identity transform, 5 MB"),
  v1("recursion3000", "call-template depth 3,000"),
  v1("largeText", `${LARGE_TEXT_MB} MB text result`),
  rewrite("catalog", "catalog", "Catalogue", "xsl:for-each-group"),
  rewrite("muenchian", "muenchian", "Grouping, 8,000", "xsl:for-each-group"),
  rewrite("numberAny", "numberAny", "Numbering, 8,000", "xsl:iterate"),
  rewrite("sort", "sortTwoKeys", "Sort, 20,000", "sort() with a key"),
  rewrite("identity", "identity", "Identity, 5 MB", "on-no-match"),
  rewrite("recursion3000", "recursion3000", "Depth 3,000", "xsl:iterate"),
  only30("groupAdjacent", "group-adjacent, 50,000"),
  only30("analyzeString", "analyze-string, 5 MB log"),
  only30("iterateTotals", "xsl:iterate totals, 100,000"),
  only30("jsonToXml", "json-to-xml, 5 MB JSON"),
  only30("parseJson", "parse-json, 5 MB JSON"),
  only30("xmlToJson", "xml-to-json, 5 MB JSON"),
  only30("jsonOutput", "serialize as JSON, 29,000 maps"),
  only30("maps", "100,000-entry map + lookups"),
  only30("hofSort", "sort() with a key, 20,000"),
  only30("foldLeft", "fold-left into a map, 20,000"),
  only30("accumulators", "Accumulators, 5 MB"),
  only30("merge", "xsl:merge, 2 × 50,000"),
]);

/** Generators of each group. */
const GENERATORS = Object.freeze({
  v1: INPUTS,
  rewrite: REWRITES,
  only30: XSLT30_INPUTS,
});

/**
 * Generate the input of a scenario.
 *
 * @param {XsltScenario} scenario - The scenario
 * @returns {{xml: string, xsl: string, params?: Record<string, string>}}
 *   Source, stylesheet and string parameters
 * @throws {Error} When the input set does not exist
 */
export function scenarioInput(scenario) {
  const generate = GENERATORS[scenario.group]?.[scenario.input];
  if (!generate) {
    throw new Error(`No input ${scenario.group}/${scenario.input}`);
  }
  return generate();
}

/**
 * Pick scenarios by id (all when `only` is empty).
 *
 * @param {string[]|undefined} only - Ids
 * @returns {XsltScenario[]} The scenarios, in suite order
 * @throws {Error} When an id is unknown
 */
export function pickScenarios(only) {
  const unknown = only?.find((id) => !XSLT_SCENARIOS.some((s) => s.id === id));
  if (unknown) throw new Error(`Unknown scenario: ${unknown}`);
  return XSLT_SCENARIOS.filter((s) => !only || only.includes(s.id));
}
