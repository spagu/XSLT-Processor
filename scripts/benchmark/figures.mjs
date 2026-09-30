/**
 * Benchmark charts A and B as SVG strings:
 *
 * - A: speed-up factor per scenario, a dot plot on a log axis;
 * - B: median time per scenario, a dumbbell chart on a log axis;
 * (C, peak memory, is in memory.mjs).
 *
 * @module scripts/benchmark/figures
 */

import { ORDER } from "./data.mjs";
import {
  PLOT_LEFT,
  PLOT_RIGHT,
  ROW,
  dot,
  formatFactor,
  formatMs,
  grid,
  legend,
  logScale,
  r,
  rowLabel,
  svgDocument,
  text,
} from "./svg.mjs";

/**
 * Chart A: speed-up factors.
 *
 * @param {import("./data.mjs").Row[]} list - Rows
 * @returns {string} SVG
 */
export function speedupChart(list) {
  const compared = list
    .filter((row) => row.factor)
    .sort((a, b) => b.factor - a.factor);
  const skipped = list.filter((row) => !row.factor);
  const max = compared[0].factor;
  const min = compared[compared.length - 1].factor;
  const hi = [5, 10, 100, 1000, 10000].find((tick) => tick >= max * 1.3);
  const lo = min < 0.95 ? 0.5 : 1;
  const ticks = [0.5, 1, 2, 5, 10, 100, 1000, 10000]
    .filter((value) => value >= lo && value <= hi)
    .map((value) => ({ value, label: `${value}×` }));
  const top = 66;
  const bottom = top + compared.length * ROW;
  const x = logScale(lo, hi, PLOT_LEFT, PLOT_RIGHT);
  const body = [
    text(
      16,
      44,
      "1.1.3 median time ÷ 1.2.0 median time; right of the dashed line 1.2.0 is faster",
      "t2",
    ),
    ...grid(ticks, x, top, bottom),
    `<line class="ref" x1="${r(x(1))}" x2="${r(x(1))}" y1="${top - 4}" y2="${bottom}"/>`,
    text(x(1) + 4, top - 6, "same speed", "t2"),
  ];
  compared.forEach((row, index) => {
    const y = top + index * ROW + ROW / 2;
    const tip = `${row.label}: 1.2.0 is ${formatFactor(row.factor)} as fast as 1.1.3 (${formatMs(row.old.medianMs)} vs ${formatMs(row.cur.medianMs)})`;
    body.push(rowLabel(row.label, y), dot(x(row.factor), y, "1.2.0", tip));
    // A slow-down is labelled on the left so the label stays off the 1× line
    const side = row.factor < 1 ? -10 : 10;
    const anchor = row.factor < 1 ? "end" : "start";
    body.push(
      text(x(row.factor) + side, y + 4, formatFactor(row.factor), "t1", anchor),
    );
  });
  const notes = skipped.map(
    (row) =>
      `· ${row.label} (${row.old ? `1.1.3: ${row.old.status}` : "1.2.0 only"})`,
  );
  if (notes.length) notes.unshift("Not compared (see the tables):");
  notes.forEach((note, index) => {
    body.push(text(16, bottom + 42 + index * 16, note, "t2"));
  });
  const best = compared[0];
  return svgDocument({
    height: bottom + 42 + notes.length * 16 + 4,
    title: "Speed-up of 1.2.0 over 1.1.3 per scenario (log scale)",
    desc:
      `1.2.0 is faster than 1.1.3 in ${compared.filter((row) => row.factor > 1).length} of ${compared.length} compared scenarios; ` +
      `the largest speed-up is ${formatFactor(best.factor)} (${best.label}).`,
    body,
  });
}

/**
 * Decade ticks of a time axis covering the data.
 *
 * @param {number[]} values - Times in ms
 * @returns {{value: number, label: string}[]} Ticks from 1 ms to 100 s
 */
function timeTicks(values) {
  const lo = 10 ** Math.floor(Math.log10(Math.min(...values)));
  const hi = 10 ** Math.ceil(Math.log10(Math.max(...values)));
  const labels = ["1 ms", "10 ms", "100 ms", "1 s", "10 s", "100 s"];
  return labels
    .map((label, index) => ({ value: 10 ** index, label }))
    .filter(({ value }) => value >= lo && value <= hi);
}

/**
 * Chart B: median time per scenario and version.
 *
 * @param {import("./data.mjs").Row[]} list - Rows
 * @returns {string} SVG
 */
export function timeChart(list) {
  const ok = (m) => m?.status === "ok";
  const shown = list.filter((row) => ok(row.cur) || ok(row.old));
  const key = (row) => (ok(row.old) ? row.old.medianMs : row.cur.medianMs);
  shown.sort((a, b) => key(b) - key(a));
  const times = shown.flatMap((row) =>
    [row.old, row.cur].filter(ok).map((m) => m.medianMs),
  );
  const ticks = timeTicks(times);
  const x = logScale(
    ticks[0].value,
    ticks[ticks.length - 1].value,
    PLOT_LEFT,
    PLOT_RIGHT,
  );
  const top = 78;
  const bottom = top + shown.length * ROW;
  const body = [
    ...legend(PLOT_LEFT, 46, ORDER),
    ...grid(ticks, x, top, bottom),
  ];
  shown.forEach((row, index) => {
    const y = top + index * ROW + ROW / 2;
    const points = ORDER.map((version) => ({
      version,
      m: version === "1.1.3" ? row.old : row.cur,
    })).filter((p) => ok(p.m));
    body.push(rowLabel(row.label, y));
    if (points.length === 2) {
      body.push(
        `<line class="link" x1="${r(x(points[0].m.medianMs))}" x2="${r(x(points[1].m.medianMs))}" y1="${y}" y2="${y}"/>`,
      );
    }
    for (const { version, m } of points) {
      body.push(
        dot(
          x(m.medianMs),
          y,
          version,
          `${row.label}, ${version}: median ${formatMs(m.medianMs)}`,
        ),
      );
    }
    const rightmost = Math.max(...points.map((p) => x(p.m.medianMs)));
    if (row.old && !ok(row.old)) {
      body.push(text(rightmost + 10, y + 4, `1.1.3: ${row.old.status}`, "t2"));
    }
    if (index === 0) body.push(...directLabels(points, x, y));
  });
  const slowest = shown[0];
  return svgDocument({
    height: bottom + 26,
    title: "Median time per scenario, 1.1.3 and 1.2.0 (log scale)",
    desc: `Median wall time of each scenario for both versions; the slowest is ${slowest.label} (${formatMs(key(slowest))} on ${ok(slowest.old) ? "1.1.3" : "1.2.0"}).`,
    body,
  });
}

/**
 * Version labels above the dots of the first row, pointing outward.
 *
 * @param {{version: string, m: object}[]} points - The row's dots
 * @param {(value: number) => number} x - Scale
 * @param {number} y - Row centre
 * @returns {string[]} Elements
 */
function directLabels(points, x, y) {
  const sorted = [...points].sort((a, b) => a.m.medianMs - b.m.medianMs);
  return sorted.map((p, index) => {
    const outward = sorted.length === 1 ? "middle" : ["end", "start"][index];
    return text(x(p.m.medianMs), y - 10, p.version, "t2", outward);
  });
}
