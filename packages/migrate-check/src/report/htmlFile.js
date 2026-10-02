/**
 * Writing the HTML report to disk (Node.js only); rendering it is in
 * html.js, which stays free of Node.js built-ins for the website's bundle.
 *
 * @module report/htmlFile
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Write the HTML report.
 *
 * @param {string} path - Destination, relative to the working directory
 * @param {string} html - The document from renderHtml
 * @returns {Promise<string>} The absolute path written
 */
export async function writeHtmlReport(path, html) {
  const target = resolve(path);
  // The report path is the user's own --html argument (the tool's output
  // by design), written with the user's permissions. NOSONAR
  await writeFile(target, html, "utf8"); // NOSONAR
  return target;
}
