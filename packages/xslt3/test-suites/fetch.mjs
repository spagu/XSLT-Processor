#!/usr/bin/env node
/**
 * Download the W3C test suites run against @tradik/xslt3.
 *
 * Usage: node packages/xslt3/test-suites/fetch.mjs [qt3|xslt30|all] [--force]
 *
 * Each suite is the codeload tarball of the commit pinned in constants.mjs,
 * checked against the pinned SHA-256 and extracted with the system `tar`
 * into `<tmpdir>/xslt3-suites/<name>-<commit>/`. A stamp file records the
 * verified digest, so a second run is a no-op unless `--force` is given.
 *
 * @module test-suites/fetch
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { confinePath, systemTool } from "../../../scripts/lib/fsSafety.mjs";
import { SUITES, SUITES_ROOT, suiteDir, tarballUrl } from "./constants.mjs";

/**
 * Compute the hex SHA-256 digest of a buffer.
 *
 * @param {Uint8Array} data - Bytes to hash
 * @returns {string} Lower case hex digest
 */
export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Check a downloaded tarball's digest against the pinned one.
 *
 * @param {import('./constants.mjs').SuiteSpec} suite - Suite
 * @param {string} digest - Digest of the download
 * @returns {string} A notice to print when nothing is pinned yet, else ""
 * @throws {Error} On a mismatch with the pinned digest
 */
export function verifyDigest(suite, digest) {
  if (suite.sha256 === null) {
    return `${suite.name}: no SHA-256 pinned, pin sha256: "${digest}" in constants.mjs`;
  }
  if (digest !== suite.sha256) {
    throw new Error(
      `Checksum mismatch for ${suite.repo}@${suite.commit}: ` +
        `expected ${suite.sha256}, got ${digest}`,
    );
  }
  return "";
}

/**
 * Resolve the suite names of a command line selector.
 *
 * @param {string} [selector] - "qt3", "xslt30" or "all" (default)
 * @returns {string[]} Suite names
 * @throws {Error} On an unknown selector
 */
export function selectSuites(selector = "all") {
  if (selector === "all") return Object.keys(SUITES);
  if (!Object.hasOwn(SUITES, selector)) {
    throw new Error(`Unknown suite "${selector}", use qt3, xslt30 or all`);
  }
  return [selector];
}

/**
 * Download, verify and extract one suite.
 *
 * @param {string} name - Suite name
 * @param {object} [options] - Options
 * @param {boolean} [options.force] - Re-download even when already present
 * @returns {Promise<string>} The suite directory
 */
export async function fetchSuite(name, { force = false } = {}) {
  const suite = SUITES[name];
  const dir = confinePath(suiteDir(suite));
  const stamp = join(dir, ".sha256");
  if (!force && existsSync(stamp)) {
    const recorded = (await readFile(stamp, "utf8")).trim();
    if (suite.sha256 === null || recorded === suite.sha256) return dir;
  }

  const url = tarballUrl(suite);
  console.log(`Downloading ${url}`);
  const response = await globalThis.fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status} ${url}`);
  }
  const tarball = new Uint8Array(await response.arrayBuffer());
  const digest = sha256(tarball);
  const notice = verifyDigest(suite, digest);
  if (notice) console.warn(notice);

  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const archive = confinePath(join(SUITES_ROOT, `${name}-${suite.commit}.tgz`));
  await writeFile(archive, tarball);
  try {
    execFileSync(
      systemTool("tar"),
      ["-xzf", archive, "-C", dir, "--strip-components=1"],
      { stdio: "inherit" },
    );
  } finally {
    await rm(archive, { force: true });
  }
  await writeFile(stamp, `${digest}\n`);
  console.log(`${suite.repo} ready in ${dir}`);
  return dir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const selector = args.find((arg) => !arg.startsWith("--"));
  const force = args.includes("--force");
  (async () => {
    for (const name of selectSuites(selector)) {
      await fetchSuite(name, { force });
    }
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
