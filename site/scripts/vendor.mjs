/**
 * Browser bundles of the site: @tradik/xslt3 for the playground's XSLT 3.0
 * and XPath 3.1 modes (one bundle for both), and xslt-migrate-check's
 * analysis for the online check (/check/).
 *
 * The package has no build of its own yet, so the site bundles its source
 * (packages/xslt3/src/index.js) into one minified ES module with esbuild.
 * The playground loads it with import() only when one of those modes is
 * opened, so visitors who stay with XSLT 1.0 never download it.
 *
 * @module vendor
 */

import { readFileSync, writeFileSync } from "node:fs";
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

/** File name of the online check's bundle below site/static/vendor/. */
export const MIGRATE_CHECK_BUNDLE = "migrate-check.browser.min.js";

/**
 * Hide the file names of CDN URLs in a bundle from ssg's fingerprinting:
 * ssg rewrites an asset's file name next to a quote or slash in every page
 * and script (spagu/ssg#316), so the CDN URL of the library's browser bundle
 * would get a hashed name that does not exist on the CDN. Writing the dot
 * before "js" as the escape \x2e keeps the string the same at run time.
 *
 * @param {string} code - Bundle source
 * @returns {string} The source with every CDN URL's ".js" escaped
 */
export function protectCdnNames(code) {
  return code.replace(
    /(https:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com)\/npm\/[^"'`\s\\]*?)\.js(?=["'`\s\\])/g,
    String.raw`$1\x2ejs`,
  );
}

/**
 * esbuild plugin that fails the build on any Node.js built-in: the online
 * check's bundle must use only the pure modules of xslt-migrate-check
 * (analyze, report/html, ignore), never the CLI's file system code.
 */
export const noNodeBuiltins = {
  name: "no-node-builtins",
  setup(build) {
    build.onResolve({ filter: /^node:/ }, ({ path, importer }) => ({
      errors: [
        {
          text: `${path} imported by ${importer}: not available in the browser`,
        },
      ],
    }));
  },
};

/**
 * Bundle a module as a minified ES module for browsers.
 *
 * @param {object} options - Paths
 * @param {string} options.entry - The entry module
 * @param {string} options.outfile - Where to write the bundle
 * @param {string[]} [options.external] - Packages left as imports
 * @param {object[]} [options.plugins] - esbuild plugins
 * @param {(code: string) => string} [options.transform] - Rewrites the
 *   written bundle
 * @returns {Promise<{ raw: number, gzip: number }>} Size of the bundle in
 *   bytes, as written and gzip-compressed
 */
async function bundleForBrowser({
  entry,
  outfile,
  external = [],
  plugins = [],
  transform = (code) => code,
}) {
  await build({
    entryPoints: [entry],
    external,
    plugins,
    outfile,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    minify: true,
    legalComments: "none",
    logLevel: "warning",
  });
  writeFileSync(outfile, transform(readFileSync(outfile, "utf8")));
  const bytes = readFileSync(outfile);
  return { raw: bytes.length, gzip: gzipSync(bytes).length };
}

/**
 * Bundle @tradik/xslt3 as a minified ES module for browsers.
 *
 * @param {object} options - Paths
 * @param {string} options.entry - The package entry (packages/xslt3/src/index.js)
 * @param {string} options.outfile - Where to write the bundle
 * @param {string[]} [options.external] - Packages left as imports (the 1.0
 *   package's dynamic `import("@tradik/xslt3")` stays out of its bundle)
 * @returns {Promise<{ raw: number, gzip: number }>} Size of the bundle in
 *   bytes, as written and gzip-compressed
 */
export function buildXslt3Bundle({ entry, outfile, external = [] }) {
  return bundleForBrowser({ entry, outfile, external });
}

/**
 * Bundle the online check's entry (migrate-check-entry.mjs: the analysis,
 * the HTML report renderer and the CLI's ignored directories) for browsers,
 * with its CDN URLs protected from fingerprinting (protectCdnNames).
 *
 * @param {object} options - Paths
 * @param {string} options.entry - site/scripts/migrate-check-entry.mjs
 * @param {string} options.outfile - Where to write the bundle
 * @returns {Promise<{ raw: number, gzip: number }>} Size of the bundle in
 *   bytes, as written and gzip-compressed
 */
export function buildMigrateCheckBundle({ entry, outfile }) {
  return bundleForBrowser({
    entry,
    outfile,
    plugins: [noNodeBuiltins],
    transform: protectCdnNames,
  });
}
