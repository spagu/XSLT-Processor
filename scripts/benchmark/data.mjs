/**
 * Derived benchmark data: per-scenario rows with both versions, speed-up
 * factors, and the Markdown tables and headline of docs/BENCHMARKS.md.
 *
 * @module scripts/benchmark/data
 */

import { formatFactor, formatMs } from "./svg.mjs";

/** Versions in legend order: baseline first. */
export const ORDER = Object.freeze(["1.1.3", "1.2.0"]);

/**
 * @typedef {Object} Row
 * @property {string} id - Scenario id
 * @property {string} label - Scenario label
 * @property {object} [old] - 1.1.3 measurement
 * @property {object} [cur] - 1.2.0 measurement
 * @property {number|null} factor - 1.1.3 median / 1.2.0 median
 */

/**
 * Rows of the results.
 *
 * @param {object} data - Parsed results.json
 * @returns {Row[]} One row per scenario
 */
export function rows(data) {
  return data.results.map(({ id, label, versions }) => {
    const old = versions["1.1.3"];
    const cur = versions["1.2.0"];
    const both = old?.status === "ok" && cur?.status === "ok";
    return {
      id,
      label,
      old,
      cur,
      factor: both ? old.medianMs / cur.medianMs : null,
    };
  });
}

/**
 * A cell describing a measurement that has no number.
 *
 * @param {object|undefined} m - Measurement
 * @returns {string} "1.2.0 only" (not run), "timeout", "error", ...
 */
function status(m) {
  return m ? m.status : "1.2.0 only";
}

/**
 * A Markdown table.
 *
 * @param {string[]} head - Header cells
 * @param {string[][]} body - Rows
 * @returns {string} The table
 */
export function table(head, body) {
  const line = (cells) => `| ${cells.join(" | ")} |`;
  return [line(head), line(head.map(() => "---")), ...body.map(line)].join(
    "\n",
  );
}

/**
 * Speed-up table (chart A).
 *
 * @param {Row[]} list - Rows
 * @returns {string} Markdown
 */
export function speedupTable(list) {
  const time = (m) => (m?.status === "ok" ? formatMs(m.medianMs) : status(m));
  return table(
    ["Scenario", "1.1.3 median", "1.2.0 median", "Speed-up"],
    [...list]
      .sort((a, b) => (b.factor ?? -1) - (a.factor ?? -1))
      .map((row) => [
        row.label,
        time(row.old),
        time(row.cur),
        row.factor ? formatFactor(row.factor) : "n/a",
      ]),
  );
}

/**
 * Time table (chart B): median, p95 and min of each version.
 *
 * @param {Row[]} list - Rows
 * @returns {string} Markdown
 */
export function timeTable(list) {
  const cells = (m) =>
    m?.status === "ok"
      ? [
          formatMs(m.medianMs),
          formatMs(m.p95Ms),
          formatMs(m.minMs),
          `${m.warmup} + ${m.runs}`,
        ]
      : [status(m), "", "", ""];
  return table(
    [
      "Scenario",
      "1.1.3 median",
      "p95",
      "min",
      "warm-up + runs",
      "1.2.0 median",
      "p95",
      "min",
      "warm-up + runs",
    ],
    list.map((row) => [row.label, ...cells(row.old), ...cells(row.cur)]),
  );
}

/**
 * Memory table (chart C).
 *
 * @param {Row[]} list - Rows
 * @returns {string} Markdown
 */
export function memoryTable(list) {
  const mb = (m) => {
    if (m?.maxRssMb != null) return `${m.maxRssMb} MB`;
    return m?.status === "ok" ? "not measured" : status(m);
  };
  return table(
    ["Scenario", "1.1.3 peak RSS", "1.2.0 peak RSS", "Change"],
    list.map((row) => {
      const a = row.old?.maxRssMb;
      const b = row.cur?.maxRssMb;
      const percent = a && b ? Math.round(((b - a) / a) * 100) : null;
      const sign = percent > 0 ? "+" : "";
      const change = percent === null ? "n/a" : `${sign}${percent}%`;
      return [row.label, mb(row.old), mb(row.cur), change];
    }),
  );
}

/**
 * The item with the largest value of `valueOf`, or undefined for an empty
 * list.
 *
 * @template T
 * @param {T[]} items - Items
 * @param {(item: T) => number} valueOf - Value to maximize
 * @returns {T|undefined} The first item with the largest value
 */
function maxBy(items, valueOf) {
  let best;
  for (const item of items) {
    if (best === undefined || valueOf(item) > valueOf(best)) best = item;
  }
  return best;
}

/**
 * Headline: largest speed-up, geometric mean speed-up and the largest
 * memory saving.
 *
 * @param {Row[]} list - Rows
 * @returns {string} Markdown
 */
export function hero(list) {
  const compared = list.filter((row) => row.factor);
  const best = maxBy(compared, (row) => row.factor);
  const mean = Math.exp(
    compared.reduce((sum, row) => sum + Math.log(row.factor), 0) /
      compared.length,
  );
  const saving = maxBy(
    compared
      .filter((row) => row.old.maxRssMb && row.cur.maxRssMb)
      .map((row) => ({ row, cut: 1 - row.cur.maxRssMb / row.old.maxRssMb })),
    (item) => item.cut,
  );
  const failing = list.filter(
    (row) => row.cur?.status === "ok" && row.old && row.old.status !== "ok",
  );
  const parts = [];
  if (best) {
    parts.push(
      `**${formatFactor(best.factor)} faster** on ${best.label}`,
      `**${formatFactor(mean)}** geometric mean over ${compared.length} scenarios`,
    );
  }
  if (saving) {
    parts.push(
      `**${Math.round(saving.cut * 100)}% less peak memory** on ${saving.row.label} ` +
        `(${saving.row.old.maxRssMb} MB to ${saving.row.cur.maxRssMb} MB)`,
    );
  }
  if (failing.length) {
    parts.push(
      `${failing.map((row) => row.label).join(", ")}: runs on 1.2.0, ${failing[0].old.status} on 1.1.3`,
    );
  }
  return `${parts.join(" · ")}.`;
}
