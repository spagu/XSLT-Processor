/**
 * The versions under test and the machine they run on.
 *
 * 1.2.0 is the working tree. 1.1.3 is extracted from its git tag into the
 * system temporary directory (`git archive v1.1.3 | tar -x`) and gets its
 * own `npm ci --ignore-scripts`, so its CLI loads the jsdom of its own lock
 * file; the copy is reused by later runs.
 *
 * @module scripts/benchmark/versions
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { cpus, platform, release, totalmem, type } from "node:os";
import { join } from "node:path";
import {
  REPO_ROOT,
  TMP_ROOT,
  confinePath,
  systemTool,
} from "../lib/fsSafety.mjs";

/** Directory of the extracted 1.1.3 copy. */
const BASELINE_DIR = join(TMP_ROOT, "xslt-processor-bench", "v1.1.3");

/**
 * Run a system tool, throwing on failure.
 *
 * @param {string} tool - Tool name (resolved with systemTool)
 * @param {string[]} args - Arguments
 * @param {string} cwd - Working directory
 */
function run(tool, args, cwd) {
  const result = spawnSync(systemTool(tool), args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${tool} ${args.join(" ")} failed (${result.status})`);
  }
}

/**
 * Extract and install 1.1.3 unless a complete copy exists.
 *
 * @returns {string} The 1.1.3 directory
 */
function prepareBaseline() {
  if (existsSync(join(BASELINE_DIR, "node_modules", "jsdom", "package.json"))) {
    return BASELINE_DIR;
  }
  rmSync(BASELINE_DIR, { recursive: true, force: true });
  mkdirSync(BASELINE_DIR, { recursive: true });
  const archive = `${BASELINE_DIR}.tar`;
  console.log(`Extracting v1.1.3 into ${BASELINE_DIR}`);
  run("git", ["archive", "--format=tar", "-o", archive, "v1.1.3"], REPO_ROOT);
  run("tar", ["-xf", archive, "-C", BASELINE_DIR], REPO_ROOT);
  rmSync(archive);
  run(
    "npm",
    ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
    BASELINE_DIR,
  );
  return BASELINE_DIR;
}

/**
 * Directory of each version.
 *
 * @returns {Record<string, string>} Version to directory
 */
export function prepareVersions() {
  return { "1.1.3": prepareBaseline(), "1.2.0": REPO_ROOT };
}

/**
 * Version of an installed package.
 *
 * @param {string} root - Project directory
 * @param {string} name - Package name
 * @returns {string|null} Its version, or null when not installed
 */
export function packageVersion(root, name) {
  const file = confinePath(join(root, "node_modules", name, "package.json"));
  return existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8")).version
    : null;
}

/**
 * The machine and runtime a benchmark runs on, and the date.
 *
 * @returns {{date: string, cpu: string, cores: number, ramGb: number, os: string, node: string}}
 *   Machine description
 */
export function machine() {
  const cpuList = cpus();
  return {
    date: new Date().toISOString(),
    cpu: cpuList[0]?.model.trim() ?? "unknown",
    cores: cpuList.length,
    ramGb: Math.round(totalmem() / 2 ** 30),
    os: `${type()} ${release()} (${platform()})`,
    node: process.version,
  };
}

/**
 * The machine, runtime and DOM the benchmark ran with.
 *
 * @param {Record<string, string>} roots - Version to directory
 * @returns {object} Environment description for results.json
 */
export function environment(roots) {
  return {
    ...machine(),
    dom: {
      jsdom: packageVersion(REPO_ROOT, "jsdom"),
      jsdomBaselineCli: packageVersion(roots["1.1.3"], "jsdom"),
      xmldom: packageVersion(REPO_ROOT, "@xmldom/xmldom"),
    },
  };
}
