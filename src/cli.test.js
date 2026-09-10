/**
 * CLI Tests
 *
 * Runs bin/xslt.js in a child process against temporary files and checks that
 * the xsl:output driven serialization and the CLI flags behave as documented.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "bin",
  "xslt.js",
);

let workDir;

/**
 * Write a file into the temporary work directory.
 * @param {string} name - File name
 * @param {string} content - File content
 * @returns {string} Absolute path of the written file
 */
function writeTemp(name, content) {
  const path = join(workDir, name);
  writeFileSync(path, content, "utf-8");
  return path;
}

/**
 * Build the child process environment.
 *
 * Child coverage is redirected into the throwaway work directory: the CLI is
 * a black box integration test and bin/ is outside the measured `src/` scope.
 *
 * @returns {Record<string, string>} Environment for the child process
 */
function cliEnvironment() {
  return { ...process.env, NODE_V8_COVERAGE: join(workDir, "coverage") };
}

/**
 * Run the CLI, returning its stdout.
 * @param {string[]} args - Command line arguments
 * @returns {string} Captured stdout
 */
function runCli(args, extraEnv = {}) {
  return execFileSync(process.execPath, [CLI, ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...cliEnvironment(), ...extraEnv },
    cwd: workDir,
  });
}

/**
 * Run the CLI expecting a non-zero exit status.
 * @param {string[]} args - Command line arguments
 * @returns {{status: number, stderr: string}} Exit status and stderr
 */
function runCliFailing(args, extraEnv = {}) {
  try {
    runCli(args, extraEnv);
    throw new Error("expected the CLI to fail");
  } catch (error) {
    return { status: error.status, stderr: String(error.stderr) };
  }
}

describe("xslt CLI", () => {
  before(() => {
    workDir = mkdtempSync(join(tmpdir(), "xslt-cli-"));
    writeTemp("data.xml", "<root><item>a</item><item>b</item></root>");
    writeTemp(
      "identity.xsl",
      `<?xml version="1.0"?>
       <xsl:stylesheet version="1.0"
           xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
         <xsl:output method="xml" indent="yes"/>
         <xsl:template match="/"><BAR><QUX/></BAR></xsl:template>
       </xsl:stylesheet>`,
    );
    writeTemp(
      "plain.xsl",
      `<?xml version="1.0"?>
       <xsl:stylesheet version="1.0"
           xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
         <xsl:param name="title">none</xsl:param>
         <xsl:template match="/"><out><xsl:value-of select="$title"/></out>
         </xsl:template>
       </xsl:stylesheet>`,
    );
    writeTemp("broken.xml", "<root><unclosed></root>");
  });

  after(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("should honor xsl:output indent", () => {
    const output = runCli([
      join(workDir, "data.xml"),
      join(workDir, "identity.xsl"),
    ]);

    assert.strictEqual(
      output,
      '<?xml version="1.0" encoding="UTF-8"?>\n<BAR>\n  <QUX/>\n</BAR>\n',
    );
  });

  it("should override the declaration and indentation with flags", () => {
    const output = runCli([
      join(workDir, "data.xml"),
      join(workDir, "plain.xsl"),
      "--format",
      "--no-declaration",
    ]);

    assert.strictEqual(output, "<out>none</out>\n");
  });

  it("should override the output method", () => {
    const output = runCli([
      join(workDir, "data.xml"),
      join(workDir, "identity.xsl"),
      "--method",
      "text",
    ]);

    assert.strictEqual(output, "\n");
  });

  it("should warn about malformed parameters and keep going", () => {
    const output = runCli([
      join(workDir, "data.xml"),
      join(workDir, "plain.xsl"),
      "--no-declaration",
      "-p",
      "bogus",
    ]);

    assert.strictEqual(output, "<out>none</out>\n");
  });

  it("should write the result to a file", () => {
    const target = join(workDir, "out.xml");
    runCli([
      join(workDir, "data.xml"),
      join(workDir, "identity.xsl"),
      "-o",
      target,
    ]);

    assert.strictEqual(
      readFileSync(target, "utf-8"),
      '<?xml version="1.0" encoding="UTF-8"?>\n<BAR>\n  <QUX/>\n</BAR>',
    );
  });

  it("should print help and version", () => {
    assert.match(runCli(["--help"]), /Transform XML documents using XSLT/);
    assert.match(runCli(["--version"]), /^xslt-processor v\d+\.\d+\.\d+/);
  });

  it("should fail without both file arguments", () => {
    const { status, stderr } = runCliFailing([join(workDir, "data.xml")]);

    assert.strictEqual(status, 1);
    assert.match(stderr, /Both XML and XSLT file paths are required/);
  });

  it("should fail for a missing file", () => {
    const missing = join(workDir, "missing.xml");
    const { status, stderr } = runCliFailing([
      missing,
      join(workDir, "identity.xsl"),
    ]);

    assert.strictEqual(status, 1);
    assert.match(stderr, /File not found/);
    assert.ok(stderr.includes(missing));
  });

  it("should fail when an input path is not a file", () => {
    const { status, stderr } = runCliFailing([
      workDir,
      join(workDir, "identity.xsl"),
    ]);

    assert.strictEqual(status, 1);
    assert.match(stderr, /XML path is not a file/);
  });

  it("should fail for a missing stylesheet", () => {
    const { status, stderr } = runCliFailing([
      join(workDir, "data.xml"),
      join(workDir, "missing.xsl"),
    ]);

    assert.strictEqual(status, 1);
    assert.match(stderr, /File not found/);
  });

  it("should fail when the output directory does not exist", () => {
    const { status, stderr } = runCliFailing([
      join(workDir, "data.xml"),
      join(workDir, "identity.xsl"),
      "-o",
      join(workDir, "nowhere", "out.xml"),
    ]);

    assert.strictEqual(status, 1);
    assert.match(stderr, /Output directory does not exist/);
  });

  it("should fail when the output directory is not a directory", () => {
    const { status, stderr } = runCliFailing([
      join(workDir, "data.xml"),
      join(workDir, "identity.xsl"),
      "-o",
      join(workDir, "data.xml", "out.xml"),
    ]);

    assert.strictEqual(status, 1);
    assert.match(stderr, /Output directory is not a directory/);
  });

  it("should fail when the output path is an existing directory", () => {
    const directory = join(workDir, "existing-dir");
    mkdirSync(directory, { recursive: true });
    const { status, stderr } = runCliFailing([
      join(workDir, "data.xml"),
      join(workDir, "identity.xsl"),
      "-o",
      directory,
    ]);

    assert.strictEqual(status, 1);
    assert.match(stderr, /Output path is not a file/);
  });

  it("should refuse files outside the base directory", () => {
    const outside = mkdtempSync(join(tmpdir(), "xslt-outside-"));
    const xml = join(outside, "data.xml");
    writeFileSync(xml, "<root/>", "utf-8");
    try {
      const { status, stderr } = runCliFailing([xml, "plain.xsl"]);
      assert.strictEqual(status, 1);
      assert.match(stderr, /outside the allowed base directory/);
      assert.match(stderr, /XSLT_BASE_DIR/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("should accept files under XSLT_BASE_DIR", () => {
    const outside = mkdtempSync(join(tmpdir(), "xslt-outside-"));
    const xml = join(outside, "data.xml");
    const xsl = join(outside, "plain.xsl");
    writeFileSync(xml, "<root/>", "utf-8");
    writeFileSync(
      xsl,
      readFileSync(join(workDir, "plain.xsl"), "utf-8"),
      "utf-8",
    );
    try {
      const env = { XSLT_BASE_DIR: outside };
      const { status, stderr } = runCliFailing([xml, "plain.xsl"], env);
      assert.strictEqual(status, 1);
      assert.match(stderr, /XSLT path is outside the allowed base directory/);
      const out = runCli([xml, xsl, "--no-declaration"], env);
      assert.strictEqual(out.trim(), "<out>none</out>");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("should fail when XSLT_BASE_DIR is not a directory", () => {
    const { status, stderr } = runCliFailing(["data.xml", "plain.xsl"], {
      XSLT_BASE_DIR: join(workDir, "data.xml"),
    });
    assert.strictEqual(status, 1);
    assert.match(stderr, /Base directory is not a directory/);
  });

  it("should fail when XSLT_BASE_DIR does not exist", () => {
    const { status, stderr } = runCliFailing(["data.xml", "plain.xsl"], {
      XSLT_BASE_DIR: join(workDir, "missing"),
    });
    assert.strictEqual(status, 1);
    assert.match(stderr, /Base directory does not exist/);
  });

  it("should refuse an output file outside the base directory", () => {
    const outside = mkdtempSync(join(tmpdir(), "xslt-outside-"));
    try {
      const { status, stderr } = runCliFailing([
        "data.xml",
        "plain.xsl",
        "-o",
        join(outside, "out.xml"),
      ]);
      assert.strictEqual(status, 1);
      assert.match(
        stderr,
        /Output directory path is outside the allowed base directory/,
      );
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("should fail for malformed XML", () => {
    const { status, stderr } = runCliFailing([
      join(workDir, "broken.xml"),
      join(workDir, "identity.xsl"),
    ]);

    assert.strictEqual(status, 1);
    assert.match(stderr, /Error parsing XML/);
  });

  it("should fail for an unknown option", () => {
    const { status, stderr } = runCliFailing([
      join(workDir, "data.xml"),
      join(workDir, "identity.xsl"),
      "--nope",
    ]);

    assert.strictEqual(status, 1);
    assert.match(stderr, /Error:/);
  });
});
