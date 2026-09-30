/**
 * Standalone binaries - Node.js Single Executable Application
 *
 * Injects the CLI bundle into an official node binary with
 * `node --build-sea` (Node.js 25.5+). The builder is the official node of
 * the build machine; the `executable` it injects into is the node binary of
 * the target, so every target can be built on any machine. Two things only
 * work natively and are skipped when cross-building:
 *
 * - the V8 code cache (`useCodeCache`), which is CPU and V8 build specific
 *   and cuts the start-up time of `xslt --version` roughly fourfold;
 * - macOS signing: the injection invalidates the signature of the node
 *   binary and Apple Silicon refuses to run unsigned code, so on a macOS
 *   host the signature is removed before and an ad-hoc one added after
 *   injection (`codesign`). Cross-built darwin binaries must be signed on a
 *   Mac (`codesign --sign - xslt-darwin-*`) before they run on arm64.
 */

import { systemTool } from "../lib/fsSafety.mjs";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The `node --build-sea` configuration of one executable.
 *
 * @param {object} options - Build inputs
 * @param {string} options.main - CommonJS bundle to embed
 * @param {string} options.output - Executable to write
 * @param {string} options.executable - Node binary to inject into
 * @param {boolean} options.native - Whether the target is the build machine
 * @returns {object} The configuration object
 */
export function seaConfig({ main, output, executable, native }) {
  return {
    main,
    output,
    executable,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: native,
  };
}

/**
 * Build one standalone executable.
 *
 * @param {object} options - Build inputs
 * @param {string} options.bundle - CommonJS bundle of the CLI
 * @param {string} options.outfile - Executable to write
 * @param {string} options.builderNode - Official node of the build machine
 * @param {string} options.targetNode - Official node of the target
 * @param {import("./targets.mjs").Target} options.target - Build target
 * @param {boolean} options.native - Whether the target is the build machine
 * @returns {{signed: boolean}} Whether a macOS executable was signed
 */
export function buildExecutable({
  bundle,
  outfile,
  builderNode,
  targetNode,
  target,
  native,
}) {
  const workDir = join(dirname(outfile), `.sea-${target.id}`);
  mkdirSync(workDir, { recursive: true });
  const signOnHost = target.os === "darwin" && process.platform === "darwin";

  try {
    let executable = targetNode;
    if (signOnHost) {
      executable = join(workDir, "node");
      copyFileSync(targetNode, executable);
      execFileSync(systemTool("codesign"), ["--remove-signature", executable]);
    }

    const config = join(workDir, "sea-config.json");
    writeFileSync(
      config,
      JSON.stringify(
        seaConfig({ main: bundle, output: outfile, executable, native }),
      ),
    );
    execFileSync(builderNode, ["--build-sea", config], { stdio: "inherit" });

    if (signOnHost) {
      execFileSync(systemTool("codesign"), ["--sign", "-", "--force", outfile]);
    }
    return { signed: signOnHost };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
