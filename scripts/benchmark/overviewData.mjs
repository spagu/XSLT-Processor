/**
 * The "all versions" overview of docs/BENCHMARKS.md: the XSLT 1.0
 * scenarios that both recorded runs share, with the median time and peak
 * memory of every version side by side. 1.1.3 and 1.2.0 come from
 * results.json, the current 1.0 package and @tradik/xslt3 from
 * results-xslt.json (compile + transform medians, jsdom).
 *
 * @module scripts/benchmark/overviewData
 */

import { table } from "./data.mjs";
import { formatFactor, formatMs } from "./svg.mjs";
import { ratioWords } from "./xpathMarks.mjs";

/** The released versions in results.json, oldest first. */
const RELEASE = Object.freeze(["1.1.3", "1.2.0"]);

/**
 * A scenario label as a Markdown table cell.
 *
 * @param {string} label - Label
 * @returns {string} The cell
 */
const labelCell = (label) => label.replaceAll("|", "\\|");

/**
 * @typedef {Object} Cell
 * @property {string} status - "ok", "error", "timeout", ...
 * @property {number} [ms] - Median time
 * @property {number|null} [rss] - Peak RSS in MB
 */

/**
 * @typedef {Object} OverviewRow
 * @property {string} id - Scenario id
 * @property {string} label - Scenario label
 * @property {Cell[]} cells - One cell per version, in `versions` order
 */

/**
 * Version labels, oldest first.
 *
 * @param {object} xslt - Parsed results-xslt.json
 * @returns {string[]} E.g. ["1.1.3", "1.2.0", "1.3.0", "xslt3 1.0.0"]
 */
export function overviewVersions(xslt) {
  const { engines } = xslt.environment;
  return [...RELEASE, engines["1.0 package"], `xslt3 ${engines.xslt3}`];
}

/**
 * A results.json measurement as a cell.
 *
 * @param {object|undefined} m - Measurement
 * @returns {Cell} The cell
 */
function releaseCell(m) {
  if (m?.status !== "ok") return { status: m?.status ?? "not run" };
  return { status: "ok", ms: m.medianMs, rss: m.maxRssMb ?? null };
}

/**
 * A results-xslt.json measurement as a cell: compile + transform, which
 * is what results.json times in one go.
 *
 * @param {object|undefined} m - Measurement
 * @returns {Cell} The cell
 */
function engineCell(m) {
  if (m?.status !== "ok") return { status: m?.status ?? "not run" };
  const ms = m.compile.medianMs + m.transform.medianMs;
  return { status: "ok", ms, rss: m.maxRssMb ?? null };
}

/**
 * Rows of the shared scenarios, slowest on 1.1.3 first.
 *
 * @param {object} release - Parsed results.json
 * @param {object} xslt - Parsed results-xslt.json
 * @param {string} [dom="jsdom"] - DOM of the results-xslt.json numbers
 * @returns {OverviewRow[]} Rows
 */
export function overviewRows(release, xslt, dom = "jsdom") {
  const byId = new Map(release.results.map((r) => [r.id, r]));
  const rows = xslt.results
    .filter((r) => r.group === "v1" && byId.has(r.id))
    .map((r) => {
      const { versions } = byId.get(r.id);
      const engines = r.doms[dom];
      return {
        id: r.id,
        label: r.label,
        cells: [
          ...RELEASE.map((v) => releaseCell(versions[v])),
          engineCell(engines["1.0 package"]),
          engineCell(engines.xslt3),
        ],
      };
    });
  const key = (row) => row.cells.find((c) => c.status === "ok")?.ms ?? 0;
  return rows.sort((a, b) => key(b) - key(a));
}

/**
 * Geometric mean of the speed-up of each version over the first one,
 * over the rows where both ran.
 *
 * @param {OverviewRow[]} rows - Rows
 * @returns {(number|null)[]} One factor per version (1 for the first)
 */
export function overviewSpeedups(rows) {
  return rows[0].cells.map((_, index) => {
    const logs = rows
      .filter((row) => row.cells[0].ms && row.cells[index].ms)
      .map((row) => Math.log(row.cells[0].ms / row.cells[index].ms));
    if (!logs.length) return null;
    return Math.exp(logs.reduce((sum, value) => sum + value, 0) / logs.length);
  });
}

/**
 * Time table: one column per version, the fastest of each row in bold,
 * then the geometric mean speed-up over the first version.
 *
 * @param {OverviewRow[]} rows - Rows
 * @param {string[]} versions - Version labels
 * @returns {string} Markdown
 */
export function overviewTimeTable(rows, versions) {
  const body = rows.map((row) => {
    const best = Math.min(...row.cells.filter((c) => c.ms).map((c) => c.ms));
    const cells = row.cells.map((c) => {
      if (!c.ms) return c.status;
      return c.ms === best ? `**${formatMs(c.ms)}**` : formatMs(c.ms);
    });
    return [labelCell(row.label), ...cells];
  });
  const means = overviewSpeedups(rows).map((f) => (f ? formatFactor(f) : ""));
  body.push([`Speed vs ${versions[0]} (geometric mean)`, ...means]);
  return table(["Scenario", ...versions], body);
}

/**
 * Peak memory table: one column per version.
 *
 * @param {OverviewRow[]} rows - Rows
 * @param {string[]} versions - Version labels
 * @returns {string} Markdown
 */
export function overviewMemoryTable(rows, versions) {
  const mb = (c) => (c.rss ? `${c.rss} MB` : c.status);
  return table(
    ["Scenario", ...versions],
    rows.map((row) => [labelCell(row.label), ...row.cells.map(mb)]),
  );
}

/**
 * Headline: how much faster each version is than the first one.
 *
 * @param {OverviewRow[]} rows - Rows
 * @param {string[]} versions - Version labels
 * @returns {string} Markdown
 */
export function overviewHero(rows, versions) {
  const means = overviewSpeedups(rows);
  const parts = versions
    .slice(1)
    .map((v, i) => `${v} **${ratioWords(1 / means[i + 1])}**`);
  return (
    `Against ${versions[0]}, on the same ${rows.length} XSLT 1.0 stylesheets (geometric mean): ` +
    `${parts.join(" · ")}.`
  );
}
