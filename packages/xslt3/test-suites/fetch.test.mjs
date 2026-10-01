/**
 * Unit tests of the suite pins and the offline parts of the fetch script.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SUITES, SUITES_ROOT, suiteDir, tarballUrl } from "./constants.mjs";
import { selectSuites, sha256, verifyDigest } from "./fetch.mjs";

describe("suite pins", () => {
  it("pins a full commit SHA and a tarball digest per suite", () => {
    for (const suite of Object.values(SUITES)) {
      assert.match(suite.commit, /^[0-9a-f]{40}$/);
      assert.match(suite.sha256, /^[0-9a-f]{64}$/);
      assert.ok(suiteDir(suite).startsWith(SUITES_ROOT));
      assert.equal(
        tarballUrl(suite),
        `https://codeload.github.com/${suite.repo}/tar.gz/${suite.commit}`,
      );
    }
  });
});

describe("fetch helpers", () => {
  it("hashes bytes", () => {
    assert.equal(
      sha256(new Uint8Array()),
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("verifies digests and explains a missing pin", () => {
    const suite = { ...SUITES.qt3 };
    assert.equal(verifyDigest(suite, suite.sha256), "");
    assert.throws(() => verifyDigest(suite, "0"), /Checksum mismatch/);
    assert.match(
      verifyDigest({ ...suite, sha256: null }, "ab"),
      /pin sha256: "ab"/,
    );
  });

  it("selects suites", () => {
    assert.deepEqual(selectSuites(), ["qt3", "xslt30"]);
    assert.deepEqual(selectSuites("xslt30"), ["xslt30"]);
    assert.throws(() => selectSuites("xquery"), /Unknown suite/);
  });
});
