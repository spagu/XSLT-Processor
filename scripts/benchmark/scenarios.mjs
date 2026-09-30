/**
 * The benchmark scenarios. Each one names its input set (inputs.mjs), how
 * it is run and which versions it applies to:
 *
 * - `lib`: in a worker process, `importStylesheet()` + `transformToString()`
 *   on documents parsed once with jsdom (parsing is not timed);
 * - `stream`: the same, consuming `transformToStream()` instead;
 * - `cli`: `xslt in.xml t.xsl -o out` end to end, one process per run;
 * - `binary`: start-up of the standalone executable (`xslt --version`).
 *
 * @module scripts/benchmark/scenarios
 */

import { LARGE_TEXT_MB } from "./inputs.mjs";

/** Versions compared: the released baseline and the current tree. */
export const VERSIONS = Object.freeze(["1.1.3", "1.2.0"]);

const BOTH = VERSIONS;
const CURRENT = Object.freeze(["1.2.0"]);

/**
 * @typedef {Object} Scenario
 * @property {string} id - Stable identifier (results.json key)
 * @property {string} label - Short label for charts and tables
 * @property {"lib"|"stream"|"cli"|"binary"} kind - How it is run
 * @property {string} [input] - Input set name (INPUTS key)
 * @property {readonly string[]} versions - Versions it runs on
 * @property {Record<string, string>} [env] - Extra environment (cli)
 */

/** @type {readonly Scenario[]} */
export const SCENARIOS = Object.freeze([
  {
    id: "catalog",
    label: "Issue #9 catalogue (3 MB HTML)",
    kind: "lib",
    input: "catalog",
    versions: BOTH,
  },
  {
    id: "applyTemplates",
    label: "apply-templates item[@id], 8,000",
    kind: "lib",
    input: "applyTemplates",
    versions: BOTH,
  },
  {
    id: "muenchian",
    label: "Muenchian grouping, 8,000",
    kind: "lib",
    input: "muenchian",
    versions: BOTH,
  },
  {
    id: "numberAny",
    label: 'xsl:number level="any", 8,000',
    kind: "lib",
    input: "numberAny",
    versions: BOTH,
  },
  {
    id: "followingSibling",
    label: "following-sibling::x[1], 8,000",
    kind: "lib",
    input: "followingSibling",
    versions: BOTH,
  },
  {
    id: "sort",
    label: "Sort 20,000 by two keys",
    kind: "lib",
    input: "sortTwoKeys",
    versions: BOTH,
  },
  {
    id: "identity",
    label: "Identity transform, 5 MB",
    kind: "lib",
    input: "identity",
    versions: BOTH,
  },
  {
    id: "recursion900",
    label: "call-template depth 900",
    kind: "lib",
    input: "recursion900",
    versions: BOTH,
  },
  {
    id: "recursion3000",
    label: "call-template depth 3,000",
    kind: "lib",
    input: "recursion3000",
    versions: BOTH,
  },
  {
    id: "largeText",
    label: `${LARGE_TEXT_MB} MB text result, string`,
    kind: "lib",
    input: "largeText",
    versions: BOTH,
  },
  {
    id: "cli",
    label: "CLI end to end, jsdom",
    kind: "cli",
    input: "catalog",
    versions: BOTH,
    env: { XSLT_DOM: "jsdom" },
  },
  {
    id: "largeTextStream",
    label: `${LARGE_TEXT_MB} MB text result, stream`,
    kind: "stream",
    input: "largeText",
    versions: CURRENT,
  },
  {
    id: "cliXmldom",
    label: "CLI end to end, XSLT_DOM=xmldom",
    kind: "cli",
    input: "catalog",
    versions: CURRENT,
    env: { XSLT_DOM: "xmldom" },
  },
  {
    id: "binaryStartup",
    label: "Standalone binary start-up",
    kind: "binary",
    versions: CURRENT,
  },
]);
