/**
 * Unit tests of the standalone binary targets.
 *
 * Run: node --test "scripts/binaries/*.test.mjs"
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TARGETS,
  binaryName,
  hostTarget,
  isHost,
  parseTargets,
} from "./targets.mjs";

describe("targets", () => {
  it("lists the five release targets", () => {
    assert.deepEqual(
      TARGETS.map((target) => target.id),
      ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64", "windows-x64"],
    );
  });

  it("maps targets to Node.js distribution files", () => {
    const [linux, , , darwinArm, windows] = TARGETS;
    assert.equal(linux.archive, "node-{version}-linux-x64.tar.gz");
    assert.equal(linux.member, "node-{version}-linux-x64/bin/node");
    assert.equal(darwinArm.nodeDist, "darwin-arm64");
    assert.equal(windows.archive, "win-x64/node.exe");
    assert.equal(windows.member, "");
    assert.equal(windows.platform, "win32");
  });

  it("names executables xslt-<os>-<arch>[.exe]", () => {
    assert.deepEqual(TARGETS.map(binaryName), [
      "xslt-linux-x64",
      "xslt-linux-arm64",
      "xslt-darwin-x64",
      "xslt-darwin-arm64",
      "xslt-windows-x64.exe",
    ]);
  });

  it("detects the host target", () => {
    assert.equal(hostTarget("win32", "x64").id, "windows-x64");
    assert.equal(hostTarget("darwin", "arm64").id, "darwin-arm64");
    assert.equal(hostTarget("freebsd", "x64"), undefined);
    assert.equal(hostTarget("win32", "arm64"), undefined);
  });

  it("parses target lists", () => {
    assert.deepEqual(
      parseTargets(" linux-arm64 , windows-x64 ").map((t) => t.id),
      ["linux-arm64", "windows-x64"],
    );
    assert.equal(parseTargets("all").length, 5);
    if (hostTarget()) {
      assert.deepEqual(parseTargets(), [hostTarget()]);
      assert.equal(isHost(hostTarget()), true);
    }
    assert.throws(
      () => parseTargets("linux-ia32"),
      /Unknown target "linux-ia32"/,
    );
  });
});
