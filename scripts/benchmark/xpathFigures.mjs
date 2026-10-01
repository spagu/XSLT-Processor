/**
 * Charts of the XPath benchmark as SVG strings, in the style of the 1.1.3
 * vs 1.2.0 charts (figures.mjs): one colour per engine (svg.mjs SERIES),
 * log axes, a legend and direct labels.
 *
 * - engineTimeChart: median time per scenario of both engines on one DOM;
 * - ratioChart: xslt3 time ÷ 1.0 package time per scenario, jsdom as
 *   filled dots and xmldom as hollow ones;
 * - only31Chart: median time of the xslt3-only scenarios per DOM.
 *
 * @module scripts/benchmark/xpathFigures
 */

import { directLabels, timeTicks } from "./figures.mjs";
import { ENGINE_ORDER } from "./xpathEngines.mjs";
import {
  HOLLOW,
  domLegend,
  formatRatio,
  hollowDot,
  ratioTicks,
  ratioWords,
} from "./xpathMarks.mjs";
import {
  PLOT_LEFT,
  PLOT_RIGHT,
  ROW,
  dot,
  formatMs,
  grid,
  legend,
  logScale,
  r,
  rowLabel,
  svgDocument,
  text,
} from "./svg.mjs";

const ok = (m) => m?.status === "ok";

/**
 * Chart: median time of the compiled expression per scenario, both engines.
 *
 * @param {import("./xpathData.mjs").XPathRow[]} rows - Shared rows of a DOM
 * @param {string} dom - DOM name
 * @returns {string} SVG
 */
export function engineTimeChart(rows, dom) {
  const pointsOf = (row) =>
    [
      { version: ENGINE_ORDER[0], m: row.one },
      { version: "xslt3", m: row.three },
    ]
      .filter((p) => ok(p.m))
      .map((p) => ({ version: p.version, m: p.m.compiled }));
  const shown = rows.filter((row) => pointsOf(row).length);
  const key = (row) => Math.max(...pointsOf(row).map((p) => p.m.medianMs));
  shown.sort((a, b) => key(b) - key(a));
  const ticks = timeTicks(
    shown.flatMap((row) => pointsOf(row).map((p) => p.m.medianMs)),
  );
  const x = logScale(ticks[0].value, ticks.at(-1).value, PLOT_LEFT, PLOT_RIGHT);
  const top = 78;
  const bottom = top + shown.length * ROW;
  const body = [
    ...legend(PLOT_LEFT, 46, ENGINE_ORDER, "dot", 110),
    ...grid(ticks, x, top, bottom),
  ];
  shown.forEach((row, index) => {
    const y = top + index * ROW + ROW / 2;
    const points = pointsOf(row);
    body.push(rowLabel(row.label, y));
    if (points.length === 2) {
      const [a, b] = points.map((p) => r(x(p.m.medianMs)));
      body.push(`<line class="link" x1="${a}" x2="${b}" y1="${y}" y2="${y}"/>`);
    }
    for (const { version, m } of points) {
      const tip = `${row.label}, ${version} on ${dom}: median ${formatMs(m.medianMs)}`;
      body.push(dot(x(m.medianMs), y, version, tip));
    }
    if (index === 0) body.push(...directLabels(points, x, y));
  });
  const slower = shown.filter((row) => row.ratio > 1).length;
  return svgDocument({
    height: bottom + 26,
    title: `XPath median time per scenario on ${dom}, 1.0 package and xslt3 (log scale)`,
    desc: `Median time of each compiled expression on ${dom}: xslt3 (XPath 3.1) is slower than the 1.0 package (XPath 1.0) in ${slower} of ${shown.length} scenarios.`,
    body,
  });
}

/**
 * Chart: time ratio xslt3 ÷ 1.0 package per scenario and DOM.
 *
 * @param {Record<string, import("./xpathData.mjs").XPathRow[]>} byDom -
 *   Shared rows by DOM (the first DOM is drawn filled)
 * @returns {string} SVG
 */
export function ratioChart(byDom) {
  const doms = Object.keys(byDom);
  const [main] = doms;
  const ratioOf = (dom, id) => byDom[dom].find((row) => row.id === id)?.ratio;
  const shown = byDom[main]
    .filter((row) => row.ratio)
    .sort((a, b) => b.ratio - a.ratio);
  const ticks = ratioTicks(
    doms.flatMap((dom) => byDom[dom].map((row) => row.ratio).filter(Boolean)),
  );
  const x = logScale(ticks[0].value, ticks.at(-1).value, PLOT_LEFT, PLOT_RIGHT);
  const top = 92;
  const bottom = top + shown.length * ROW;
  const body = [
    text(
      16,
      44,
      "xslt3 median time ÷ 1.0 package median time; right of the dashed line xslt3 is slower",
      "t2",
    ),
    ...domLegend(PLOT_LEFT, 66, doms),
    ...grid(ticks, x, top, bottom),
    `<line class="ref" x1="${r(x(1))}" x2="${r(x(1))}" y1="${top - 4}" y2="${bottom}"/>`,
  ];
  shown.forEach((row, index) => {
    const y = top + index * ROW + ROW / 2;
    body.push(rowLabel(row.label, y));
    const values = doms.map((dom) => ratioOf(dom, row.id)).filter(Boolean);
    doms.forEach((dom, slot) => {
      const ratio = ratioOf(dom, row.id);
      if (!ratio) return;
      const tip = `${row.label} on ${dom}: xslt3 is ${ratioWords(ratio)} than the 1.0 package (${formatRatio(ratio)} the time)`;
      body.push(
        slot === 0
          ? dot(x(ratio), y, "xslt3", tip)
          : hollowDot(x(ratio), y, "xslt3", tip),
      );
    });
    const right = x(Math.max(...values));
    body.push(text(right + 10, y + 4, formatRatio(row.ratio), "t1"));
  });
  const [worst, best] = [shown[0], shown.at(-1)];
  return svgDocument({
    height: bottom + 26,
    title: "XPath time ratio, xslt3 ÷ 1.0 package, per scenario (log scale)",
    desc: `On ${main}, xslt3 is ${ratioWords(worst.ratio)} than the 1.0 package on ${worst.label}, its largest time ratio (${formatRatio(worst.ratio)}), and ${ratioWords(best.ratio)} on ${best.label} (${formatRatio(best.ratio)}); the dashed line marks equal speed.`,
    body,
    style: HOLLOW,
  });
}

/**
 * Chart: median time of the xslt3-only scenarios per DOM.
 *
 * @param {Record<string, import("./xpathData.mjs").XPathRow[]>} byDom -
 *   xpath31 rows by DOM (the first DOM is drawn filled)
 * @returns {string} SVG
 */
export function only31Chart(byDom) {
  const doms = Object.keys(byDom);
  const [main] = doms;
  const timeOf = (dom, id) => {
    const m = byDom[dom].find((row) => row.id === id)?.three;
    return ok(m) ? m.compiled.medianMs : null;
  };
  const shown = byDom[main]
    .filter((row) => ok(row.three))
    .sort((a, b) => timeOf(main, b.id) - timeOf(main, a.id));
  const ticks = timeTicks(
    doms
      .flatMap((dom) => shown.map((row) => timeOf(dom, row.id)))
      .filter(Boolean),
  );
  const x = logScale(ticks[0].value, ticks.at(-1).value, PLOT_LEFT, PLOT_RIGHT);
  const top = 78;
  const bottom = top + shown.length * ROW;
  const body = [
    ...domLegend(PLOT_LEFT, 46, doms),
    ...grid(ticks, x, top, bottom),
  ];
  shown.forEach((row, index) => {
    const y = top + index * ROW + ROW / 2;
    body.push(rowLabel(row.label, y));
    doms.forEach((dom, slot) => {
      const ms = timeOf(dom, row.id);
      if (ms == null) return;
      const tip = `${row.label}, xslt3 on ${dom}: median ${formatMs(ms)}`;
      body.push(
        slot === 0
          ? dot(x(ms), y, "xslt3", tip)
          : hollowDot(x(ms), y, "xslt3", tip),
      );
    });
    const right = Math.max(...doms.map((dom) => timeOf(dom, row.id) ?? 0));
    body.push(text(x(right) + 10, y + 4, formatMs(timeOf(main, row.id)), "t1"));
  });
  const slowest = shown[0];
  return svgDocument({
    height: bottom + 26,
    title: "XPath 3.1-only expressions, xslt3 median time (log scale)",
    desc: `Median time of the compiled XPath 3.1 expressions that XPath 1.0 cannot express; the slowest is ${slowest.label} (${formatMs(timeOf(main, slowest.id))} on ${main}).`,
    body,
    style: HOLLOW,
  });
}
