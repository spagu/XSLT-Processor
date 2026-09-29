/**
 * Shared helpers of the Playwright specs (Node side).
 */

/** Test page loading the ESM bundle. */
export const ESM_PAGE = "/tests/browser/fixtures/esm.html";

/** Test page loading the IIFE bundle (see its query parameters). */
export const IIFE_PAGE = "/tests/browser/fixtures/iife.html";

/**
 * Open a test page and wait until its bundle is loaded.
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {string} path - Page path, with an optional query string
 * @returns {Promise<void>}
 */
export async function openPage(page, path) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(path);
  await page.waitForFunction(() => window.ready === true, null, {
    timeout: 10_000,
  });
  if (errors.length > 0) {
    throw new Error(`Page errors: ${errors.join("; ")}`);
  }
}

/**
 * Normalise serialized markup for a native-vs-library comparison.
 *
 * Only differences that DOM serializers are free to make are removed:
 * whitespace-only runs between tags, the order of attributes within a start
 * tag, `<a></a>` versus `<a/>` (XMLSerializer writes HTML elements with an
 * end tag), the space before `/>` of an empty-element tag, and the XML
 * declaration (Chrome's XMLSerializer writes one for XSLT result documents,
 * the other engines do not).
 *
 * @param {string|null} text - Serialized result
 * @returns {string|null} Normalised text
 *
 * @example
 * normalizeMarkup('<a y="2" x="1">\n  <b/>\n</a>'); // '<a x="1" y="2"><b/></a>'
 */
export function normalizeMarkup(text) {
  if (text === null || text === undefined) return null;
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*<\?xml\s[^?]*\?>/, "")
    .replace(/>\s+</g, "><")
    .replace(/\s+\/>/g, "/>")
    .replace(
      /<([A-Za-z_][\w.:-]*)((?:\s+[^\s="'<>/]+="[^"]*")*)><\/\1>/g,
      "<$1$2/>",
    )
    .replace(
      /<([A-Za-z_][\w.:-]*)((?:\s+[^\s="'<>/]+="[^"]*")+)\s*(\/?)>/g,
      (_, name, attributes, slash) =>
        `<${name} ${attributes
          .match(/[^\s="'<>/]+="[^"]*"/g)
          .sort()
          .join(" ")}${slash}>`,
    )
    .trim();
}

/**
 * Render rows as a fixed-width text table.
 *
 * @param {string[]} header - Column titles
 * @param {string[][]} rows - Cell values
 * @returns {string} Table, one line per row
 */
export function textTable(header, rows) {
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => String(row[column]).length)),
  );
  const line = (cells) =>
    cells
      .map((cell, column) => String(cell).padEnd(widths[column]))
      .join(" | ");
  return [
    line(header),
    widths.map((width) => "-".repeat(width)).join("-+-"),
    ...rows.map(line),
  ].join("\n");
}
