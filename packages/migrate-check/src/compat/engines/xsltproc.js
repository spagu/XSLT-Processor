/**
 * Reference engine: xsltproc (libxslt, the XSLT engine inside Chrome),
 * when it is on PATH.
 *
 * @module xslt-migrate-check/compat/engines/xsltproc
 */

import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Largest result read from xsltproc (64 MB). */
const MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Find xsltproc and its libxslt version.
 *
 * @param {typeof run} [exec] - execFile, promisified (for tests)
 * @returns {Promise<string|null>} e.g. "xsltproc (libxslt 10145)", null
 *   when it is not on PATH
 */
export async function detectXsltproc(exec = run) {
  try {
    // xsltproc is looked up on PATH, like any developer tool. NOSONAR
    const { stdout } = await exec("xsltproc", ["--version"]); // NOSONAR
    const version = /libxslt (\d+)/.exec(stdout)?.[1];
    return version ? `xsltproc (libxslt ${version})` : "xsltproc";
  } catch {
    return null;
  }
}

/**
 * Create the xsltproc engine.
 *
 * @param {string} name - Its name, from detectXsltproc
 * @param {typeof run} [exec] - execFile, promisified (for tests)
 * @returns {{name: string, transform: Function, close: Function}} The
 *   engine
 */
export function createXsltprocEngine(name, exec = run) {
  return {
    name,
    /**
     * Run one pair: `xsltproc --stringparam n v ... stylesheet.xsl input.xml`.
     *
     * @param {{xml: string, xsl: string, params: object}} pair - The pair
     * @param {string} rootDir - The scanned directory
     * @returns {Promise<string>} The result
     * @throws {Error} With xsltproc's message
     */
    async transform({ xml, xsl, params }, rootDir) {
      const args = Object.entries(params).flatMap(([key, value]) => [
        "--stringparam",
        key,
        value,
      ]);
      args.push(join(rootDir, xsl), join(rootDir, xml));
      try {
        // Files of the directory the user asked to test. NOSONAR
        const { stdout } = await exec("xsltproc", args, {
          maxBuffer: MAX_BUFFER,
        }); // NOSONAR
        return stdout;
      } catch (error) {
        const message = String(error.stderr ?? "").trim() || error.message;
        throw new Error(message.split("\n").slice(0, 3).join(" "), {
          cause: error,
        });
      }
    },
    close: async () => {},
  };
}
