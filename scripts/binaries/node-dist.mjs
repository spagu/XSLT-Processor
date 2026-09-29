/**
 * Standalone binaries - official Node.js executables
 *
 * Downloads the official Node.js binary of a target from nodejs.org and
 * verifies it against the release's SHASUMS256.txt before use. Official
 * builds are statically linked against ICU and OpenSSL, so the resulting
 * executables do not depend on the libraries of the build machine (a
 * distribution `node` package usually does). Files are cached under
 * dist-bin/.node/<version>/.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { join } from "node:path";

/** Base URL of the official Node.js distribution. */
export const NODE_DIST_URL = "https://nodejs.org/dist";

/** First Node.js release with `node --build-sea`. */
export const MIN_SEA_VERSION = [25, 5, 0];

/**
 * Check that a Node.js version can build single executables.
 *
 * @param {string} version - Version such as `v26.10.0`
 * @returns {string} The version, unchanged
 * @throws {Error} When the version is malformed or older than 25.5.0
 */
export function assertSeaVersion(version) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid Node.js version "${version}" (expected vX.Y.Z)`);
  }
  const parts = match.slice(1).map(Number);
  const index = parts.findIndex((part, i) => part !== MIN_SEA_VERSION[i]);
  if (index !== -1 && parts[index] < MIN_SEA_VERSION[index]) {
    throw new Error(
      `Node.js ${version} cannot build single executables; use v${MIN_SEA_VERSION.join(".")} or newer`,
    );
  }
  return version;
}

/**
 * Find the expected SHA-256 of a distribution file.
 *
 * @param {string} shasums - Content of SHASUMS256.txt
 * @param {string} file - File name relative to the release directory
 * @returns {string} The hex digest
 * @throws {Error} When the file is not listed
 *
 * @example
 * expectedDigest("abc  win-x64/node.exe\n", "win-x64/node.exe"); // 'abc'
 */
export function expectedDigest(shasums, file) {
  for (const line of shasums.split("\n")) {
    const [digest, name] = line.trim().split(/\s+/);
    if (name === file) return digest;
  }
  throw new Error(`${file} is not listed in SHASUMS256.txt`);
}

/**
 * SHA-256 of a buffer, in hex.
 *
 * @param {Uint8Array} data - Content
 * @returns {string} The hex digest
 */
export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Download a URL into memory.
 *
 * @param {string} url - URL to fetch
 * @returns {Promise<Buffer>} The response body
 * @throws {Error} On a network error or a non-2xx status
 */
async function download(url) {
  const response = await globalThis.fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url}: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Return the path of the verified official node binary of a target,
 * downloading it on first use.
 *
 * @param {import("./targets.mjs").Target} target - Build target
 * @param {string} version - Node.js version such as `v26.10.0`
 * @param {string} cacheDir - Cache root (dist-bin/.node)
 * @param {string} [distUrl] - Distribution base URL (a mirror, or tests)
 * @returns {Promise<string>} Absolute path of the node executable
 * @throws {Error} When the download fails or the checksum does not match
 */
export async function officialNode(
  target,
  version,
  cacheDir,
  distUrl = NODE_DIST_URL,
) {
  const dir = join(cacheDir, version, target.nodeDist);
  const binary = join(dir, target.os === "windows" ? "node.exe" : "node");
  if (existsSync(binary)) return binary;

  mkdirSync(dir, { recursive: true });
  const releaseUrl = `${distUrl}/${version}`;
  const file = target.archive.replaceAll("{version}", version);
  const shasums = (await download(`${releaseUrl}/SHASUMS256.txt`)).toString(
    "utf8",
  );
  const data = await download(`${releaseUrl}/${file}`);
  const digest = sha256(data);
  if (digest !== expectedDigest(shasums, file)) {
    throw new Error(`Checksum mismatch for ${file}: got ${digest}`);
  }

  if (!target.member) {
    writeFileSync(binary, data);
    return binary;
  }
  const archive = join(dir, "node.tar.gz");
  writeFileSync(archive, data);
  const member = target.member.replaceAll("{version}", version);
  execFileSync("tar", ["-xzf", archive, "-C", dir, member]);
  writeFileSync(binary, readFileSync(join(dir, member)), { mode: 0o755 });
  return binary;
}
