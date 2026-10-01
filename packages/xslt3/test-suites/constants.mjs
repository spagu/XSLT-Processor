/**
 * Pinned versions of the W3C test suites run against @tradik/xslt3.
 *
 * Each suite is a commit of its GitHub repository, downloaded as the
 * codeload tarball of that commit and verified with the SHA-256 recorded
 * here. Bump `commit` and `sha256` together: run the fetch with the new
 * commit and `sha256: null`, it prints the digest to pin.
 *
 * The suites are under the W3C test suite licence and are never committed:
 * they live in the system temporary directory (see {@link suiteDir}).
 *
 * @module test-suites/constants
 */

import { join } from "node:path";
import { TMP_ROOT } from "../../../scripts/lib/fsSafety.mjs";

/**
 * @typedef {object} SuiteSpec
 * @property {string} name - Short name used on the command line
 * @property {string} repo - GitHub `owner/repository`
 * @property {string} commit - Pinned commit SHA of the master branch
 * @property {string|null} sha256 - SHA-256 of the codeload tarball
 * @property {string} catalog - Catalog file, relative to the suite root
 * @property {string} licence - Licence of the suite files
 */

const W3C_LICENCE =
  "W3C Test Suite Licence (https://www.w3.org/copyright/test-suites-licence-2023/)";

/** @type {Readonly<Record<string, SuiteSpec>>} */
export const SUITES = Object.freeze({
  qt3: Object.freeze({
    name: "qt3",
    repo: "w3c/qt3tests",
    commit: "201a6e466940cdfc727f4babfedcde5332b9f578",
    sha256: "1b65f66069224fec92445f9d68f85df1f6cde3b75452f26bd4797d9006bd7b65",
    catalog: "catalog.xml",
    licence: W3C_LICENCE,
  }),
  xslt30: Object.freeze({
    name: "xslt30",
    repo: "w3c/xslt30-test",
    commit: "fddf1cf920087e791f13315d68dfbe874d97dc56",
    sha256: "59cc7c49c3b2b00b7115f4721a2d6a579aab129b53834b8a197e8b87e1b7a86e",
    catalog: "catalog.xml",
    licence: W3C_LICENCE,
  }),
});

/** Directory holding the downloaded suites. */
export const SUITES_ROOT = join(TMP_ROOT, "xslt3-suites");

/**
 * Directory of the extracted pinned commit of a suite.
 *
 * @param {SuiteSpec} suite - Suite
 * @returns {string} Absolute directory path
 */
export function suiteDir(suite) {
  return join(SUITES_ROOT, `${suite.name}-${suite.commit}`);
}

/**
 * URL of the codeload tarball of the pinned commit.
 *
 * @param {SuiteSpec} suite - Suite
 * @returns {string} HTTPS URL
 */
export function tarballUrl(suite) {
  return `https://codeload.github.com/${suite.repo}/tar.gz/${suite.commit}`;
}
