/**
 * `--fix` on disk: reads the files to change (as bytes), writes
 * migration.patch into the scanned directory, or with `--write` changes the
 * files in place once git says the working tree is clean.
 *
 * @module xslt-migrate-check/fix/run
 */

import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { planFixes, fixTargets } from "./plan.js";
import { renderPatch } from "./patch.js";
import { PATCH_FILE, fixLines, patchHeader } from "./summary.js";

const run = promisify(execFile);

/**
 * Read files as latin1 text (one character per byte), leaving out those
 * that cannot be read.
 *
 * @param {string} rootDir - The scanned directory
 * @param {string[]} paths - Report paths
 * @returns {Promise<Map<string, string>>} Texts by report path
 */
export async function readTargets(rootDir, paths) {
  const entries = await Promise.all(
    paths.map(async (path) => {
      try {
        // Files below the directory the user asked to scan. NOSONAR
        const bytes = await readFile(join(rootDir, path)); // NOSONAR
        return [path, bytes.toString("latin1")];
      } catch {
        return null;
      }
    }),
  );
  return new Map(entries.filter(Boolean));
}

/**
 * Ask git whether the directory has uncommitted changes.
 *
 * @param {string} rootDir - The scanned directory
 * @param {typeof run} [runGit] - execFile, promisified (for tests)
 * @returns {Promise<boolean>} True when `git status --porcelain` lists
 *   anything; false when clean, not a repository, or without git
 */
export async function hasUncommittedChanges(rootDir, runGit = run) {
  try {
    // git is looked up on PATH like any developer tool; the directory is
    // the one the user asked to scan. NOSONAR
    const { stdout } = await runGit("git", [
      "-C",
      rootDir,
      "status",
      "--porcelain",
    ]); // NOSONAR
    return stdout.trim() !== "";
  } catch {
    return false;
  }
}

/**
 * Write the edited files.
 *
 * @param {string} rootDir - The scanned directory
 * @param {import("./plan.js").Edit[]} edits - The edits
 * @returns {Promise<void>} Resolves when written
 */
async function writeEdits(rootDir, edits) {
  await Promise.all(
    edits.map(
      (edit) =>
        // Files below the scanned directory, changed on request. NOSONAR
        writeFile(join(rootDir, edit.path), Buffer.from(edit.after, "latin1")), // NOSONAR
    ),
  );
}

/**
 * Run `--fix`.
 *
 * @param {import("../analysis/index.js").Analysis} analysis - The analysis
 * @param {{rootDir: string, write: boolean, force: boolean}} options -
 *   Directory and flags
 * @param {{write: Function, writeError: Function}} out - Where the lines
 *   go, and where errors go
 * @param {{bold: Function}} style - Text decorators
 * @returns {Promise<number>} 0, or 2 when --write meets a dirty tree or a
 *   file cannot be written
 */
export async function runFix(analysis, options, out, style) {
  const { rootDir, write, force } = options;
  if (write && !force && (await hasUncommittedChanges(rootDir))) {
    out.writeError(
      "Error: --write needs a clean git working tree; commit or stash first, or add --force\n",
    );
    return 2;
  }
  const plan = planFixes(
    analysis,
    await readTargets(rootDir, fixTargets(analysis)),
  );
  const target = write ? rootDir : join(rootDir, PATCH_FILE);
  try {
    if (write) {
      await writeEdits(rootDir, plan.edits);
    } else if (plan.edits.length > 0) {
      const patch = renderPatch(patchHeader(analysis, plan), plan.edits);
      // The patch goes into the scanned directory. NOSONAR
      await writeFile(target, Buffer.from(patch, "latin1")); // NOSONAR
    }
  } catch (error) {
    out.writeError(
      `Error: cannot write ${error.path ?? target}: ${error.message}\n`,
    );
    return 2;
  }
  out.write(`${fixLines(plan, { target, write }, style).join("\n")}\n`);
  return 0;
}
