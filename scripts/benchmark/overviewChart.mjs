/**
 * The "all versions" chart: median time of every version per shared
 * scenario, one row per scenario on a log time axis. Each version has its
 * own lane in the row (close times would hide each other on one line), its
 * own colour and its own shape, so the series stay apart without colour.
 *
 * @module scripts/benchmark/overviewChart
 */

import { timeTicks } from "./figures.mjs";
import {
  PLOT_LEFT,
  PLOT_RIGHT,
  esc,
  formatMs,
  grid,
  logScale,
  r,
  rowLabel,
  svgDocument,
  text,
} from "./svg.mjs";

/** Series colours, oldest version first (light, then dark). */
const SERIES_STYLE = `
svg{--v0:#b06000;--v1:#9334e6;--v2:#1a73e8;--v3:#188038}
@media (prefers-color-scheme:dark){svg{--v0:#fcad70;--v1:#c58af9;--v2:#8ab4f8;--v3:#81c995}}
.v0{fill:var(--v0)}.v1{fill:var(--v1)}.v2{fill:var(--v2)}.v3{fill:var(--v3)}`;

/** Space between two legend entries, px. */
const LEGEND_STEP = 110;
/** Height of one version's lane in a scenario row, px. */
const LANE = 11;
/** Row height: four lanes and a gap. */
const ROW = 4 * LANE + 12;

/**
 * A version mark (circle, square, diamond, triangle) centred on (x, y).
 *
 * @param {number} index - Version index
 * @param {number} x - Centre x
 * @param {number} y - Centre y
 * @param {string} [tooltip] - Tooltip text
 * @returns {string} Element
 */
export function mark(index, x, y, tooltip) {
  const tip = tooltip ? `<title>${esc(tooltip)}</title>` : "";
  const cls = `class="v${index} ring"`;
  const point = (dx, dy) => `${r(x + dx)},${r(y + dy)}`;
  const shapes = [
    `<circle ${cls} cx="${r(x)}" cy="${r(y)}" r="5">${tip}</circle>`,
    `<rect ${cls} x="${r(x - 5)}" y="${r(y - 5)}" width="10" height="10" rx="1">${tip}</rect>`,
    `<polygon ${cls} points="${point(0, -6)} ${point(6, 0)} ${point(0, 6)} ${point(-6, 0)}">${tip}</polygon>`,
    `<polygon ${cls} points="${point(0, -6)} ${point(6, 5)} ${point(-6, 5)}">${tip}</polygon>`,
  ];
  return shapes[index];
}

/**
 * The chart.
 *
 * @param {import("./overviewData.mjs").OverviewRow[]} rows - Rows
 * @param {string[]} versions - Version labels
 * @returns {string} SVG
 */
export function overviewChart(rows, versions) {
  const times = rows.flatMap((row) =>
    row.cells.filter((c) => c.ms).map((c) => c.ms),
  );
  const ticks = timeTicks(times);
  const x = logScale(
    ticks[0].value,
    ticks[ticks.length - 1].value,
    PLOT_LEFT,
    PLOT_RIGHT,
  );
  const top = 78;
  const bottom = top + rows.length * ROW;
  const body = [
    ...versions.flatMap((v, i) => {
      const left = PLOT_LEFT + i * LEGEND_STEP;
      return [mark(i, left + 5, 46), text(left + 15, 50, v)];
    }),
    ...grid(ticks, x, top, bottom),
  ];
  rows.forEach((row, index) => {
    const y = top + index * ROW + ROW / 2;
    body.push(rowLabel(row.label, y));
    if (index) {
      body.push(
        `<line class="grid" x1="${PLOT_LEFT}" x2="${PLOT_RIGHT}" y1="${top + index * ROW}" y2="${top + index * ROW}"/>`,
      );
    }
    row.cells.forEach((c, i) => {
      const lane = y + (i - 1.5) * LANE;
      if (c.ms) {
        const tip = `${row.label}, ${versions[i]}: median ${formatMs(c.ms)}`;
        body.push(mark(i, x(c.ms), lane, tip));
      } else {
        const note = `${versions[i]}: ${c.status}`;
        body.push(text(PLOT_LEFT + 4, lane + 4, note, "t2"));
      }
    });
  });
  return svgDocument({
    height: bottom + 26,
    title: "Median time per scenario, every version (jsdom, log scale)",
    desc: `Median time of ${rows.length} XSLT 1.0 scenarios on ${versions.join(", ")}; further left is faster.`,
    body,
    style: SERIES_STYLE,
  });
}
