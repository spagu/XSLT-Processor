/**
 * Benchmark chart C: peak memory per scenario, grouped horizontal bars on a
 * linear axis from 0 (2 px gap between the bars, 4 px rounded data ends).
 *
 * @module scripts/benchmark/memory
 */

import { ORDER } from "./data.mjs";
import {
  PLOT_LEFT,
  PLOT_RIGHT,
  SERIES,
  esc,
  grid,
  legend,
  r,
  rowLabel,
  svgDocument,
} from "./svg.mjs";

/**
 * A horizontal bar anchored at `x0` with 4 px rounded data end.
 *
 * @param {number} x0 - Baseline x
 * @param {number} y - Top
 * @param {number} w - Length
 * @param {number} h - Thickness
 * @returns {string} Path data
 */
function barPath(x0, y, w, h) {
  const rad = Math.min(4, w / 2, h / 2);
  const end = x0 + w;
  return `M${r(x0)} ${r(y)}H${r(end - rad)}A${rad} ${rad} 0 0 1 ${r(end)} ${r(y + rad)}V${r(y + h - rad)}A${rad} ${rad} 0 0 1 ${r(end - rad)} ${r(y + h)}H${r(x0)}Z`;
}

/**
 * Chart C: peak RSS per scenario and version.
 *
 * @param {import("./data.mjs").Row[]} list - Rows
 * @returns {string} SVG
 */
export function memoryChart(list) {
  const mb = (row, version) =>
    (version === "1.1.3" ? row.old : row.cur)?.maxRssMb ?? null;
  const shown = list.filter((row) => ORDER.some((v) => mb(row, v) != null));
  shown.sort(
    (a, b) =>
      Math.max(mb(b, "1.1.3"), mb(b, "1.2.0")) -
      Math.max(mb(a, "1.1.3"), mb(a, "1.2.0")),
  );
  const max = Math.max(
    ...shown.flatMap((row) => ORDER.map((v) => mb(row, v) ?? 0)),
  );
  const step = [100, 250, 500, 1000].find((s) => max / s <= 6);
  const hi = Math.ceil(max / step) * step;
  const x = (value) => PLOT_LEFT + (value / hi) * (PLOT_RIGHT - PLOT_LEFT);
  const ticks = Array.from({ length: hi / step + 1 }, (_, i) => ({
    value: i * step,
    label: `${i * step} MB`,
  }));
  const row = 30;
  const top = 66;
  const bottom = top + shown.length * row;
  const body = [
    ...legend(PLOT_LEFT, 46, ORDER, "bar"),
    ...grid(ticks, x, top, bottom),
  ];
  shown.forEach((entry, index) => {
    const y = top + index * row + 4;
    body.push(rowLabel(entry.label, y + 11));
    ORDER.forEach((version, slot) => {
      const value = mb(entry, version);
      if (value == null) return;
      body.push(
        `<path class="${SERIES[version]}" d="${barPath(PLOT_LEFT, y + slot * 12, x(value) - PLOT_LEFT, 10)}">` +
          `<title>${esc(`${entry.label}, ${version}: peak RSS ${value} MB`)}</title></path>`,
      );
    });
  });
  body.push(
    `<line class="axis" x1="${PLOT_LEFT}" x2="${PLOT_LEFT}" y1="${top}" y2="${bottom}"/>`,
  );
  const biggest = shown[0];
  return svgDocument({
    height: bottom + 26,
    title: "Peak memory (RSS) per scenario, MB",
    desc: `Peak resident set size of the process of each scenario; the largest is ${biggest.label} (1.1.3: ${mb(biggest, "1.1.3") ?? "n/a"} MB, 1.2.0: ${mb(biggest, "1.2.0") ?? "n/a"} MB).`,
    body,
  });
}
