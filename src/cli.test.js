/**
 * CLI Tests
 *
 * Runs bin/xslt.js in a child process against temporary files and checks that
 * the xsl:output driven serialization and the CLI flags behave as documented.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { Buffer } from "node:buffer";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  JSDOM_MISSING_MESSAGE,
  applyOutputOverrides,
  createDomEnvironment,
  loadJsdom,
  parseDocument,
  runTransformation,
} from "../bin/lib/transform.js";
import { EncodingError, decodeXml, detectEncoding } from "../bin/lib/decode.js";
import {
  CliUriError,
  createDocumentLoader,
  createStylesheetLoader,
  toBaseUri,
  uriToPath,
} from "../bin/lib/loaders.js";
import { forStdout, writeResult } from "../bin/lib/output.js";
import {
  CliPathError,
  resolveBaseDir,
  resolveInputPath,
  resolveOutputPath,
} from "../bin/lib/paths.js";

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
 * @param {Record<string, string>} [extraEnv] - Additional environment variables
 * @param {string} [cwd] - Working directory, the work directory by default
 * @returns {string} Captured stdout
 */
function runCli(args, extraEnv = {}, cwd = workDir) {
  return execFileSync(process.execPath, [CLI, ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...cliEnvironment(), ...extraEnv },
    cwd,
  });
}

/**
 * Run the CLI expecting a non-zero exit status.
 * @param {string[]} args - Command line arguments
 * @param {Record<string, string>} [extraEnv] - Additional environment variables
 * @param {string} [cwd] - Working directory, the work directory by default
 * @returns {{status: number, stderr: string}} Exit status and stderr
 */
function runCliFailing(args, extraEnv = {}, cwd = workDir) {
  try {
    runCli(args, extraEnv, cwd);
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
      '<?xml version="1.0" encoding="UTF-8"?>\n<BAR>\n  <QUX/>\n</BAR>',
    );
  });

  it("should override the declaration and indentation with flags", () => {
    const output = runCli([
      join(workDir, "data.xml"),
      join(workDir, "plain.xsl"),
      "--format",
      "--no-declaration",
    ]);

    assert.strictEqual(output, "<out>none</out>");
  });

  it("should override the output method", () => {
    const output = runCli([
      join(workDir, "data.xml"),
      join(workDir, "identity.xsl"),
      "--method",
      "text",
    ]);

    assert.strictEqual(output, "");
  });

  it("should warn about malformed parameters and keep going", () => {
    const output = runCli([
      join(workDir, "data.xml"),
      join(workDir, "plain.xsl"),
      "--no-declaration",
      "-p",
      "bogus",
    ]);

    assert.strictEqual(output, "<out>none</out>");
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

describe("xslt CLI external resources and encodings", () => {
  const XSL_NS = 'xmlns:xsl="http://www.w3.org/1999/XSL/Transform"';

  /**
   * Wrap stylesheet body markup in an xsl:stylesheet element.
   * @param {string} body - Top level elements
   * @returns {string} Complete stylesheet text
   */
  const sheet = (body) =>
    `<xsl:stylesheet version="1.0" ${XSL_NS}>${body}</xsl:stylesheet>`;

  const TEXT_OUTPUT = '<xsl:output method="text"/>';

  before(() => {
    workDir = mkdtempSync(join(tmpdir(), "xslt-cli-res-"));
    mkdirSync(join(workDir, "sub"));
    mkdirSync(join(workDir, "inner"));
    writeTemp("data.xml", "<root><item>a</item></root>");
    writeTemp("lookup.xml", "<lookup><entry>looked-up</entry></lookup>");
    writeTemp(
      "lib.xsl",
      sheet('<xsl:template name="hello">HELLO</xsl:template>'),
    );
    writeTemp(
      "main.xsl",
      sheet(
        `<xsl:include href="lib.xsl"/>${TEXT_OUTPUT}` +
          '<xsl:template match="/"><xsl:call-template name="hello"/></xsl:template>',
      ),
    );
    writeTemp(
      "sub/helper.xsl",
      sheet('<xsl:template name="helper">HELPER</xsl:template>'),
    );
    writeTemp(
      "sub/base.xsl",
      sheet(
        '<xsl:include href="helper.xsl"/>' +
          '<xsl:template match="/">BASE<xsl:call-template name="helper"/></xsl:template>',
      ),
    );
    writeTemp(
      "importer.xsl",
      sheet(
        `<xsl:import href="sub/base.xsl"/>${TEXT_OUTPUT}` +
          '<xsl:template match="/">MAIN-<xsl:apply-imports/></xsl:template>',
      ),
    );
    writeTemp(
      "docfn.xsl",
      sheet(
        `${TEXT_OUTPUT}<xsl:template match="/">` +
          "<xsl:value-of select=\"document('lookup.xml')/lookup/entry\"/>|" +
          "<xsl:value-of select=\"count(document('absent.xml'))\"/>" +
          "</xsl:template>",
      ),
    );
    writeTemp("outside.xsl", sheet(""));
    writeTemp("inner/data.xml", "<root/>");
    writeTemp(
      "inner/escape.xsl",
      sheet('<xsl:include href="../outside.xsl"/>'),
    );
    writeTemp(
      "remote.xsl",
      sheet('<xsl:include href="https://example.com/remote.xsl"/>'),
    );
    writeTemp(
      "echo.xsl",
      sheet(
        `${TEXT_OUTPUT}<xsl:template match="/">[<xsl:value-of select="/*"/>]</xsl:template>`,
      ),
    );
    writeFileSync(
      join(workDir, "latin1.xml"),
      Buffer.concat([
        Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><a>caf'),
        Buffer.from([0xe9]),
        Buffer.from("</a>"),
      ]),
    );
    writeFileSync(
      join(workDir, "utf16.xml"),
      Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from(
          '<?xml version="1.0" encoding="UTF-16"?><a>żółw</a>',
          "utf16le",
        ),
      ]),
    );
  });

  after(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("resolves xsl:include relative to the stylesheet", () => {
    assert.strictEqual(runCli(["data.xml", "main.xsl"]), "HELLO");
  });

  it("resolves xsl:import from a subdirectory and its nested include", () => {
    assert.strictEqual(runCli(["data.xml", "importer.xsl"]), "MAIN-BASEHELPER");
  });

  it("loads document() relative to the stylesheet and warns about missing files", () => {
    const run = spawnSync(process.execPath, [CLI, "data.xml", "docfn.xsl"], {
      encoding: "utf-8",
      env: cliEnvironment(),
      cwd: workDir,
    });
    assert.strictEqual(run.status, 0);
    assert.strictEqual(run.stdout, "looked-up|0");
    assert.match(
      run.stderr,
      /^Warning: document\('.*absent\.xml'\) is empty: File not found/,
    );
    assert.strictEqual(run.stderr.trim().split("\n").length, 1);
  });

  it("refuses an include outside the base directory", () => {
    const { status, stderr } = runCliFailing(
      ["data.xml", "escape.xsl"],
      {},
      join(workDir, "inner"),
    );
    assert.strictEqual(status, 1);
    assert.match(stderr, /Failed to include stylesheet "\.\.\/outside\.xsl"/);
    assert.match(stderr, /outside the allowed base directory/);
  });

  it("refuses network stylesheet URIs", () => {
    const { status, stderr } = runCliFailing(["data.xml", "remote.xsl"]);
    assert.strictEqual(status, 1);
    assert.match(stderr, /Only local files can be loaded, refusing https: URI/);
  });

  it("decodes an ISO-8859-1 document by its XML declaration", () => {
    assert.strictEqual(runCli(["latin1.xml", "echo.xsl"]), "[café]");
  });

  it("decodes a UTF-16LE document with a byte order mark", () => {
    assert.strictEqual(runCli(["utf16.xml", "echo.xsl"]), "[żółw]");
  });

  it("writes identical bytes to stdout and to -o", () => {
    const stdout = runCli(["data.xml", "main.xsl"]);
    runCli(["data.xml", "main.xsl", "-o", "result.txt"]);
    assert.strictEqual(
      readFileSync(join(workDir, "result.txt"), "utf-8"),
      stdout,
    );
  });
});

describe("CLI jsdom loading", () => {
  it("loads jsdom when it is installed", async () => {
    const module = await loadJsdom();
    assert.strictEqual(typeof module.JSDOM, "function");
  });

  it("explains how to install jsdom when it is missing", async () => {
    const missing = Object.assign(new Error("Cannot find package 'jsdom'"), {
      code: "ERR_MODULE_NOT_FOUND",
    });
    await assert.rejects(
      loadJsdom(() => Promise.reject(missing)),
      (error) =>
        error.message === JSDOM_MISSING_MESSAGE && error.cause === missing,
    );
  });

  it("rethrows other loading errors unchanged", async () => {
    const broken = new SyntaxError("broken module");
    await assert.rejects(
      loadJsdom(() => Promise.reject(broken)),
      (error) => error === broken,
    );
  });
});

describe("CLI transformation helpers", () => {
  const stylesheet = `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
    <xsl:param name="who">nobody</xsl:param>
    <xsl:template match="/"><hi><b><xsl:value-of select="$who"/></b></hi></xsl:template>
  </xsl:stylesheet>`;
  const saved = {};

  before(() => {
    for (const key of ["document", "DOMParser", "XMLSerializer"]) {
      saved[key] = globalThis[key];
    }
  });

  after(() => {
    Object.assign(globalThis, saved);
  });

  it("creates a DOM environment and installs the globals", async () => {
    const dom = await createDomEnvironment();
    assert.strictEqual(globalThis.document, dom.window.document);
    assert.strictEqual(globalThis.DOMParser, dom.window.DOMParser);
  });

  it("parses XML and reports parser errors with a label", async () => {
    const dom = await createDomEnvironment();
    assert.strictEqual(
      parseDocument(dom, "<r/>", "XML").documentElement.nodeName,
      "r",
    );
    assert.throws(
      () => parseDocument(dom, "<r>", "XSLT"),
      /Error parsing XSLT/,
    );
  });

  it("runs a transformation with parameters and output overrides", async () => {
    const dom = await createDomEnvironment();
    const output = runTransformation({
      dom,
      xmlContent: "<r/>",
      xsltContent: stylesheet,
      params: { who: "you" },
      values: { indent: true, "no-declaration": true },
    });
    assert.strictEqual(output, "<hi>\n  <b>you</b>\n</hi>");
  });

  it("applies the method override", async () => {
    const dom = await createDomEnvironment();
    const output = runTransformation({
      dom,
      xmlContent: "<r/>",
      xsltContent: stylesheet,
      params: {},
      values: { method: "text" },
    });
    assert.strictEqual(output, "nobody");
  });

  it("returns the effective output settings", async () => {
    const dom = await createDomEnvironment();
    const settings = applyOutputOverrides(
      { engine: { outputSettings: { indent: "no" } } },
      { format: true },
    );
    assert.strictEqual(settings.indent, "yes");
    assert.ok(dom);
  });

  it("throws when the transformation fails", async () => {
    const dom = await createDomEnvironment();
    const failing = `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
      <xsl:template match="/"><xsl:message terminate="yes">stop</xsl:message></xsl:template>
    </xsl:stylesheet>`;
    const originalError = console.error;
    console.error = () => {};
    try {
      assert.throws(
        () =>
          runTransformation({
            dom,
            xmlContent: "<r/>",
            xsltContent: failing,
            params: {},
            values: {},
          }),
        /Transformation failed/,
      );
    } finally {
      console.error = originalError;
    }
  });
});

describe("CLI encoding detection", () => {
  const latin1 = Buffer.concat([
    Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><a>caf'),
    Buffer.from([0xe9]),
    Buffer.from("</a>"),
  ]);

  it("prefers a byte order mark", () => {
    assert.deepStrictEqual(
      detectEncoding(Buffer.from([0xef, 0xbb, 0xbf, 0x3c])),
      {
        encoding: "utf-8",
        bomLength: 3,
      },
    );
    assert.deepStrictEqual(detectEncoding(Buffer.from([0xfe, 0xff, 0, 0x3c])), {
      encoding: "utf-16be",
      bomLength: 2,
    });
  });

  it("recognizes UTF-16 without a byte order mark", () => {
    assert.strictEqual(
      detectEncoding(Buffer.from("<?xml?>", "utf16le")).encoding,
      "utf-16le",
    );
    assert.strictEqual(
      detectEncoding(Buffer.from([0, 0x3c, 0, 0x3f])).encoding,
      "utf-16be",
    );
  });

  it("reads the encoding declaration and defaults to UTF-8", () => {
    assert.strictEqual(detectEncoding(latin1).encoding, "ISO-8859-1");
    assert.strictEqual(
      detectEncoding(
        Buffer.from("<?xml version='1.0' encoding='windows-1252' ?><a/>"),
      ).encoding,
      "windows-1252",
    );
    assert.strictEqual(detectEncoding(Buffer.from("<a/>")).encoding, "utf-8");
    assert.strictEqual(
      detectEncoding(Buffer.from('<?xml version="1.0" encoding="UTF-16"?><a/>'))
        .encoding,
      "utf-8",
    );
  });

  it("decodes declared encodings and strips the byte order mark", () => {
    assert.match(decodeXml(latin1), /<a>café<\/a>$/);
    const bom = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("<a>ż</a>"),
    ]);
    assert.strictEqual(decodeXml(bom), "<a>ż</a>");
    const utf16be = Buffer.from([
      0xfe, 0xff, 0, 0x3c, 0, 0x61, 0, 0x2f, 0, 0x3e,
    ]);
    assert.strictEqual(decodeXml(utf16be), "<a/>");
  });

  it("replaces malformed bytes instead of failing", () => {
    assert.strictEqual(
      decodeXml(Buffer.from([0x3c, 0x61, 0xff, 0x3e])),
      "<a\ufffd>",
    );
  });

  it("rejects an unknown encoding label with the file name", () => {
    const bogus = Buffer.from('<?xml version="1.0" encoding="x-bogus"?><a/>');
    assert.throws(
      () => decodeXml(bogus, "bogus.xml"),
      (error) => {
        assert.ok(error instanceof EncodingError);
        assert.match(
          error.message,
          /Unsupported encoding "x-bogus" declared in bogus\.xml/,
        );
        return true;
      },
    );
    assert.throws(() => decodeXml(bogus), /declared in document/);
  });
});

describe("CLI stylesheet and document loaders", () => {
  let baseDir;

  before(() => {
    baseDir = realpathSync(mkdtempSync(join(tmpdir(), "xslt-cli-loaders-")));
    writeFileSync(join(baseDir, "lib.xsl"), "<lib/>");
    writeFileSync(join(baseDir, "doc.xml"), "<doc/>");
  });

  after(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("converts relative references, absolute paths and file URLs", () => {
    const base = toBaseUri(join(baseDir, "main.xsl"));
    assert.ok(base.startsWith("file:"));
    assert.strictEqual(
      uriToPath("lib.xsl", base, baseDir),
      join(baseDir, "lib.xsl"),
    );
    assert.strictEqual(
      uriToPath("lib.xsl", undefined, baseDir),
      join(baseDir, "lib.xsl"),
    );
    assert.strictEqual(
      uriToPath(toBaseUri(join(baseDir, "doc.xml")), base, baseDir),
      join(baseDir, "doc.xml"),
    );
  });

  it("refuses other schemes and malformed URIs", () => {
    assert.throws(
      () => uriToPath("http://example.com/a.xsl", undefined, baseDir),
      (error) =>
        error instanceof CliUriError &&
        /refusing http: URI/.test(error.message),
    );
    assert.throws(
      () => uriToPath("lib.xsl", "::not a url", baseDir),
      /Invalid URI: lib\.xsl/,
    );
  });

  it("loads stylesheets inside the base directory only", () => {
    const load = createStylesheetLoader(baseDir);
    const base = toBaseUri(join(baseDir, "main.xsl"));
    assert.strictEqual(load("lib.xsl", base), "<lib/>");
    assert.throws(
      () => load("../escape.xsl", base),
      /File not found|outside the allowed/,
    );
    assert.throws(
      () => load("/etc/hostname", base),
      /outside the allowed base directory|File not found/,
    );
  });

  it("returns null with a warning for an unavailable document()", () => {
    const warnings = [];
    const load = createDocumentLoader(baseDir, (message) =>
      warnings.push(message),
    );
    const base = toBaseUri(join(baseDir, "main.xsl"));
    assert.strictEqual(load("doc.xml", base), "<doc/>");
    assert.strictEqual(load("missing.xml", base), null);
    assert.match(
      warnings[0],
      /^Warning: document\('missing\.xml'\) is empty: File not found/,
    );
  });

  it("warns on stderr by default", () => {
    const originalError = console.error;
    const messages = [];
    console.error = (message) => messages.push(message);
    try {
      assert.strictEqual(
        createDocumentLoader(baseDir)("https://x.test/a.xml"),
        null,
      );
    } finally {
      console.error = originalError;
    }
    assert.match(messages[0], /refusing https: URI/);
  });

  it("runs a transformation with includes and document() from files", async () => {
    const dom = await createDomEnvironment();
    writeFileSync(
      join(baseDir, "named.xsl"),
      '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">' +
        '<xsl:template name="n">N</xsl:template></xsl:stylesheet>',
    );
    const output = runTransformation({
      dom,
      xmlContent: "<r/>",
      xsltContent:
        '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">' +
        '<xsl:include href="named.xsl"/><xsl:output method="text"/>' +
        '<xsl:template match="/"><xsl:call-template name="n"/>' +
        "<xsl:value-of select=\"name(document('doc.xml')/*)\"/></xsl:template></xsl:stylesheet>",
      params: {},
      values: {},
      xsltFile: join(baseDir, "main.xsl"),
      baseDir,
      warn: () => {},
    });
    assert.strictEqual(output, "Ndoc");
  });
});

describe("CLI result output", () => {
  /**
   * Create a fake writable stream recording what is written.
   * @param {boolean} [isTTY] - Whether the stream pretends to be a terminal
   * @returns {{isTTY: boolean, chunks: string[], write: Function}} Fake stream
   */
  const fakeStream = (isTTY = false) => ({
    isTTY,
    chunks: [],
    write(chunk) {
      this.chunks.push(chunk);
      return true;
    },
  });

  it("appends a newline only for a terminal", () => {
    assert.strictEqual(forStdout("<a/>", false), "<a/>");
    assert.strictEqual(forStdout("<a/>", true), "<a/>\n");
    assert.strictEqual(forStdout("<a/>\n", true), "<a/>\n");
  });

  it("writes to stdout or to the target file", async () => {
    const stdout = fakeStream(true);
    const stderr = fakeStream();
    await writeResult("<a/>", undefined, { stdout, stderr });
    assert.deepStrictEqual(stdout.chunks, ["<a/>\n"]);

    const dir = mkdtempSync(join(tmpdir(), "xslt-cli-out-"));
    try {
      const target = join(dir, "out.xml");
      await writeResult("<a/>", target, { stdout, stderr });
      assert.strictEqual(readFileSync(target, "utf-8"), "<a/>");
      assert.deepStrictEqual(stderr.chunks, [`Output written to ${target}\n`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses the process streams by default", async () => {
    const originalWrite = process.stdout.write;
    const chunks = [];
    process.stdout.write = (chunk) => chunks.push(chunk);
    try {
      await writeResult("<a/>");
    } finally {
      process.stdout.write = originalWrite;
    }
    assert.strictEqual(chunks[0].startsWith("<a/>"), true);
  });
});

describe("CLI path validation", () => {
  let baseDir;
  const savedBaseDir = process.env.XSLT_BASE_DIR;

  before(() => {
    baseDir = realpathSync(mkdtempSync(join(tmpdir(), "xslt-cli-paths-")));
    mkdirSync(join(baseDir, "dir"));
    writeFileSync(join(baseDir, "file.xml"), "<a/>");
  });

  after(() => {
    if (savedBaseDir === undefined) delete process.env.XSLT_BASE_DIR;
    else process.env.XSLT_BASE_DIR = savedBaseDir;
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("resolves the base directory from XSLT_BASE_DIR", () => {
    process.env.XSLT_BASE_DIR = baseDir;
    assert.strictEqual(resolveBaseDir(), baseDir);
    process.env.XSLT_BASE_DIR = join(baseDir, "file.xml");
    assert.throws(resolveBaseDir, /Base directory is not a directory/);
    process.env.XSLT_BASE_DIR = join(baseDir, "missing");
    assert.throws(resolveBaseDir, /Base directory does not exist/);
    delete process.env.XSLT_BASE_DIR;
    assert.strictEqual(resolveBaseDir(), realpathSync(process.cwd()));
  });

  it("validates input paths", () => {
    const file = join(baseDir, "file.xml");
    assert.strictEqual(resolveInputPath(file, "XML", baseDir), file);
    assert.throws(
      () => resolveInputPath("", "XML", baseDir),
      (error) =>
        error instanceof CliPathError &&
        /XML path is missing/.test(error.message),
    );
    assert.throws(() => resolveInputPath("a\0b", "XML", baseDir), /NUL byte/);
    assert.throws(
      () => resolveInputPath(join(baseDir, "dir"), "XML", baseDir),
      /not a file/,
    );
    assert.throws(
      () => resolveInputPath(tmpdir(), "XML", baseDir),
      /outside the allowed/,
    );
  });

  it("validates output paths", () => {
    const target = join(baseDir, "out.xml");
    assert.strictEqual(resolveOutputPath(target, baseDir), target);
    assert.strictEqual(
      resolveOutputPath(join(baseDir, "file.xml"), baseDir),
      join(baseDir, "file.xml"),
    );
    assert.throws(
      () => resolveOutputPath(join(baseDir, "nope", "o.xml"), baseDir),
      /does not exist/,
    );
    assert.throws(
      () => resolveOutputPath(join(baseDir, "file.xml", "o.xml"), baseDir),
      /Output directory is not a directory/,
    );
    assert.throws(
      () => resolveOutputPath(join(baseDir, "dir"), baseDir),
      /Output path is not a file/,
    );
    assert.throws(
      () => resolveOutputPath(join(tmpdir(), "o.xml"), baseDir),
      /outside the allowed/,
    );
  });
});
