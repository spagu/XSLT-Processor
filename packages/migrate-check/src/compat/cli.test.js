import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { MISSING_PEERS, runTestCli } from "./cli.js";
import { loadTradik } from "./engines/tradik.js";
import { testUsageText } from "./options.js";
import { readVersion } from "../migration.js";
import { createFixture, removeFixture } from "../../test/fixtures.js";
import { fakeIo } from "../../test/io.js";
import { loadForTests } from "../../test/library.js";
import { SAMPLE_PROJECT } from "../../test/sample.js";

let tradik;
/** A reference engine that answers with Tradik's own output, edited. */
const echo =
  (edit = (text) => text, notes = []) =>
  async () => ({
    name: "echo",
    notes,
    transform: async (pair, dir) => edit(await tradik.transform(pair, dir)),
    close: async () => {},
  });

/** Run the command with the test peers. */
async function cli(args, reference = echo()) {
  const io = fakeIo();
  io.code = await runTestCli(args, io, {
    loadEngine: async () => tradik,
    reference,
  });
  return io;
}

describe("xslt-migrate-test command line", () => {
  let dir;

  before(async () => {
    dir = await createFixture({
      ...SAMPLE_PROJECT,
      "pairs.json":
        '[{"xml":"public/orders.xml","xsl":"styles/orders.xsl","params":{"a":"1"}}]',
      "bad.json": "{}",
    });
    tradik = await loadTradik(dir, loadForTests);
  });

  after(() => removeFixture(dir));

  it("prints help and version", async () => {
    assert.equal((await cli(["--help"])).out, testUsageText());
    assert.equal((await cli(["-v"])).out, `${readVersion()}\n`);
  });

  it("rejects bad command lines with exit 2", async () => {
    const bad = [
      [["--bogus"], /Unknown option/],
      [["a", "b"], /one directory at most/],
      [["--html="], /--html needs a file name/],
      [["--diff", "some"], /--diff must be first or full/],
      [
        ["--reference", "saxon"],
        /--reference must be one of auto, browser, xsltproc, none/,
      ],
      [["--xml", "a.xml"], /--xml and --xsl go together/],
      [["--pairs", "p.json", "--xml", "a", "--xsl", "b"], /exclude each other/],
      [["--fail-under", "x"], /--fail-under needs a number/],
      [["--fail-under", "101"], /--fail-under needs a number/],
      [[join(dir, "nope")], /Directory not found/],
    ];
    for (const [args, pattern] of bad) {
      const io = await cli(args);
      assert.equal(io.code, 2, args.join(" "));
      assert.match(io.err, pattern);
    }
  });

  it("explains how to get the peers when they are missing", async () => {
    const io = fakeIo();
    assert.equal(
      await runTestCli([dir], io, { loadEngine: async () => null }),
      2,
    );
    assert.equal(io.err, MISSING_PEERS);
    assert.ok(
      MISSING_PEERS.includes(
        "npx -p xslt-migrate-check -p @tradik/xslt-processor -p jsdom xslt-migrate-test .",
      ),
    );
  });

  it("tests the sample project's three pairs", async () => {
    const io = await cli(
      [dir, "--fail-under", "100"],
      echo(undefined, ["a note"]),
    );
    assert.equal(io.code, 0, io.err);
    assert.ok(
      io.out.startsWith(
        "Reference engine: echo\n\n3 transformations tested\n\nMATCH:              3\n",
      ),
    );
    assert.ok(io.out.includes("\nCompatibility: 100.0%\n"));
    assert.equal(io.err, "Note: a note\n");
  });

  it("reports differences, fails under the threshold, prints JSON and HTML", async () => {
    const html = join(dir, "report.html");
    const change = (text) => text.replace("123.00", "123");
    const io = await cli(
      [dir, "--json", "--html", html, "--fail-under", "95"],
      echo(change),
    );
    assert.equal(io.code, 1);
    const json = JSON.parse(io.out);
    assert.deepEqual(
      [json.match, json.different, json.compatibility],
      [2, 1, 66.7],
    );
    const different = json.results.find((r) => r.status === "DIFFERENT");
    assert.equal(different.path, "/html/body/p/total/text()");
    assert.equal(io.err, `HTML report written to ${html}\n`);
    assert.match(
      await readFile(html, "utf8"),
      /<title>XSLT compatibility test<\/title>/,
    );
    const full = await cli(
      [dir, "--diff", "full", "--html", join(dir, "out.html")],
      echo(change),
    );
    assert.ok(full.out.includes("  --- expected (echo)\n"));
    assert.ok(full.out.includes("HTML report written to"));
  });

  it("runs --pairs lists and one --xml/--xsl pair with --param", async () => {
    const listed = JSON.parse(
      (await cli([dir, "--json", "--pairs", join(dir, "pairs.json")])).out,
    );
    assert.deepEqual(
      listed.results.map((r) => [r.xml, r.params]),
      [["public/orders.xml", { a: "1" }]],
    );
    const one = JSON.parse(
      (
        await cli([
          dir,
          "--json",
          "--xml",
          "public/catalog.xml",
          "--xsl",
          "styles/catalog.xsl",
          "--param",
          "x=2",
        ])
      ).out,
    );
    assert.deepEqual(
      one.results.map((r) => [r.status, r.params]),
      [["MATCH", { x: "2" }]],
    );
  });

  it("exits 2 for a bad list, an unavailable reference or an unwritable report", async () => {
    assert.match(
      (await cli([dir, "--pairs", join(dir, "bad.json")])).err,
      /bad\.json: expected an array of pairs/,
    );
    assert.match(
      (await cli([dir, "--pairs", join(dir, "gone.json")])).err,
      /^Error: ENOENT/,
    );
    assert.match(
      (await cli([dir, "--param", "x"])).err,
      /--param needs name=value/,
    );
    const missing = async () => {
      throw new Error("xsltproc is not on PATH");
    };
    assert.equal(
      (await cli([dir, "--reference", "xsltproc"], missing)).code,
      2,
    );
    const io = await cli([dir, "--html", join(dir, "no/dir/r.html")]);
    assert.equal(io.code, 2);
    assert.match(io.err, /cannot write the HTML report/);
  });

  it("fails --fail-under when nothing was compared", async () => {
    const none = async () => ({
      name: "none",
      notes: [],
      transform: null,
      close: async () => {},
    });
    const io = await cli([dir, "--fail-under", "0"], none);
    assert.equal(io.code, 0);
    assert.equal((await cli([dir, "--fail-under", "1"], none)).code, 1);
  });
});
