/**
 * Tests of scripts/install.sh against a local file:// "release".
 *
 * The release directory holds a fake executable for the host platform (a
 * shell script printing a version) and its checksums.sha256; no network is
 * used. Skipped on Windows, where install.sh runs under Git Bash only.
 *
 * Run: node --test "scripts/binaries/*.test.mjs"
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, it } from "node:test";
import { formatChecksums } from "./checksums.mjs";
import { sha256 } from "./node-dist.mjs";
import { binaryName, hostTarget } from "./targets.mjs";

const INSTALL_SH = fileURLToPath(new URL("../install.sh", import.meta.url));
const FAKE_BINARY = "#!/bin/sh\necho xslt-processor v9.9.9\n";
const host = hostTarget();

describe("install.sh", { skip: process.platform === "win32" || !host }, () => {
  let dir;
  let releaseDir;
  let installDir;

  /**
   * Run install.sh with the local release.
   *
   * @param {Record<string, string>} [env] - Extra environment variables
   * @returns {import("node:child_process").SpawnSyncReturns<string>} The run
   */
  const install = (env = {}) =>
    spawnSync("bash", [INSTALL_SH], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: dir,
        XSLT_RELEASE_URL: pathToFileURL(releaseDir).href,
        XSLT_INSTALL_DIR: installDir,
        ...env,
      },
    });

  /**
   * Write the release directory.
   *
   * @param {string} digest - Digest recorded for the executable
   * @returns {void}
   */
  const publish = (digest = sha256(Buffer.from(FAKE_BINARY))) => {
    const name = binaryName(host);
    writeFileSync(join(releaseDir, name), FAKE_BINARY);
    chmodSync(join(releaseDir, name), 0o644);
    writeFileSync(
      join(releaseDir, "checksums.sha256"),
      formatChecksums([{ name, digest }]),
    );
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "xslt-install-"));
    releaseDir = join(dir, "release");
    installDir = join(dir, "bin");
    mkdirSync(releaseDir);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("installs a verified executable", () => {
    publish();
    const run = install();
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Checksum verified/);
    assert.match(run.stdout, /xslt-processor v9\.9\.9 installed to /);
    const installed = join(installDir, "xslt");
    assert.equal(
      spawnSync(installed, ["--version"], { encoding: "utf8" }).stdout.trim(),
      "xslt-processor v9.9.9",
    );
  });

  it("refuses a checksum mismatch before installing", () => {
    publish("0".repeat(64));
    const run = install();
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Checksum mismatch for xslt-/);
    assert.equal(existsSync(join(installDir, "xslt")), false);
  });

  it("refuses a release without checksums", () => {
    publish();
    rmSync(join(releaseDir, "checksums.sha256"));
    const run = install();
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Could not download checksums\.sha256/);
  });

  it("refuses a release without the platform executable", () => {
    const run = install();
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Download failed/);
  });
});
