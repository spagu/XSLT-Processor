/**
 * CLI --xslt-version: XSLT 2.0/3.0 stylesheets run by @tradik/xslt3 with
 * `--xslt-version auto`, the XSLT 1.0 engine by default.
 */

import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDomEnvironment,
  prepareXsltVersion,
  runTransformation,
  xsltVersionOf,
} from "../bin/lib/transform.js";
import { loadedXslt3, setXslt3Importer } from "./bridge/loader.js";

const CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "bin",
  "xslt.js",
);
const XSL = 'xmlns:xsl="http://www.w3.org/1999/XSL/Transform"';
const SOURCE = '<r><i k="a"/><i k="b"/><i k="a"/></r>';
const GROUPING = `<xsl:stylesheet version="2.0" ${XSL}>
  <xsl:output omit-xml-declaration="yes"/>
  <xsl:param name="title" select="'none'"/>
  <xsl:template match="/"><groups title="{$title}">
    <xsl:for-each-group select="//i" group-by="@k">
      <g k="{current-grouping-key()}"/>
    </xsl:for-each-group></groups></xsl:template>
</xsl:stylesheet>`;
const VERSION_ONE = `<xsl:stylesheet version="1.0" ${XSL}>
  <xsl:template match="/"><one/></xsl:template></xsl:stylesheet>`;

let workDir;

/**
 * Run the CLI in the work directory.
 *
 * @param {string[]} args - Command line arguments
 * @returns {{status: number, stdout: string, stderr: string}} The outcome
 */
function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf-8",
    cwd: workDir,
    env: { ...process.env, NODE_V8_COVERAGE: join(workDir, "coverage") },
  });
}

describe("xslt CLI --xslt-version", () => {
  before(() => {
    workDir = mkdtempSync(join(tmpdir(), "xslt-cli-version-"));
    writeFileSync(join(workDir, "data.xml"), SOURCE);
    writeFileSync(join(workDir, "grouping.xsl"), GROUPING);
  });

  after(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("runs an XSLT 2.0 stylesheet with --xslt-version auto", () => {
    const run = runCli([
      "data.xml",
      "grouping.xsl",
      "--xslt-version",
      "auto",
      "-p",
      "title=T",
      "--indent",
    ]);
    assert.strictEqual(run.status, 0, run.stderr);
    assert.strictEqual(
      run.stdout,
      '<groups title="T">\n  <g k="a"/>\n  <g k="b"/>\n</groups>',
    );
  });

  it("keeps the XSLT 1.0 engine by default", () => {
    const run = runCli(["data.xml", "grouping.xsl"]);
    assert.strictEqual(run.status, 0, run.stderr);
    assert.match(run.stdout, /<groups title="none"\/>/);
    assert.match(run.stderr, /Unknown XSLT element: for-each-group/);
  });

  it("rejects other versions", () => {
    const run = runCli(["data.xml", "grouping.xsl", "--xslt-version", "2.0"]);
    assert.strictEqual(run.status, 1);
    assert.match(
      run.stderr,
      /Invalid --xslt-version "2\.0": expected 1\.0 or auto/,
    );
  });
});

describe("CLI xslt-version helpers", () => {
  let dom;

  before(async () => {
    dom = await createDomEnvironment();
  });

  afterEach(() => setXslt3Importer(null));

  it("reads the flag, 1.0 by default", () => {
    assert.strictEqual(xsltVersionOf({}), "1.0");
    assert.strictEqual(xsltVersionOf({ "xslt-version": "auto" }), "auto");
    assert.throws(() => xsltVersionOf({ "xslt-version": "3" }), /Invalid/);
  });

  it("loads @tradik/xslt3 only for a 2.0/3.0 stylesheet in auto mode", async () => {
    setXslt3Importer(() => Promise.reject(new Error("not installed")));
    await prepareXsltVersion(dom, GROUPING, {});
    await prepareXsltVersion(dom, VERSION_ONE, { "xslt-version": "auto" });
    assert.strictEqual(loadedXslt3(), null);
    await assert.rejects(
      prepareXsltVersion(dom, GROUPING, { "xslt-version": "auto" }),
      /install @tradik\/xslt3 to run XSLT 2\.0\/3\.0 stylesheets/,
    );
  });

  it("transforms with the loaded engine", async () => {
    const values = { "xslt-version": "auto", method: "text" };
    await prepareXsltVersion(dom, GROUPING, values);
    const { output, encoding } = runTransformation({
      dom,
      xmlContent: SOURCE,
      xsltContent: GROUPING,
      params: {},
      values,
    });
    assert.strictEqual(output.trim(), "");
    assert.strictEqual(encoding, "UTF-8");
  });
});
