#!/usr/bin/env node
/**
 * Build standalone `xslt` executables (Node.js Single Executable Apps).
 *
 * Usage:
 *   node scripts/binaries/build.mjs [--target <list>] [--node-version <v>] [--out <dir>]
 *   node scripts/binaries/build.mjs checksums [--out <dir>]
 *
 *   --target        host (default), all, or a comma separated list of
 *                   linux-x64, linux-arm64, darwin-x64, darwin-arm64, windows-x64
 *   --node-version  Official Node.js release embedded in the executables,
 *                   25.5.0 or newer (default: the running node's version)
 *   --out           Output directory (default: dist-bin)
 *
 * Writes <out>/xslt-<os>-<arch>[.exe] and <out>/checksums.sha256, which
 * covers every executable present in <out>. The `checksums` command only
 * rewrites checksums.sha256 (used after collecting binaries built on
 * several machines) and needs no installed dependencies: esbuild is loaded
 * only when a binary is built. Needs network access to nodejs.org on first
 * use.
 */

import { confinePath } from "../lib/fsSafety.mjs";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { writeChecksums } from "./checksums.mjs";
import { assertSeaVersion, officialNode } from "./node-dist.mjs";
import { buildExecutable } from "./sea.mjs";
import {
  DIST_BIN_DIR,
  binaryName,
  hostTarget,
  isHost,
  parseTargets,
} from "./targets.mjs";

/** Bytes per mebibyte, for size reports. */
const MIB = 1024 * 1024;

/**
 * Build the requested executables and their checksums.
 *
 * @param {object} options - Parsed command line options
 * @param {string} options.target - Target list
 * @param {string} options.nodeVersion - Node.js version to embed
 * @param {string} options.out - Output directory
 * @returns {Promise<void>} Resolves once everything is written
 */
async function buildBinaries({ target, nodeVersion, out }) {
  const targets = parseTargets(target);
  const version = assertSeaVersion(nodeVersion);
  const cacheDir = join(out, ".node");
  mkdirSync(out, { recursive: true });

  const bundle = join(out, ".bundle", "xslt.cjs");
  // Loaded here, not at the top: bundle.mjs imports esbuild, and the
  // checksums command runs where dependencies are not installed
  const { bundleCli } = await import("./bundle.mjs");
  const { bytes, version: cliVersion } = await bundleCli(bundle);
  console.log(`bundle   xslt ${cliVersion}, ${(bytes / MIB).toFixed(1)} MiB`);

  const host = hostTarget();
  if (!host) {
    throw new Error(`Unsupported host ${process.platform}-${process.arch}`);
  }
  const builderNode = await officialNode(host, version, cacheDir);

  for (const each of targets) {
    const outfile = join(out, binaryName(each));
    const native = isHost(each);
    const targetNode = native
      ? builderNode
      : await officialNode(each, version, cacheDir);
    const { signed } = buildExecutable({
      bundle,
      outfile,
      builderNode,
      targetNode,
      target: each,
      native,
    });
    const notes = [
      `node ${version}`,
      native ? "code cache" : "cross-built, no code cache",
      each.os === "darwin" && !signed
        ? "UNSIGNED: run codesign --sign - on a Mac"
        : "",
    ].filter(Boolean);
    console.log(
      `built    ${binaryName(each)}, ${(statSync(outfile).size / MIB).toFixed(1)} MiB (${notes.join(", ")})`,
    );
  }

  console.log(`wrote    ${writeChecksums(out)}`);
}

/**
 * Command line entry point.
 *
 * @returns {Promise<void>} Resolves once the command has finished
 */
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      target: { type: "string", default: "host" },
      "node-version": { type: "string", default: process.version },
      out: { type: "string", default: DIST_BIN_DIR },
    },
  });
  const out = confinePath(values.out);

  if (positionals[0] === "checksums") {
    console.log(`wrote    ${writeChecksums(out)}`);
    return;
  }
  if (positionals.length > 0) {
    throw new Error(`Unknown command "${positionals[0]}" (expected checksums)`);
  }
  await buildBinaries({
    target: values.target,
    nodeVersion: values["node-version"],
    out,
  });
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
