import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { runCli, usageText } from "./cli.js";
import {
  createFixture,
  removeFixture,
  renderedXml,
  stylesheetXml,
} from "../test/fixtures.js";
import { SUGGESTION, readVersion } from "./migration.js";

/** A CliIo that records what was written. */
function fakeIo(isTTY = false) {
  const io = { out: "", err: "", isTTY };
  io.write = (text) => {
    io.out += text;
  };
  io.writeError = (text) => {
    io.err += text;
  };
  return io;
}

describe("usage and version", () => {
  it("prints the usage with --help and -h", async () => {
    for (const flag of ["--help", "-h"]) {
      const io = fakeIo();
      assert.equal(await runCli([flag], io), 0);
      assert.equal(io.out, usageText());
      assert.ok(io.out.includes("--fail-on <level>"));
    }
  });

  it("prints the version with --version", async () => {
    const io = fakeIo();
    assert.equal(await runCli(["--version"], io), 0);
    assert.equal(io.out, `${readVersion()}\n`);
    assert.match(io.out, /^\d+\.\d+\.\d+\n$/);
  });
});

describe("bad command lines exit with 2", () => {
  it("rejects unknown options with the usage on stderr", async () => {
    const io = fakeIo();
    assert.equal(await runCli(["--bogus"], io), 2);
    assert.equal(io.out, "");
    assert.ok(io.err.startsWith("Error: Unknown option"));
    assert.ok(io.err.includes("Usage: xslt-migrate-check"));
  });

  it("rejects a bad --fail-on value and two directories", async () => {
    const failOn = fakeIo();
    assert.equal(await runCli(["--fail-on", "loud"], failOn), 2);
    assert.ok(
      failOn.err.includes("--fail-on must be one of none, low, medium, high"),
    );
    const two = fakeIo();
    assert.equal(await runCli(["a", "b"], two), 2);
    assert.ok(two.err.includes("one directory at most"));
  });

  it("rejects a missing directory and a file", async () => {
    const dir = await createFixture({ "file.txt": "x" });
    try {
      const missing = fakeIo();
      assert.equal(await runCli([`${dir}/nope`], missing), 2);
      assert.equal(missing.err, `Error: Directory not found: ${dir}/nope\n`);
      const file = fakeIo();
      assert.equal(await runCli([`${dir}/file.txt`], file), 2);
      assert.equal(file.err, `Error: Not a directory: ${dir}/file.txt\n`);
    } finally {
      await removeFixture(dir);
    }
  });
});

describe("scanning", () => {
  let dir;

  before(async () => {
    dir = await createFixture({
      "src/app.js": "const p = new XSLTProcessor();\n",
      "xsl/a.xsl": stylesheetXml("2.0"),
      "feed.xml": renderedXml(),
      "legacy/old.js": "p.transformToDocument(x)\n",
    });
  });

  after(() => removeFixture(dir));

  it("prints the human report and exits 0 by default", async () => {
    const io = fakeIo();
    assert.equal(await runCli([dir], io), 0);
    assert.ok(
      io.out.startsWith(
        `xslt-migrate-check ${readVersion()} — scanned 4 files in ${dir}/ (`,
      ),
    );
    assert.ok(io.out.includes("Found 2 XSLTProcessor usages in 2 files\n"));
    assert.ok(io.out.includes("\nChrome 158 Migration Report\n"));
    assert.ok(io.out.includes("\nRisk: HIGH\n"));
    assert.ok(io.out.includes("\nFound 4 XSLT usages\n"));
    assert.ok(!io.out.includes("\u001b["));
    assert.equal(io.err, "");
  });

  it("uses colour on a TTY", async () => {
    const io = fakeIo(true);
    await runCli([dir], io);
    assert.ok(io.out.includes("\u001b[1mRisk: HIGH\u001b[22m"));
  });

  it("prints only JSON with --json, with the same numbers as the report", async () => {
    const io = fakeIo();
    assert.equal(await runCli([dir, "--json", "--ignore", "legacy"], io), 0);
    const json = JSON.parse(io.out);
    assert.equal(json.scannedFiles, 3);
    assert.equal(json.risk, "HIGH");
    assert.equal(json.needsXslt3, true);
    assert.equal(json.msxml, false);
    assert.deepEqual(
      json.usages.map((u) => u.file),
      ["src/app.js"],
    );
    assert.deepEqual(json.suggestion, { ...SUGGESTION });
    assert.equal(typeof json.durationMs, "number");
    assert.equal(json.summary.findings, json.findings.length);
    const text = fakeIo();
    await runCli([dir, "--ignore", "legacy"], text);
    assert.ok(
      text.out.includes(
        `Compatible automatically:  ${json.summary.automatic}\nManual review:             ${json.summary.manualReview}\n`,
      ),
    );
  });

  it("exits 1 only when the risk reaches --fail-on", async () => {
    assert.equal(await runCli([dir, "--fail-on", "high"], fakeIo()), 1);
    assert.equal(await runCli([dir, "--fail-on", "MEDIUM"], fakeIo()), 1);
    assert.equal(await runCli([dir, "--fail-on", "none"], fakeIo()), 0);
    const sheetsOnly = await createFixture({
      "a.xsl": stylesheetXml("1.0"),
      "b.xsl": stylesheetXml("2.0"),
    });
    try {
      assert.equal(
        await runCli([sheetsOnly, "--fail-on", "high"], fakeIo()),
        0,
      );
      assert.equal(
        await runCli([sheetsOnly, "--fail-on", "medium"], fakeIo()),
        1,
      );
    } finally {
      await removeFixture(sheetsOnly);
    }
  });

  it("scans the current directory when none is given", async () => {
    const previous = process.cwd();
    process.chdir(dir);
    try {
      const io = fakeIo();
      assert.equal(await runCli(["--json"], io), 0);
      assert.equal(JSON.parse(io.out).scannedFiles, 4);
    } finally {
      process.chdir(previous);
    }
  });
});
