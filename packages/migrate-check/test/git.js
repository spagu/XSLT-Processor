/**
 * Shared test helper: runs git in a fixture directory. Holds no tests of
 * its own.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Run git in a directory.
 *
 * @param {string} dir - Working directory
 * @param {...string} args - git arguments
 * @returns {Promise<{code: number, stdout: string, stderr: string}>} Result
 */
export async function git(dir, ...args) {
  try {
    const { stdout, stderr } = await run("git", args, { cwd: dir });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

/**
 * Make a directory a git repository with everything committed.
 *
 * @param {string} dir - Directory
 * @returns {Promise<void>} Resolves when committed
 */
export async function commitAll(dir) {
  await git(dir, "init", "-q");
  await git(dir, "add", "-A");
  await git(
    dir,
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.com",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-q",
    "-m",
    "fixture",
  );
}
