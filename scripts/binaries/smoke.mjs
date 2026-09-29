#!/usr/bin/env node
/**
 * Standalone binaries - smoke test
 *
 * Runs a built `xslt` executable the way a user without Node.js would:
 * with an empty PATH (so it cannot fall back to a `node` on the machine),
 * from a temporary working directory holding the fixtures. Checks:
 *
 * 1. `xslt --version` prints the package version.
 * 2. A transform whose stylesheet uses `xsl:include` and whose input is an
 *    ISO-8859-1 encoded document (the "é" must survive the round trip into
 *    the UTF-8 result).
 * 3. `-o file` with `encoding="ISO-8859-1"` writes the byte 0xE9.
 *
 * Usage: node scripts/binaries/smoke.mjs [<binary> ...]
 * Without arguments it tests dist-bin/xslt-<host os>-<host arch>[.exe].
 * Exits with 1 on the first failure.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { Buffer } from "node:buffer";
import { DIST_BIN_DIR, ROOT_DIR, binaryName, hostTarget } from "./targets.mjs";

/** Package version the binaries must report. */
const VERSION = JSON.parse(
  readFileSync(join(ROOT_DIR, "package.json"), "utf8"),
).version;

/** Fixture files; in.xml is written as ISO-8859-1 bytes. */
const FIXTURES = {
  "in.xml": Buffer.from(
    '<?xml version="1.0" encoding="ISO-8859-1"?>\n<doc><name>café</name></doc>\n',
    "latin1",
  ),
  "inc.xsl": `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:template match="name"><greeting>Hello, <xsl:value-of select="."/>!</greeting></xsl:template>
</xsl:stylesheet>
`,
  "main.xsl": `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:include href="inc.xsl"/>
  <xsl:output method="xml" encoding="UTF-8" omit-xml-declaration="yes"/>
  <xsl:template match="/"><out><xsl:apply-templates select="doc/name"/></out></xsl:template>
</xsl:stylesheet>
`,
  "latin1.xsl": `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="text" encoding="ISO-8859-1"/>
  <xsl:template match="/"><xsl:value-of select="doc/name"/></xsl:template>
</xsl:stylesheet>
`,
};

/** Expected output of the include transform. */
const EXPECTED_INCLUDE = "<out><greeting>Hello, café!</greeting></out>";

/**
 * Environment without PATH entries, keeping what Windows needs to start a
 * process at all.
 *
 * @returns {NodeJS.ProcessEnv} The environment
 */
export function isolatedEnv() {
  const env = { PATH: "" };
  for (const name of ["SystemRoot", "SYSTEMROOT", "TEMP", "TMP"]) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return env;
}

/**
 * Throw when a value differs from the expected one.
 *
 * @param {string} label - What is compared
 * @param {unknown} actual - Observed value
 * @param {unknown} expected - Expected value
 * @returns {void}
 */
function expectEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

/**
 * Smoke test one binary.
 *
 * @param {string} binary - Path of the executable
 * @returns {{startupMs: number, transformMs: number}} Wall-clock timings
 * @throws {Error} When a check fails
 */
export function smokeTest(binary) {
  const executable = resolve(binary);
  const workDir = mkdtempSync(join(tmpdir(), "xslt-smoke-"));
  const run = (args) =>
    execFileSync(executable, args, {
      cwd: workDir,
      env: isolatedEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });

  try {
    for (const [name, content] of Object.entries(FIXTURES)) {
      writeFileSync(join(workDir, name), content);
    }

    let started = performance.now();
    expectEqual(
      "--version",
      run(["--version"]).toString().trim(),
      `xslt-processor v${VERSION}`,
    );
    const startupMs = performance.now() - started;

    started = performance.now();
    expectEqual(
      "include transform",
      run(["in.xml", "main.xsl"]).toString("utf8"),
      EXPECTED_INCLUDE,
    );
    const transformMs = performance.now() - started;

    run(["in.xml", "latin1.xsl", "-o", "out.txt"]);
    expectEqual(
      "ISO-8859-1 output",
      readFileSync(join(workDir, "out.txt")).toString("hex"),
      Buffer.from("café", "latin1").toString("hex"),
    );

    return { startupMs, transformMs };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const host = hostTarget();
  const binaries = process.argv.slice(2);
  if (binaries.length === 0 && host) {
    binaries.push(join(DIST_BIN_DIR, binaryName(host)));
  }
  for (const binary of binaries) {
    try {
      const { startupMs, transformMs } = smokeTest(binary);
      console.log(
        `ok ${binary}: --version ${startupMs.toFixed(0)} ms, transform ${transformMs.toFixed(0)} ms`,
      );
    } catch (error) {
      console.error(`FAIL ${binary}: ${error.message}`);
      process.exit(1);
    }
  }
}
