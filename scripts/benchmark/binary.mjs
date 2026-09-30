/**
 * The standalone executable of the host (1.2.0 only): dist-bin/ is used as
 * it is, else `node scripts/binaries/build.mjs --target host` builds it
 * (Node.js 25.5+, downloads the official Node.js binary once). When that is
 * not possible the scenario is skipped with the reason.
 *
 * @module scripts/benchmark/binary
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  DIST_BIN_DIR,
  ROOT_DIR,
  binaryName,
  hostTarget,
} from "../binaries/targets.mjs";

/** Longest time the binary build may take. */
const BUILD_TIMEOUT_MS = 300000;

let cached = null;

/**
 * Path of the host executable, building it when missing.
 *
 * @returns {{command?: string, note?: string}} The executable, or why not
 */
export function binaryCommand() {
  cached ??= locate();
  return cached;
}

/**
 * Find or build the host executable.
 *
 * @returns {{command?: string, note?: string}} The executable, or why not
 */
function locate() {
  const target = hostTarget();
  if (!target) {
    return { note: `no executable for ${process.platform}-${process.arch}` };
  }
  const file = join(DIST_BIN_DIR, binaryName(target));
  if (existsSync(file)) return { command: file };
  console.log("Building the standalone executable for the host");
  const build = spawnSync(
    process.execPath,
    [join(ROOT_DIR, "scripts", "binaries", "build.mjs"), "--target", "host"],
    { cwd: ROOT_DIR, stdio: "inherit", timeout: BUILD_TIMEOUT_MS },
  );
  if (build.status === 0 && existsSync(file)) return { command: file };
  return { note: "the host executable could not be built (make binaries)" };
}
