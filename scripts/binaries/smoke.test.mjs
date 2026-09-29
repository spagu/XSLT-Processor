/**
 * Tests of the smoke test itself: it must fail for a broken executable and
 * run executables with an empty PATH.
 *
 * Run: node --test "scripts/binaries/*.test.mjs"
 */

import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isolatedEnv, smokeTest } from "./smoke.mjs";

describe("smokeTest", () => {
  it("runs executables without PATH entries", () => {
    assert.equal(isolatedEnv().PATH, "");
  });

  it(
    "fails when the executable reports another version",
    { skip: process.platform === "win32" },
    () => {
      const dir = mkdtempSync(join(tmpdir(), "xslt-smoke-test-"));
      try {
        const fake = join(dir, "xslt");
        writeFileSync(fake, "#!/bin/sh\necho xslt-processor v0.0.0\n");
        chmodSync(fake, 0o755);
        assert.throws(
          () => smokeTest(fake),
          /--version: expected "xslt-processor v\d+\.\d+\.\d+", got "xslt-processor v0\.0\.0"/,
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
