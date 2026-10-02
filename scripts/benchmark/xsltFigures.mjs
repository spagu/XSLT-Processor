/**
 * The rewrite chart of the XSLT engine benchmark, in the style of the
 * other charts (svg.mjs): per task, on a log time axis, the 1.0 package on
 * the 1.0 stylesheet (blue), xslt3 on the same stylesheet (hollow orange)
 * and xslt3 on the idiomatic 2.0/3.0 rewrite (filled orange), with a
 * legend and the rewrite's gain as a direct label. The ratio and
 * 3.0-only charts reuse xpathFigures.mjs.
 *
 * @module scripts/benchmark/xsltFigures
 */

import { timeTicks } from "./figures.mjs";
import {
  PLOT_LEFT,
  PLOT_RIGHT,
  ROW,
  dot,
  formatMs,
  grid,
  logScale,
  r,
  rowLabel,
  svgDocument,
  text,
} from "./svg.mjs";
import { HOLLOW, hollowDot, ratioWords } from "./xpathMarks.mjs";

const ok = (m) => m?.status === "ok";

/** Right margin kept free for the gain label. */
const LABEL_SPACE = 110;

/**
 * Legend of the three marks.
 *
 * @param {number} x - Left x
 * @param {number} y - Centre y
 * @returns {string[]} Elements
 */
function rewriteLegend(x, y) {
  return [
    dot(x + 5, y, "1.0 package", "1.0 package, 1.0 stylesheet"),
    text(x + 15, y + 4, "1.0 package, 1.0 stylesheet"),
    hollowDot(x + 205, y, "xslt3", "xslt3, 1.0 stylesheet"),
    text(x + 215, y + 4, "xslt3, 1.0 stylesheet"),
    dot(x + 375, y, "xslt3", "xslt3, rewrite"),
    text(x + 385, y + 4, "xslt3, rewrite"),
  ];
}

/**
 * Chart: time of each task before and after the rewrite, on one DOM.
 *
 * @param {object[]} rows - Rewrite rows of one DOM (xsltData.rewriteRows)
 * @param {string} dom - DOM name
 * @returns {string} SVG
 */
export function rewriteChart(rows, dom) {
  const marks = (row) =>
    [
      ["1.0 package", row.one, "1.0 package, 1.0 stylesheet", dot],
      ["xslt3", row.three, "xslt3, 1.0 stylesheet", hollowDot],
      ["xslt3", row.rewrite, "xslt3, rewrite", dot],
    ].filter(([, m]) => ok(m));
  const shown = rows.filter((row) => ok(row.rewrite));
  shown.sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0));
  const times = shown.flatMap((row) =>
    marks(row).map(([, m]) => m.transform.medianMs),
  );
  const ticks = timeTicks(times);
  const right = PLOT_RIGHT - LABEL_SPACE + 20;
  const x = logScale(ticks[0].value, ticks.at(-1).value, PLOT_LEFT, right);
  const top = 78;
  const bottom = top + shown.length * ROW;
  const body = [...rewriteLegend(16, 46), ...grid(ticks, x, top, bottom)];
  shown.forEach((row, index) => {
    const y = top + index * ROW + ROW / 2;
    const xs = marks(row).map(([, m]) => x(m.transform.medianMs));
    body.push(
      rowLabel(row.label, y),
      `<line class="link" x1="${r(Math.min(...xs))}" x2="${r(Math.max(...xs))}" y1="${y}" y2="${y}"/>`,
    );
    for (const [engine, m, name, mark] of marks(row)) {
      const tip = `${row.label}, ${name} on ${dom}: median ${formatMs(m.transform.medianMs)}`;
      body.push(mark(x(m.transform.medianMs), y, engine, tip));
    }
    if (row.gain) {
      const words = `rewrite ${ratioWords(1 / row.gain)}`;
      body.push(text(Math.max(...xs) + 10, y + 4, words, "t1"));
    }
  });
  const best = shown[0];
  return svgDocument({
    height: bottom + 26,
    title: `XSLT 1.0 stylesheets and their 2.0/3.0 rewrites, median time on ${dom} (log scale)`,
    desc: `Median time of each task on ${dom}: the 1.0 package and xslt3 on the XSLT 1.0 stylesheet, and xslt3 on the idiomatic XSLT 2.0/3.0 rewrite; the largest gain is on ${best.label}, where the rewrite (${best.construct}) is ${ratioWords(1 / best.gain)} than the 1.0 stylesheet on xslt3.`,
    body,
    // Unfilled rings: a 1.0 package dot at the same time stays visible
    style: `${HOLLOW}\n.hollow{fill:none}`,
  });
}
