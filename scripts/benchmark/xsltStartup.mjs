/**
 * Start-up costs of the two engines: the browser bundle of each (built
 * the way the website builds the @tradik/xslt3 playground bundle: one
 * minified ES module, site/scripts/vendor.mjs) with its gzip and Brotli
 * sizes, and the time a fresh Node.js process takes to `import()` each
 * package, from source and from the bundle.
 *
 * @module scripts/benchmark/xsltStartup
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { buildXslt3Bundle } from "../../site/scripts/vendor.mjs";
import { REPO_ROOT } from "../lib/fsSafety.mjs";
import { runChild, summarize } from "./measure.mjs";

/** Package entries by engine name. */
export const ENTRIES = Object.freeze({
  "1.0 package": "src/index.js",
  xslt3: "packages/xslt3/src/index.js",
});

/**
 * Sizes of a file: as written, gzip (level 9) and Brotli (default level).
 *
 * @param {Buffer} bytes - File content
 * @returns {{raw: number, gzip: number, brotli: number}} Sizes in bytes
 */
export function sizesOf(bytes) {
  return {
    raw: bytes.length,
    gzip: gzipSync(bytes, { level: 9 }).length,
    brotli: brotliCompressSync(bytes).length,
  };
}

/**
 * Script that imports a module and prints the time `import()` took.
 *
 * @param {string} url - Module URL
 * @returns {string} Source of an ES module
 */
export function importProbe(url) {
  return (
    "const start = process.hrtime.bigint();" +
    `await import(${JSON.stringify(url)});` +
    "const ms = Number(process.hrtime.bigint() - start) / 1e6;" +
    'console.log(JSON.stringify({ type: "import", ms }));'
  );
}

/**
 * Median import time of a module, one fresh process per run.
 *
 * @param {string} file - Module path
 * @param {{warmup: number, runs: number, timeoutMs: number}} settings - Runs
 * @returns {Promise<import("./measure.mjs").Measurement>} The measurement
 */
export async function importTime(file, { warmup, runs, timeoutMs }) {
  const args = [
    "--input-type=module",
    "-e",
    importProbe(pathToFileURL(file).href),
  ];
  const times = [];
  for (let index = 0; index < warmup + runs; index++) {
    let ms = null;
    const onLine = (line) => {
      if (line.startsWith('{"type":"import"')) ms = JSON.parse(line).ms;
    };
    const result = await runChild(
      process.execPath,
      args,
      {},
      timeoutMs,
      onLine,
    );
    if (ms === null) {
      return { status: "error", note: result.stderr.trim().split("\n")[0] };
    }
    if (index >= warmup) times.push(ms);
  }
  return summarize(times, warmup, null);
}

/**
 * Bundle sizes and import times of both engines.
 *
 * @param {string} tmp - Directory for the bundles
 * @param {{warmup: number, runs: number, timeoutMs: number}} settings - Runs
 * @returns {Promise<object[]>} One row per engine: `{engine, bundle,
 *   importSource, importBundle}`
 */
export async function measureStartup(tmp, settings) {
  const rows = [];
  for (const [engine, entry] of Object.entries(ENTRIES)) {
    const outfile = join(tmp, `${engine.replaceAll(" ", "-")}.min.js`);
    await buildXslt3Bundle({ entry: join(REPO_ROOT, entry), outfile });
    const row = {
      engine,
      entry,
      bundle: sizesOf(readFileSync(outfile)),
      importSource: await importTime(join(REPO_ROOT, entry), settings),
      importBundle: await importTime(outfile, settings),
    };
    console.log(
      `startup ${engine.padEnd(12)} bundle ${row.bundle.raw} B (${row.bundle.gzip} B gzip), ` +
        `import ${row.importSource.medianMs} ms source, ${row.importBundle.medianMs} ms bundle`,
    );
    rows.push(row);
  }
  return rows;
}
