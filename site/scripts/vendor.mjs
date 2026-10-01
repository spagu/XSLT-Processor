/**
 * Browser bundle of @tradik/xslt3 for the playground's XPath 3.1 mode.
 *
 * The package has no build of its own yet, so the site bundles its source
 * (packages/xslt3/src/index.js) into one minified ES module with esbuild.
 * The playground loads it with import() only when XPath 3.1 mode is opened,
 * so visitors who stay with XSLT 1.0 never download it.
 *
 * @module vendor
 */

import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

/** File name of the bundle below site/static/vendor/. */
export const XSLT3_BUNDLE = "xslt3.browser.min.js";

/**
 * A byte count as kilobytes with one decimal ("123.4 kB").
 *
 * @param {number} bytes - Size in bytes
 * @returns {string} The size for people
 */
export function formatSize(bytes) {
  return `${(bytes / 1000).toFixed(1)} kB`;
}

/**
 * Bundle @tradik/xslt3 as a minified ES module for browsers.
 *
 * @param {object} options - Paths
 * @param {string} options.entry - The package entry (packages/xslt3/src/index.js)
 * @param {string} options.outfile - Where to write the bundle
 * @returns {Promise<{ raw: number, gzip: number }>} Size of the bundle in
 *   bytes, as written and gzip-compressed
 */
export async function buildXslt3Bundle({ entry, outfile }) {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    minify: true,
    legalComments: "none",
    logLevel: "warning",
  });
  const bytes = readFileSync(outfile);
  return { raw: bytes.length, gzip: gzipSync(bytes).length };
}
