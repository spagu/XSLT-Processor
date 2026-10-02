import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errorCode } from "../testing.test.js";
import {
  compareVersions,
  parseVersion,
  parseVersionRange,
  versionMatches,
} from "./packageVersions.js";

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} the sign of the comparison of two versions
 */
const order = (a, b) =>
  Math.sign(compareVersions(parseVersion(a), parseVersion(b)));

describe("package versions", () => {
  it("parse portions, dropping trailing zeros", () => {
    assert.deepEqual(parseVersion(" 1.0.0 "), [1n]);
    assert.deepEqual(parseVersion("2.0-rc1"), [2n, "rc1"]);
    assert.deepEqual(parseVersion("1.0", true), [1n, 0n]);
    assert.equal(parseVersion("1.x"), null);
    assert.equal(parseVersion("-1"), null);
    assert.equal(parseVersion("1-a:b"), null);
  });

  it("are ordered (section 3.5.1)", () => {
    const sequence = [
      "0-rc1",
      "0-rc2",
      "0",
      "1",
      "1.0.2",
      "1.0.3-rc1",
      "1.0.3",
      "1.0.3.2",
      "1.0.10",
    ];
    for (let i = 1; i < sequence.length; i++) {
      assert.equal(order(sequence[i - 1], sequence[i]), -1, sequence[i]);
      assert.equal(order(sequence[i], sequence[i - 1]), 1, sequence[i]);
    }
    assert.equal(order("1", "1.0"), 0);
    assert.equal(order("2.0", "2.0-rc1"), 1);
    assert.equal(order("1.2", "1.2.5"), -1);
  });

  it("match version ranges", () => {
    const cases = [
      ["*", "7.1", true],
      [undefined, "7.1", true],
      ["9.5.0.8, 9.6+", "9.7", true],
      ["9.5.0.8, 9.6+", "9.5.1", false],
      ["1.3.*", "1.3.10.2", true],
      ["1.3.*", "1.3-beta", true],
      ["1.3.*", "1.35", false],
      ["1.0.*", "1", true],
      ["1.0.*", "1.5", false],
      ["1.0.*", "1-beta", true],
      ["1.3+", "1.3-beta", false],
      ["1.3-beta+", "1.3-gamma", true],
      ["to 4.0", "4.0-beta", true],
      ["to 4.0", "4.0.1", false],
      ["to 3.3.*", "3.3.4621", true],
      ["to 3.3.*", "3.2", true],
      ["to 3.3.*", "3.4.0-beta", false],
      ["1 to 5", "5.0", true],
      ["1 to 5", "5.1", false],
      ["1 to 5.*", "5.7.2", true],
      ["1.0-beta to 1.0", "1.0-beta.2", true],
      ["1.0-beta to 1.0", "1.0-alpha", false],
      ["2", "2.0.0", true],
    ];
    for (const [range, version, expected] of cases) {
      assert.equal(
        versionMatches(version, range),
        expected,
        `${version} in ${range}`,
      );
    }
    assert.equal(versionMatches(undefined, "1"), true);
    assert.equal(versionMatches("bad", "*"), false);
  });

  it("reject invalid ranges", () => {
    for (const range of [
      "TotallyInvalid",
      "1.* to 2",
      "-3.6",
      "2.0.0-alpha:beta",
    ]) {
      assert.equal(
        errorCode(() => parseVersionRange(range)),
        "XTSE0020",
        range,
      );
    }
  });
});
