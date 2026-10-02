/**
 * Further tables of the XSLT engine benchmark: compile time, peak memory
 * and start-up (bundle sizes, import times).
 *
 * @module scripts/benchmark/xsltTables
 */

import { table } from "./data.mjs";
import { formatMs } from "./svg.mjs";
import { cellText } from "./xpathData.mjs";
import { XSLT_ENGINES } from "./xsltScenarios.mjs";
import { timeCell } from "./xsltData.mjs";

/**
 * Columns of every engine on every DOM.
 *
 * @param {string[]} doms - DOMs
 * @returns {Array<[string, string]>} [engine, dom] pairs
 */
const columns = (doms) =>
  doms.flatMap((dom) => XSLT_ENGINES.map((engine) => [engine, dom]));

/**
 * Compile-time table: median compile time of every engine and DOM.
 *
 * @param {object} data - Parsed results-xslt.json
 * @returns {string} Markdown
 */
export function compileTable(data) {
  const pairs = columns(data.environment.doms);
  return table(
    ["Scenario", ...pairs.map(([engine, dom]) => `${engine}, ${dom}`)],
    data.results.map((result) => [
      cellText(result.label),
      ...pairs.map(([engine, dom]) =>
        timeCell(result.doms[dom]?.[engine], "compile"),
      ),
    ]),
  );
}

/**
 * Peak memory table: peak RSS of every engine and DOM process.
 *
 * @param {object} data - Parsed results-xslt.json
 * @returns {string} Markdown
 */
export function xsltMemoryTable(data) {
  const pairs = columns(data.environment.doms);
  const mb = (m) => {
    if (!m) return "n/a";
    return m.maxRssMb == null ? m.status : `${m.maxRssMb} MB`;
  };
  return table(
    ["Scenario", ...pairs.map(([engine, dom]) => `${engine}, ${dom}`)],
    data.results.map((result) => [
      cellText(result.label),
      ...pairs.map(([engine, dom]) => mb(result.doms[dom]?.[engine])),
    ]),
  );
}

/**
 * A size in kB with one decimal.
 *
 * @param {number} bytes - Bytes
 * @returns {string} "123.4 kB"
 */
export function kb(bytes) {
  return `${(bytes / 1000).toFixed(1)} kB`;
}

/**
 * Start-up table: bundle sizes and import times per engine.
 *
 * @param {object[]|null} startup - results-xslt.json `startup`
 * @returns {string} Markdown
 */
export function startupTable(startup) {
  if (!startup) return "Not measured in this run (`--no-startup`).";
  const time = (m) => (m.status === "ok" ? formatMs(m.medianMs) : m.status);
  return table(
    [
      "Engine",
      "Bundle",
      "gzip",
      "Brotli",
      "Node.js import(), source",
      "Node.js import(), bundle",
    ],
    startup.map((row) => [
      `${row.engine} (\`${row.entry}\`)`,
      kb(row.bundle.raw),
      kb(row.bundle.gzip),
      kb(row.bundle.brotli),
      time(row.importSource),
      time(row.importBundle),
    ]),
  );
}
