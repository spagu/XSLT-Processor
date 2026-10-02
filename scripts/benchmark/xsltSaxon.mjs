/**
 * SaxonJS 3 as a local reference (`--saxon-dir <dir>`): its numbers are
 * never written to the published results (see docs/BENCHMARKS.md, "SaxonJS")
 * but to a file in the system temporary directory, for the maintainers.
 *
 * Install it outside the repository, e.g.
 * `npm install --prefix /tmp/saxon saxonjs-he xslt3-he`. Each stylesheet
 * is compiled to SEF with the `xslt3-he` command (`-export -nogo`), timed
 * as its own phase; the worker then times `SaxonJS.transform()` of the SEF
 * on a tree SaxonJS parsed itself. Outputs are compared with xslt3's,
 * ignoring whitespace between tags (SaxonJS indents HTML by default).
 *
 * @module scripts/benchmark/xsltSaxon
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { measureCommand } from "./measure.mjs";
import { packageVersion } from "./versions.mjs";
import { XSLT_WORKER, checkOnce } from "./xsltCheck.mjs";
import { compareOutputs, normalizeLoose } from "./xsltCompare.mjs";
import { measureScript } from "./workerMeasure.mjs";

/**
 * Versions of the SaxonJS packages in a directory.
 *
 * @param {string} saxonDir - Directory with node_modules/saxonjs-he
 * @returns {{saxonjs: string, compiler: string}} Versions
 * @throws {Error} When either package is missing
 */
export function saxonVersions(saxonDir) {
  const saxonjs = packageVersion(saxonDir, "saxonjs-he");
  const compiler = packageVersion(saxonDir, "xslt3-he");
  if (!saxonjs || !compiler) {
    throw new Error(`saxonjs-he and xslt3-he are not installed in ${saxonDir}`);
  }
  return { saxonjs, compiler };
}

/**
 * Compile a scenario's stylesheet to SEF (t.sef.json), timing the command.
 *
 * @param {string} saxonDir - SaxonJS directory
 * @param {string} dir - Input directory
 * @param {{warmup: number, runs: number, timeoutMs: number}} settings - Runs
 * @returns {Promise<import("./measure.mjs").Measurement>} The measurement
 */
export function compileSef(saxonDir, dir, settings) {
  const cli = join(saxonDir, "node_modules", "xslt3-he", "xslt3.js");
  return measureCommand({
    ...settings,
    command: process.execPath,
    args: [cli, "-xsl:t.xsl", "-export:t.sef.json", "-nogo", "-relocate:on"],
    spawnOptions: { cwd: dir },
  });
}

/**
 * Measure one scenario with SaxonJS: SEF compilation, a checked run and
 * the timed transformations.
 *
 * @param {object} options - Options
 * @param {string} options.saxonDir - SaxonJS directory
 * @param {string} options.dir - Input directory
 * @param {string} options.reference - The DOM whose xslt3 output to compare
 * @param {{warmup: number, runs: number, timeoutMs: number}} options.settings - Runs
 * @returns {Promise<object>} `{status, sef, compile, transform, maxRssMb,
 *   sameAsXslt3}` or `{status, note}`
 */
export async function measureSaxon({ saxonDir, dir, reference, settings }) {
  const sef = await compileSef(saxonDir, dir, settings);
  if (sef.status !== "ok") return sef;
  const extra = ["--saxon-dir", saxonDir];
  const common = { engine: "saxon", dom: "saxon", dir, extra };
  const run = await checkOnce({ ...common, timeoutMs: settings.timeoutMs });
  if (run.error) return { status: "error", note: run.error };
  const mine = join(dir, `out-xslt3-${reference}.txt`);
  const difference = existsSync(mine)
    ? compareOutputs(readFileSync(mine, "utf8"), run.output, normalizeLoose)
    : undefined;
  const args = ["--engine", "saxon", "--dom", "saxon", "--dir", dir, ...extra];
  args.push(
    "--warmup",
    String(settings.warmup),
    "--runs",
    String(settings.runs),
  );
  const result = await measureScript({
    script: XSLT_WORKER,
    args,
    timeoutMs: settings.timeoutMs,
  });
  if (result.status !== "ok") return result;
  return {
    status: "ok",
    sef,
    compile: result.phases.compile,
    transform: result.phases.transform,
    maxRssMb: result.phases.transform.maxRssMb,
    sameAsXslt3: difference === undefined ? null : (difference ?? true),
  };
}
