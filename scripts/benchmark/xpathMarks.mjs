/**
 * Marks shared by the XPath charts: hollow dots for the second DOM, the
 * DOM legend and the ticks of a ratio axis.
 *
 * @module scripts/benchmark/xpathMarks
 */

import { SERIES, esc, formatFactor, r, text } from "./svg.mjs";

/**
 * Format a time ratio: as formatFactor from 0.1 up, with two significant
 * digits below ("0.0021×").
 *
 * @param {number} ratio - Ratio
 * @returns {string} The label
 */
export function formatRatio(ratio) {
  return ratio >= 0.1 ? formatFactor(ratio) : `${ratio.toPrecision(2)}×`;
}

/**
 * A ratio xslt3 ÷ 1.0 package in words: "1.25× slower", "480× faster".
 *
 * @param {number} ratio - Ratio
 * @returns {string} The phrase
 */
export function ratioWords(ratio) {
  return ratio >= 1
    ? `${formatFactor(ratio)} slower`
    : `${formatFactor(1 / ratio)} faster`;
}

/** Hollow dots (second DOM): surface fill, series-coloured ring. */
export const HOLLOW = `
.hollow{fill:var(--surface);stroke-width:2}.hollow.old{stroke:var(--old)}.hollow.new{stroke:var(--new)}`;

/**
 * A hollow dot with a tooltip.
 *
 * @param {number} x - Centre x
 * @param {number} y - Centre y
 * @param {string} series - Series (engine) name
 * @param {string} tooltip - Tooltip text
 * @returns {string} Element
 */
export function hollowDot(x, y, series, tooltip) {
  return `<circle class="${SERIES[series]} hollow" cx="${r(x)}" cy="${r(y)}" r="4.5"><title>${esc(tooltip)}</title></circle>`;
}

/**
 * Legend of the two DOMs: a filled and a hollow dot of one series.
 *
 * @param {number} x - Left x
 * @param {number} y - Centre y
 * @param {string[]} doms - DOM names, filled first
 * @returns {string[]} Elements
 */
export function domLegend(x, y, doms) {
  return doms.flatMap((dom, index) => {
    const left = x + index * 120;
    const swatch =
      index === 0
        ? `<circle class="${SERIES.xslt3}" cx="${left + 5}" cy="${y}" r="5"/>`
        : hollowDot(left + 5, y, "xslt3", dom);
    return [swatch, text(left + 15, y + 4, `xslt3, ${dom}`)];
  });
}

/**
 * Ticks of a ratio axis covering the data.
 *
 * @param {number[]} values - Ratios
 * @returns {{value: number, label: string}[]} Ticks
 */
export function ratioTicks(values) {
  const lo = Math.min(1, ...values) * 0.95;
  const hi = Math.max(1, ...values) * 1.25;
  // 1-2-5 steps over up to two decades, decades beyond
  const all =
    hi / lo > 100
      ? [0.0001, 0.001, 0.01, 0.1, 1, 10, 100, 1000]
      : [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  const first = all.findLastIndex((v) => v <= lo);
  const last = all.findIndex((v) => v >= hi);
  return all
    .slice(Math.max(0, first), last === -1 ? all.length : last + 1)
    .map((value) => ({ value, label: `${value}×` }));
}
