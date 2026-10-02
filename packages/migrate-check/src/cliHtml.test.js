import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { normalizeHtmlOption, runCli } from "./cli.js";
import { DEFAULT_HTML_FILE } from "./report/html.js";
import { createFixture, removeFixture, renderedXml } from "../test/fixtures.js";

/** A CliIo that records what was written. */
function fakeIo() {
  const io = { out: "", err: "", isTTY: false };
  io.write = (text) => {
    io.out += text;
  };
  io.writeError = (text) => {
    io.err += text;
  };
  return io;
}

describe("--html", () => {
  let dir;
  let out;

  before(async () => {
    dir = await createFixture({ "feed.xml": renderedXml() });
    out = await createFixture({});
  });

  after(() => Promise.all([removeFixture(dir), removeFixture(out)]));

  it("gives --html its optional value", () => {
    assert.deepEqual(normalizeHtmlOption(["--html", "r.html", "."]), [
      "--html=r.html",
      ".",
    ]);
    assert.deepEqual(normalizeHtmlOption(["--html", "src"]), [
      `--html=${DEFAULT_HTML_FILE}`,
      "src",
    ]);
    assert.deepEqual(normalizeHtmlOption(["--json", "--html"]), [
      "--json",
      `--html=${DEFAULT_HTML_FILE}`,
    ]);
    assert.deepEqual(normalizeHtmlOption(["--html=x.HTM"]), ["--html=x.HTM"]);
  });

  it("writes the report and says where on stdout", async () => {
    const target = join(out, "report.html");
    const io = fakeIo();
    assert.equal(await runCli([dir, "--html", target], io), 0);
    assert.ok(io.out.endsWith(`HTML report written to ${target}\n`));
    const html = await readFile(target, "utf8");
    assert.ok(html.startsWith("<!doctype html>"));
  });

  it("writes the default file in the working directory, message on stderr with --json", async () => {
    const previous = process.cwd();
    process.chdir(out);
    try {
      const io = fakeIo();
      assert.equal(await runCli([dir, "--json", "--html"], io), 0);
      JSON.parse(io.out);
      const target = join(process.cwd(), DEFAULT_HTML_FILE);
      assert.equal(io.err, `HTML report written to ${target}\n`);
      assert.ok((await readFile(target, "utf8")).includes("<title>"));
    } finally {
      process.chdir(previous);
    }
  });

  it("exits 2 when the file cannot be written or the name is empty", async () => {
    const io = fakeIo();
    assert.equal(
      await runCli([dir, "--html", join(out, "no/such/r.html")], io),
      2,
    );
    assert.ok(io.err.startsWith("Error: cannot write the HTML report: "));
    const empty = fakeIo();
    assert.equal(await runCli([dir, "--html="], empty), 2);
    assert.ok(empty.err.startsWith("Error: --html needs a file name"));
  });
});
