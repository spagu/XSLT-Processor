import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { URL, fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import { createFixture, removeFixture } from "../test/fixtures.js";

const run = promisify(execFile);
const binPath = fileURLToPath(
  new URL("./xslt-migrate-test.js", import.meta.url),
);

/** Run the command, resolving with its exit code and output. */
async function exec(args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [binPath, ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

describe("xslt-migrate-test executable", () => {
  it("prints the usage and exits 0", async () => {
    const { code, stdout } = await exec(["--help"]);
    assert.equal(code, 0);
    assert.ok(stdout.startsWith("Usage: xslt-migrate-test"));
  });

  it("says how to run it when the library is not installed", async () => {
    // The library is this repository's root package, not in node_modules
    const dir = await createFixture({ "a.xml": "<a/>" });
    try {
      const { code, stderr } = await exec([dir]);
      assert.equal(code, 2);
      assert.ok(
        stderr.includes(
          "npx -p xslt-migrate-check -p @tradik/xslt-processor -p jsdom xslt-migrate-test .",
        ),
      );
    } finally {
      await removeFixture(dir);
    }
  });
});
