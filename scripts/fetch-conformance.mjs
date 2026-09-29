#!/usr/bin/env node
/**
 * Download the XSLT 1.0 conformance corpus used by `npm run test:conformance`.
 *
 * The corpus is the regression test tree of libxslt (the XSLT engine behind
 * Chrome, Safari and xsltproc), taken from a pinned, checksummed release
 * tarball. libxslt is MIT licensed, so the files could be redistributed, but
 * they are fetched on demand instead to keep the repository and the npm
 * package small. Only `tests/` and the licence file are extracted, into
 * `tests/conformance/corpus/` (git-ignored).
 *
 * Usage: node scripts/fetch-conformance.mjs [--force]
 *
 * Requires `tar` with xz support (GNU tar or bsdtar), present on every CI
 * image and on current macOS and Linux installs.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Pinned corpus release. Bump version and sha256 together. */
export const CORPUS = Object.freeze({
  name: "libxslt",
  version: "1.1.45",
  url: "https://download.gnome.org/sources/libxslt/1.1/libxslt-1.1.45.tar.xz",
  sha256: "9acfe68419c4d06a45c550321b3212762d92f41465062ca4ea19e632ee5d216e",
  licence: "MIT (see Copyright in the corpus directory)",
});

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Directory the corpus is extracted to. */
export const corpusRoot = join(repoRoot, "tests", "conformance", "corpus");

/** Directory of the extracted pinned release. */
export const corpusDir = join(corpusRoot, `${CORPUS.name}-${CORPUS.version}`);

/**
 * Compute the hex SHA-256 digest of a buffer.
 *
 * @param {Uint8Array} data - Bytes to hash
 * @returns {string} Lower case hex digest
 */
export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Download the pinned tarball, verify its checksum and extract the tests.
 *
 * A stamp file records the verified checksum, so a second run is a no-op
 * unless `force` is set.
 *
 * @param {object} [options] - Options
 * @param {boolean} [options.force] - Re-download even when already present
 * @returns {Promise<string>} The corpus directory
 * @throws {Error} On network failures or a checksum mismatch
 */
export async function fetchCorpus({ force = false } = {}) {
  const stamp = join(corpusDir, ".sha256");
  if (!force && existsSync(stamp)) {
    const recorded = (await readFile(stamp, "utf8")).trim();
    if (recorded === CORPUS.sha256) return corpusDir;
  }

  console.log(`Downloading ${CORPUS.url}`);
  const response = await globalThis.fetch(CORPUS.url);
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status} ${CORPUS.url}`);
  }
  const tarball = new Uint8Array(await response.arrayBuffer());

  const digest = sha256(tarball);
  if (digest !== CORPUS.sha256) {
    throw new Error(
      `Checksum mismatch for ${CORPUS.url}: expected ${CORPUS.sha256}, got ${digest}`,
    );
  }

  await rm(corpusDir, { recursive: true, force: true });
  await mkdir(corpusDir, { recursive: true });
  const archive = join(corpusRoot, `${CORPUS.name}-${CORPUS.version}.tar.xz`);
  await writeFile(archive, tarball);

  const prefix = `${CORPUS.name}-${CORPUS.version}`;
  try {
    execFileSync(
      "tar",
      [
        "-xJf",
        archive,
        "-C",
        corpusDir,
        "--strip-components=1",
        `${prefix}/tests`,
        `${prefix}/Copyright`,
      ],
      { stdio: "inherit" },
    );
  } finally {
    await rm(archive, { force: true });
  }

  await writeFile(stamp, `${CORPUS.sha256}\n`);
  console.log(`Corpus ready in ${corpusDir}`);
  return corpusDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fetchCorpus({ force: process.argv.includes("--force") }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
