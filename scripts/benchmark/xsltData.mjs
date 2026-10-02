/**
 * Derived data of the XSLT engine benchmark (results-xslt.json): rows per
 * group and DOM, the time ratio xslt3 ÷ 1.0 package, and the Markdown
 * tables of the generated parts of docs/BENCHMARKS.md. Times are the
 * median of the `transform` phase (transformation + serialization with a
 * compiled stylesheet) unless a column says compile.
 *
 * @module scripts/benchmark/xsltData
 */

import { table } from "./data.mjs";
import { formatMs } from "./svg.mjs";
import { cellText } from "./xpathData.mjs";
import { formatRatio } from "./xpathMarks.mjs";

/** The 1.0 engine's name. */
const ONE = "1.0 package";

const ok = (m) => m?.status === "ok";

/**
 * Median of a phase, or the failure status.
 *
 * @param {object|undefined} m - Measurement
 * @param {"compile"|"transform"} [phase="transform"] - Phase
 * @returns {string} The cell
 */
export function timeCell(m, phase = "transform") {
  if (!m) return "n/a";
  return ok(m) ? formatMs(m[phase].medianMs) : m.status;
}

/**
 * Ratio of two measurements' transform medians.
 *
 * @param {object|undefined} a - Numerator
 * @param {object|undefined} b - Denominator
 * @returns {number|null} a ÷ b, or null unless both ran
 */
export function ratioOf(a, b) {
  return ok(a) && ok(b) ? a.transform.medianMs / b.transform.medianMs : null;
}

/**
 * Rows of the v1 group on one DOM, shaped like the XPath rows so the
 * XPath ratio chart draws them (`ratio` = xslt3 ÷ 1.0 package).
 *
 * @param {object} data - Parsed results-xslt.json
 * @param {string} dom - DOM
 * @returns {object[]} `{id, label, one, three, ratio}` per scenario
 */
export function v1Rows(data, dom) {
  return data.results
    .filter((result) => result.group === "v1" && result.doms[dom])
    .map(({ id, label, doms }) => {
      const [one, three] = [doms[dom][ONE], doms[dom].xslt3];
      return { id, label, one, three, ratio: ratioOf(three, one) };
    });
}

/**
 * Rows of the rewrites on one DOM: the 1.0 package and xslt3 on the 1.0
 * stylesheet, and xslt3 on the rewrite.
 *
 * @param {object} data - Parsed results-xslt.json
 * @param {string} dom - DOM
 * @returns {object[]} `{id, label, construct, one, three, rewrite, gain}`
 *   per rewrite (`gain` = xslt3 on 1.0 ÷ xslt3 on the rewrite)
 */
export function rewriteRows(data, dom) {
  const byId = new Map(data.results.map((result) => [result.id, result]));
  return data.results
    .filter((result) => result.group === "rewrite" && result.doms[dom])
    .map(({ id, of, construct, doms }) => {
      const original = byId.get(of)?.doms[dom] ?? {};
      const [one, three] = [original[ONE], original.xslt3];
      const rewrite = doms[dom].xslt3;
      const label = byId.get(of)?.label ?? of;
      return {
        id,
        label,
        construct,
        one,
        three,
        rewrite,
        gain: ratioOf(three, rewrite),
      };
    });
}

/**
 * Rows of the XSLT 3.0-only group on one DOM.
 *
 * @param {object} data - Parsed results-xslt.json
 * @param {string} dom - DOM
 * @returns {object[]} `{id, label, three}` per scenario
 */
export function only30Rows(data, dom) {
  return data.results
    .filter((result) => result.group === "only30" && result.doms[dom])
    .map(({ id, label, doms }) => ({ id, label, three: doms[dom].xslt3 }));
}

/**
 * Rows of a group by DOM, in the recorded DOM order.
 *
 * @param {object} data - Parsed results-xslt.json
 * @param {(data: object, dom: string) => object[]} rowsOf - Row builder
 * @returns {Record<string, object[]>} Rows by DOM
 */
export function byDom(data, rowsOf) {
  return Object.fromEntries(
    data.environment.doms.map((dom) => [dom, rowsOf(data, dom)]),
  );
}

/**
 * A ratio cell.
 *
 * @param {number|null} ratio - Ratio
 * @returns {string} "2.31×" or "n/a"
 */
const ratioCell = (ratio) => (ratio ? formatRatio(ratio) : "n/a");

/**
 * Table of the v1 scenarios: both engines' times and the ratio per DOM.
 *
 * @param {Record<string, object[]>} rows - v1 rows by DOM
 * @returns {string} Markdown
 */
export function v1Table(rows) {
  const doms = Object.keys(rows);
  const head = ["Scenario"];
  for (const dom of doms) {
    head.push(`1.0 package, ${dom}`, `xslt3, ${dom}`, `xslt3 ÷ 1.0, ${dom}`);
  }
  return table(
    head,
    rows[doms[0]].map((row, index) => [
      cellText(row.label),
      ...doms.flatMap((dom) => {
        const r = rows[dom][index];
        return [timeCell(r.one), timeCell(r.three), ratioCell(r.ratio)];
      }),
    ]),
  );
}

/**
 * Table of the rewrites: per DOM, the 1.0 package and xslt3 on the 1.0
 * stylesheet and xslt3 on the rewrite.
 *
 * @param {Record<string, object[]>} rows - Rewrite rows by DOM
 * @returns {string} Markdown
 */
export function rewriteTable(rows) {
  const doms = Object.keys(rows);
  const head = ["Task", "Rewrite uses"];
  for (const dom of doms) {
    head.push(
      `1.0 package, ${dom}`,
      `xslt3 1.0 stylesheet, ${dom}`,
      `xslt3 rewrite, ${dom}`,
    );
  }
  return table(
    head,
    rows[doms[0]].map((row, index) => [
      cellText(row.label),
      cellText(row.construct),
      ...doms.flatMap((dom) => {
        const r = rows[dom][index];
        return [timeCell(r.one), timeCell(r.three), timeCell(r.rewrite)];
      }),
    ]),
  );
}

/**
 * Table of the XSLT 3.0-only scenarios: time and compile time per DOM.
 *
 * @param {Record<string, object[]>} rows - only30 rows by DOM
 * @returns {string} Markdown
 */
export function only30Table(rows) {
  const doms = Object.keys(rows);
  const head = ["Scenario"];
  for (const dom of doms) head.push(dom, `${dom} compile`);
  return table(
    head,
    rows[doms[0]].map((row, index) => [
      cellText(row.label),
      ...doms.flatMap((dom) => [
        timeCell(rows[dom][index].three),
        timeCell(rows[dom][index].three, "compile"),
      ]),
    ]),
  );
}
