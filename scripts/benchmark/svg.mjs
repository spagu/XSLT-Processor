/**
 * SVG building blocks of the benchmark charts: the colour tokens (light and
 * dark, switched inside the SVG with `prefers-color-scheme`), the root
 * element with its accessible title and description, text, dots, the
 * legend, log scales and number formatting.
 *
 * Series colours were validated for colour-vision deficiencies:
 * 1.2.0 blue, 1.1.3 orange. The XPath charts reuse the pair, one colour per
 * engine: the root package (whose current tree 1.2.0 is) blue, xslt3
 * orange. Text never uses a series colour.
 *
 * @module scripts/benchmark/svg
 */

/** Chart width in px (the viewBox scales it). */
export const WIDTH = 720;

/** Colour tokens and classes, light by default, dark on request. */
const STYLE = `
svg{--surface:#ffffff;--text:#1f2937;--muted:#5f6368;--grid:#e8eaed;--axis:#bdc1c6;--new:#2a78d6;--old:#eb6834;
font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:12px}
@media (prefers-color-scheme:dark){svg{--surface:#202124;--text:#e8eaed;--muted:#9aa0a6;--grid:#3c4043;--axis:#5f6368;--new:#3987e5;--old:#d95926}}
.bg{fill:var(--surface)}.t1{fill:var(--text)}.t2{fill:var(--muted)}
.title{fill:var(--text);font-size:13px;font-weight:600}
.grid{stroke:var(--grid);stroke-width:1}.axis{stroke:var(--axis);stroke-width:1}
.ref{stroke:var(--muted);stroke-width:1;stroke-dasharray:3 3}
.link{stroke:var(--axis);stroke-width:2}
.new{fill:var(--new)}.old{fill:var(--old)}
.ring{stroke:var(--surface);stroke-width:2}`;

/** CSS class of each version's (or XPath engine's) series colour. */
export const SERIES = Object.freeze({
  "1.2.0": "new",
  "1.1.3": "old",
  "1.0 package": "new",
  xslt3: "old",
});

/**
 * Escape text for SVG content and attributes.
 *
 * @param {string|number} value - Text
 * @returns {string} Escaped text
 */
export function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * The SVG document.
 *
 * @param {object} options - Chart options
 * @param {number} options.height - Height in px
 * @param {string} options.title - Accessible title (also drawn)
 * @param {string} options.desc - Accessible summary of the finding
 * @param {string[]} options.body - Elements
 * @param {string} [options.style=""] - Extra CSS appended to the tokens
 * @returns {string} SVG source
 */
export function svgDocument({ height, title, desc, body, style = "" }) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" ` +
    `viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="t d">\n` +
    `<title id="t">${esc(title)}</title>\n<desc id="d">${esc(desc)}</desc>\n` +
    `<style>${STYLE}${style}\n</style>\n` +
    `<rect class="bg" width="${WIDTH}" height="${height}" rx="8"/>\n` +
    `<text class="title" x="16" y="24">${esc(title)}</text>\n` +
    `${body.join("\n")}\n</svg>\n`
  );
}

/**
 * A text element.
 *
 * @param {number} x - x
 * @param {number} y - Baseline y
 * @param {string} content - Text
 * @param {string} [cls="t1"] - Class
 * @param {string} [anchor="start"] - text-anchor
 * @returns {string} Element
 */
export function text(x, y, content, cls = "t1", anchor = "start") {
  return `<text class="${cls}" x="${r(x)}" y="${r(y)}" text-anchor="${anchor}">${esc(content)}</text>`;
}

/**
 * A dot (8 px diameter plus a 2 px surface ring) with a native tooltip.
 *
 * @param {number} x - Centre x
 * @param {number} y - Centre y
 * @param {string} version - Version (picks the series colour)
 * @param {string} tooltip - Tooltip text
 * @returns {string} Element
 */
export function dot(x, y, version, tooltip) {
  return `<circle class="${SERIES[version]} ring" cx="${r(x)}" cy="${r(y)}" r="5"><title>${esc(tooltip)}</title></circle>`;
}

/**
 * Legend at the top: one swatch and label per version.
 *
 * @param {number} x - Left x
 * @param {number} y - Centre y
 * @param {string[]} versions - Versions in legend order
 * @param {"dot"|"bar"} [shape="dot"] - Swatch shape, as the marks
 * @param {number} [step=72] - Distance between two entries, px
 * @returns {string[]} Elements
 */
export function legend(x, y, versions, shape = "dot", step = 72) {
  return versions.flatMap((version, index) => {
    const left = x + index * step;
    const swatch =
      shape === "dot"
        ? `<circle class="${SERIES[version]}" cx="${left + 5}" cy="${y}" r="5"/>`
        : `<rect class="${SERIES[version]}" x="${left}" y="${y - 5}" width="10" height="10" rx="2"/>`;
    return [swatch, text(left + 15, y + 4, version)];
  });
}

/**
 * A log10 scale.
 *
 * @param {number} min - Domain minimum (> 0)
 * @param {number} max - Domain maximum
 * @param {number} left - Range start x
 * @param {number} right - Range end x
 * @returns {(value: number) => number} The scale
 */
export function logScale(min, max, left, right) {
  const lo = Math.log10(min);
  const span = Math.log10(max) - lo;
  return (value) => left + ((Math.log10(value) - lo) / span) * (right - left);
}

/**
 * Round a coordinate to 0.1 px.
 *
 * @param {number} value - Coordinate
 * @returns {number} Rounded coordinate
 */
export function r(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Format a duration: "840 ms", "1.27 s", "63 s".
 *
 * @param {number} ms - Milliseconds
 * @returns {string} The label
 */
export function formatMs(ms) {
  if (ms < 1000) return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;
  const s = ms / 1000;
  return `${s < 10 ? s.toFixed(2) : s.toFixed(1)} s`;
}

/**
 * Format a speed-up factor: "1.24×", "11.6×", "1,160×".
 *
 * @param {number} factor - Factor
 * @returns {string} The label
 */
export function formatFactor(factor) {
  if (factor >= 100) return `${Math.round(factor).toLocaleString("en-US")}×`;
  return `${factor >= 10 ? factor.toFixed(1) : factor.toFixed(2)}×`;
}

/** Left edge of the plot (row labels sit to its left). */
export const PLOT_LEFT = 250;
/** Right edge of the plot. */
export const PLOT_RIGHT = WIDTH - 70;
/** Row height. */
export const ROW = 28;

/**
 * Vertical gridlines with tick labels below the plot.
 *
 * @param {{value: number, label: string}[]} ticks - Ticks
 * @param {(value: number) => number} x - Scale
 * @param {number} top - Plot top
 * @param {number} bottom - Plot bottom
 * @returns {string[]} Elements
 */
export function grid(ticks, x, top, bottom) {
  return ticks.flatMap(({ value, label }) => [
    `<line class="grid" x1="${r(x(value))}" x2="${r(x(value))}" y1="${top}" y2="${bottom}"/>`,
    text(x(value), bottom + 16, label, "t2", "middle"),
  ]);
}

/**
 * Row label, right-aligned against the plot.
 *
 * @param {string} label - Scenario label
 * @param {number} y - Row centre
 * @returns {string} Element
 */
export function rowLabel(label, y) {
  return text(PLOT_LEFT - 16, y + 4, label, "t1", "end");
}
