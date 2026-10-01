/**
 * Writing the generated parts of docs/BENCHMARKS.md: each sits between
 * `<!-- bench:NAME -->` and `<!-- /bench:NAME -->`; the prose around them
 * is hand-written. Charts are written to docs/benchmarks/.
 *
 * @module scripts/benchmark/page
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../lib/fsSafety.mjs";

/** The docs directory. */
export const DOCS = join(REPO_ROOT, "docs");

/** The benchmark page. */
export const PAGE = join(DOCS, "BENCHMARKS.md");

/**
 * Replace the generated part NAME of the page.
 *
 * @param {string} page - Markdown
 * @param {string} name - Part name
 * @param {string} content - New content
 * @returns {string} Updated Markdown
 * @throws {Error} When the markers are missing
 */
export function fill(page, name, content) {
  const open = `<!-- bench:${name} -->`;
  const close = `<!-- /bench:${name} -->`;
  const start = page.indexOf(open);
  const end = page.indexOf(close);
  if (start === -1 || end < start) {
    throw new Error(`Missing ${open} ... ${close} in docs/BENCHMARKS.md`);
  }
  return `${page.slice(0, start + open.length)}\n${content}\n${page.slice(end)}`;
}

/**
 * Write one chart and return its Markdown: the image (alt text = the
 * chart's description) followed by its data table.
 *
 * @param {string} name - File name without extension
 * @param {string} svg - SVG source
 * @param {string} dataTable - Markdown table of the chart's data
 * @returns {string} Markdown
 */
export function chart(name, svg, dataTable) {
  writeFileSync(join(DOCS, "benchmarks", `${name}.svg`), svg);
  const alt = /<desc id="d">([^<]*)<\/desc>/.exec(svg)[1];
  return `<img src="benchmarks/${name}.svg" width="720" alt="${alt}">\n\n${dataTable}`;
}
