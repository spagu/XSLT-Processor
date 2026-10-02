import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { URL, fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { after, before, describe, it } from "node:test";
import {
  createFixture,
  removeFixture,
  renderedXml,
} from "../src/fixture.test.js";

const run = promisify(execFile);
const binPath = fileURLToPath(
  new URL("./xslt-migrate-check.js", import.meta.url),
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

describe("xslt-migrate-check executable", () => {
  let dir;

  before(async () => {
    dir = await createFixture({ "feed.xml": renderedXml() });
  });

  after(() => removeFixture(dir));

  it("prints JSON and exits 0 without --fail-on", async () => {
    const { code, stdout, stderr } = await exec([dir, "--json"]);
    assert.equal(code, 0);
    assert.equal(stderr, "");
    const json = JSON.parse(stdout);
    assert.equal(json.risk, "HIGH");
    assert.equal(json.xmlDocuments.length, 1);
  });

  it("exits 1 with --fail-on high and still prints the report", async () => {
    const { code, stdout } = await exec([dir, "--fail-on", "high"]);
    assert.equal(code, 1);
    assert.ok(stdout.includes("Chrome compatibility risk: HIGH"));
  });

  it("exits 2 with the usage on stderr for an unknown option", async () => {
    const { code, stdout, stderr } = await exec(["--bogus"]);
    assert.equal(code, 2);
    assert.equal(stdout, "");
    assert.ok(stderr.includes("Usage: xslt-migrate-check"));
  });
});
