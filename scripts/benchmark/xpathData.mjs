/**
 * Derived data of the XPath benchmark (results-xpath.json): rows per DOM,
 * the time ratio xslt3 ÷ 1.0 package, and the Markdown of the generated
 * parts of docs/BENCHMARKS.md.
 *
 * @module scripts/benchmark/xpathData
 */

import { table } from "./data.mjs";
import { formatMs } from "./svg.mjs";
import { formatRatio } from "./xpathMarks.mjs";

/** The 1.0 engine's name (the first one of ENGINE_ORDER). */
const ONE = "1.0 package";

/**
 * @typedef {Object} XPathRow
 * @property {string} id - Scenario id
 * @property {string} label - Scenario label
 * @property {string} expression - Expression
 * @property {object} [one] - 1.0 package measurement
 * @property {object} [three] - xslt3 measurement
 * @property {number|null} ratio - xslt3 compiled median ÷ 1.0 compiled median
 * @property {number|null} oneShotRatio - The same for one-shot runs
 */

/**
 * Rows of one scenario group on one DOM.
 *
 * @param {object} data - Parsed results-xpath.json
 * @param {"shared"|"xpath31"} group - Scenario group
 * @param {string} dom - "jsdom" or "xmldom"
 * @returns {XPathRow[]} One row per scenario
 */
export function xpathRows(data, group, dom) {
  return data.results
    .filter((result) => result.group === group && result.doms[dom])
    .map(({ id, label, expression, doms }) => {
      const one = doms[dom][ONE];
      const three = doms[dom].xslt3;
      const both = one?.status === "ok" && three?.status === "ok";
      const ratio = (phase) =>
        both ? three[phase].medianMs / one[phase].medianMs : null;
      return {
        id,
        label,
        expression,
        one,
        three,
        ratio: ratio("compiled"),
        oneShotRatio: ratio("oneShot"),
      };
    });
}

/**
 * Median of a phase, or the failure status.
 *
 * @param {object|undefined} m - Measurement
 * @param {"compiled"|"oneShot"} phase - Phase
 * @returns {string} The cell
 */
function cell(m, phase) {
  if (!m) return "n/a";
  return m.status === "ok" ? formatMs(m[phase].medianMs) : m.status;
}

/**
 * A ratio cell.
 *
 * @param {number|null} ratio - Ratio
 * @returns {string} "2.31×" or "n/a"
 */
const ratioCell = (ratio) => (ratio ? formatRatio(ratio) : "n/a");

/**
 * Comparison table of the shared scenarios on one DOM.
 *
 * @param {XPathRow[]} rows - Rows
 * @returns {string} Markdown
 */
export function sharedTable(rows) {
  return table(
    [
      "Scenario",
      "1.0 package",
      "xslt3",
      "xslt3 ÷ 1.0",
      "1.0 one-shot",
      "xslt3 one-shot",
      "xslt3 ÷ 1.0 one-shot",
    ],
    rows.map((row) => [
      cellText(row.label),
      cell(row.one, "compiled"),
      cell(row.three, "compiled"),
      ratioCell(row.ratio),
      cell(row.one, "oneShot"),
      cell(row.three, "oneShot"),
      ratioCell(row.oneShotRatio),
    ]),
  );
}

/**
 * Ratio table: the expression and xslt3 ÷ 1.0 package per DOM, compiled
 * and one-shot, sorted by the first DOM's compiled ratio.
 *
 * @param {Record<string, XPathRow[]>} byDom - Shared rows by DOM
 * @returns {string} Markdown
 */
export function ratioTable(byDom) {
  const doms = Object.keys(byDom);
  const head = ["Scenario", "Expression"];
  for (const dom of doms) head.push(dom, `${dom} one-shot`);
  const rowOf = (dom, id) => byDom[dom].find((row) => row.id === id);
  const sorted = [...byDom[doms[0]]].sort(
    (a, b) => (b.ratio ?? -1) - (a.ratio ?? -1),
  );
  return table(
    head,
    sorted.map((row) => [
      cellText(row.label),
      code(row.expression),
      ...doms.flatMap((dom) => [
        ratioCell(rowOf(dom, row.id)?.ratio),
        ratioCell(rowOf(dom, row.id)?.oneShotRatio),
      ]),
    ]),
  );
}

/**
 * An expression as Markdown inline code inside a table cell.
 *
 * @param {string} expression - Expression
 * @returns {string} The cell
 */
function code(expression) {
  return cellText(`\`${expression}\``);
}

/**
 * Text for a Markdown table cell: `|` escaped.
 *
 * @param {string} value - Text
 * @returns {string} The cell
 */
export function cellText(value) {
  return value.replaceAll("|", "\\|");
}

/**
 * Table of the xslt3-only scenarios: the expression and its times on each
 * DOM.
 *
 * @param {Record<string, XPathRow[]>} byDom - Rows by DOM
 * @returns {string} Markdown
 */
export function only31Table(byDom) {
  const doms = Object.keys(byDom);
  const head = ["Scenario", "Expression"];
  for (const dom of doms) head.push(`${dom}`, `${dom} one-shot`);
  const first = byDom[doms[0]];
  return table(
    head,
    first.map((row, index) => [
      cellText(row.label),
      code(row.expression),
      ...doms.flatMap((dom) => [
        cell(byDom[dom][index].three, "compiled"),
        cell(byDom[dom][index].three, "oneShot"),
      ]),
    ]),
  );
}

/**
 * Peak memory table: peak RSS of every engine and DOM process.
 *
 * @param {object} data - Parsed results-xpath.json
 * @returns {string} Markdown
 */
export function xpathMemoryTable(data) {
  const doms = data.environment.doms;
  const head = ["Scenario"];
  for (const dom of doms) head.push(`1.0 package, ${dom}`, `xslt3, ${dom}`);
  const mb = (m) => {
    if (!m) return "n/a";
    return m.maxRssMb == null ? m.status : `${m.maxRssMb} MB`;
  };
  return table(
    head,
    data.results.map((result) => [
      cellText(result.label),
      ...doms.flatMap((dom) => [
        mb(result.doms[dom]?.[ONE]),
        mb(result.doms[dom]?.xslt3),
      ]),
    ]),
  );
}
