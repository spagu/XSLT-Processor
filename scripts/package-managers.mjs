#!/usr/bin/env node
/**
 * Package-manager matrix: packs @tradik/xslt-processor, @tradik/xslt3 and
 * xslt-migrate-check (run `npm run build` first), installs the tarballs in a
 * fresh project per manager (npm, Yarn 1, Yarn 4 with Plug'n'Play, pnpm,
 * bun) and runs the smoke tests of tests/package-managers there: CommonJS,
 * ES modules with /polyfill, `xsltVersion: "auto"` without and with
 * @tradik/xslt3, and the `xslt` and `xslt-migrate-check` bins.
 *
 * Usage: node scripts/package-managers.mjs [--manager <name>]... [--require]
 *
 * The managers and their pinned versions: package-managers/managers.mjs. A
 * manager that cannot be started is "not available", a failure only with
 * --require (CI).
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { MANAGERS, run } from "./package-managers/managers.mjs";
import { report } from "./package-managers/report.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "tests", "package-managers");

/**
 * Pack the three packages into a directory.
 *
 * @param {string} dir - Destination
 * @returns {Object<string, string>} Tarball file name by package name
 */
function pack(dir) {
  if (!existsSync(join(ROOT, "dist", "xslt-processor.cjs"))) {
    throw new Error("dist/ is missing: run `npm run build` first");
  }
  const workspaces = ["--workspace", "@tradik/xslt3"];
  workspaces.push("--workspace", "xslt-migrate-check");
  const tarballs = {};
  for (const extra of [[], workspaces]) {
    const args = ["pack", "--json", "--pack-destination", dir, ...extra];
    // The developer's own npm from PATH, by design: this script tests the
    // package managers installed on the machine (or the CI runner). NOSONAR
    const result = spawnSync("npm", args, { cwd: ROOT, encoding: "utf8" }); // NOSONAR
    if (result.status !== 0) throw new Error(`npm pack: ${result.stderr}`);
    for (const { name, filename } of JSON.parse(result.stdout)) {
      tarballs[name] = filename;
    }
  }
  return tarballs;
}

/**
 * Write the project's package.json with `file:` dependencies on tarballs.
 *
 * @param {string} dir - Project directory
 * @param {string[]} names - Packed packages to depend on
 * @param {Object<string, string>} tarballs - From {@link pack}
 * @returns {void}
 */
function writeManifest(dir, names, tarballs) {
  const dependencies = { jsdom: "*" };
  for (const name of names) dependencies[name] = `file:./${tarballs[name]}`;
  const manifest = { name: "pm-smoke", private: true, dependencies };
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest, null, 2));
}

/**
 * Install and smoke-test the packages with one manager.
 *
 * @param {Manager} manager - The manager
 * @param {string} packDir - Where the tarballs are
 * @param {Object<string, string>} tarballs - From {@link pack}
 * @returns {Array<{check: string, ok: boolean, out: string}>} Results
 */
function smoke(manager, packDir, tarballs) {
  const dir = mkdtempSync(join(tmpdir(), "xslt-pm-"));
  const results = [];
  const check = (name, command) => {
    const { ok, out } = run(command, dir);
    results.push({ check: name, ok, out });
    return ok;
  };
  try {
    for (const file of Object.values(tarballs)) {
      copyFileSync(join(packDir, file), join(dir, file));
    }
    for (const file of ["smoke.cjs", "smoke.mjs", "auto.mjs"]) {
      copyFileSync(join(FIXTURES, file), join(dir, file));
    }
    for (const [file, text] of Object.entries(manager.files ?? {})) {
      writeFileSync(join(dir, file), text);
    }
    const base = ["@tradik/xslt-processor", "xslt-migrate-check"];
    writeManifest(dir, base, tarballs);
    if (!check("install", [...manager.cli, ...manager.install])) return results;
    check("cjs", [...manager.node, "smoke.cjs"]);
    check("esm+polyfill", [...manager.node, "smoke.mjs"]);
    check("auto w/o xslt3", [...manager.node, "auto.mjs", "missing"]);
    check("xslt --version", [...manager.exec, "xslt", "--version"]);
    const migrate = [...manager.exec, "xslt-migrate-check", "--version"];
    check("migrate-check --version", migrate);
    writeManifest(dir, [...base, "@tradik/xslt3"], tarballs);
    if (check("install xslt3", [...manager.cli, ...manager.install])) {
      check("auto with xslt3", [...manager.node, "auto.mjs", "present"]);
    }
    return results;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const { values } = parseArgs({
  options: {
    manager: { type: "string", multiple: true },
    require: { type: "boolean", default: false },
  },
});
const names = values.manager ?? Object.keys(MANAGERS);
const unknown = names.filter((name) => !MANAGERS[name]);
if (unknown.length > 0) {
  console.error(
    `Unknown manager(s): ${unknown.join(", ")}; expected ${Object.keys(MANAGERS).join(", ")}`,
  );
  process.exit(2);
}

const packDir = mkdtempSync(join(tmpdir(), "xslt-pack-"));
const rows = [];
try {
  const tarballs = pack(packDir);
  for (const name of names) {
    const manager = MANAGERS[name];
    console.error(`… ${name}`);
    const probe = run([...manager.cli, "--version"], packDir);
    if (!probe.ok) {
      rows.push({ name, version: "not available", results: [], missing: true });
      continue;
    }
    const version = probe.out.split("\n").pop();
    rows.push({ name, version, results: smoke(manager, packDir, tarballs) });
  }
} finally {
  rmSync(packDir, { recursive: true, force: true });
}
report(rows);
const failed = rows.some(
  (row) => row.results.some((r) => !r.ok) || (row.missing && values.require),
);
process.exitCode = failed ? 1 : 0;
