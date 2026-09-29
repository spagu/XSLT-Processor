/**
 * Unit tests of the standalone binary build helpers.
 *
 * Run: node --test "scripts/binaries/*.test.mjs"
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { describe, it } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { URL } from "node:url";
import { cliPatches, inlineDirnameReads, patchSource } from "./bundle.mjs";
import {
  CHECKSUMS_FILE,
  formatChecksums,
  writeChecksums,
} from "./checksums.mjs";
import { assertSeaVersion, expectedDigest, sha256 } from "./node-dist.mjs";
import { seaConfig } from "./sea.mjs";

describe("bundle patches", () => {
  it("applies literal replacements", () => {
    assert.equal(patchSource("a(b) a(b)", "x.js", [["a(b)", "c"]]), "c a(b)");
  });

  it("fails loudly when a patch target disappeared", () => {
    assert.throws(
      () => patchSource("abc", "x.js", [["zz", "y"]]),
      /x\.js: cannot find "zz"/,
    );
  });

  it("inlines the version and the jsdom import of the CLI", () => {
    const patches = cliPatches("9.8.7");
    const options = readFileSync(
      new URL("../../bin/lib/options.js", import.meta.url),
      "utf8",
    );
    const patched = patchSource(
      options,
      "options.js",
      patches["bin/lib/options.js"],
    );
    assert.match(patched, /VERSION = "9\.8\.7"/);
    assert.doesNotMatch(patched, /import\.meta/);

    const transform = readFileSync(
      new URL("../../bin/lib/transform.js", import.meta.url),
      "utf8",
    );
    assert.match(
      patchSource(transform, "transform.js", patches["bin/lib/transform.js"]),
      /import\("jsdom"\)/,
    );
  });

  it("inlines __dirname reads and neutralizes require.resolve", () => {
    const dir = mkdtempSync(join(tmpdir(), "xslt-bundle-"));
    try {
      writeFileSync(join(dir, "sheet.css"), 'a { content: "x" }\n');
      const source = [
        'const css = fs.readFileSync(\n  path.resolve(__dirname, "sheet.css"),\n  { encoding: "utf-8" }\n);',
        'const worker = require.resolve("./worker.js");',
      ].join("\n");
      const result = inlineDirnameReads(source, join(dir, "module.js"));
      assert.match(result, /const css = "a \{ content: \\"x\\" \}\\n";/);
      assert.match(
        result,
        /const worker = "\/standalone-binary-unavailable\/\.\/worker\.js";/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("node distribution", () => {
  it("accepts Node.js 25.5.0 and newer", () => {
    for (const version of ["v25.5.0", "v25.9.1", "v26.0.0", "v30.1.2"]) {
      assert.equal(assertSeaVersion(version), version);
    }
  });

  it("rejects versions without --build-sea and malformed ones", () => {
    for (const version of ["v25.4.9", "v24.12.0", "v22.0.0"]) {
      assert.throws(
        () => assertSeaVersion(version),
        /cannot build single executables/,
      );
    }
    assert.throws(() => assertSeaVersion("26"), /Invalid Node\.js version/);
  });

  it("finds digests in SHASUMS256.txt", () => {
    const shasums = "aa  node-v1-linux-x64.tar.gz\nbb  win-x64/node.exe\n";
    assert.equal(expectedDigest(shasums, "win-x64/node.exe"), "bb");
    assert.throws(() => expectedDigest(shasums, "nope"), /nope is not listed/);
  });

  it("hashes with SHA-256", () => {
    assert.equal(
      sha256(Buffer.from("abc")),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("sea config", () => {
  it("enables the code cache only for native builds", () => {
    const base = { main: "m.cjs", output: "o", executable: "node" };
    assert.deepEqual(seaConfig({ ...base, native: true }), {
      ...base,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: true,
    });
    assert.equal(seaConfig({ ...base, native: false }).useCodeCache, false);
  });
});

describe("checksums", () => {
  it("formats sha256sum lines sorted by name", () => {
    assert.equal(
      formatChecksums([
        { name: "xslt-windows-x64.exe", digest: "22" },
        { name: "xslt-darwin-arm64", digest: "11" },
      ]),
      "11  xslt-darwin-arm64\n22  xslt-windows-x64.exe\n",
    );
  });

  it("hashes only release executables", () => {
    const dir = mkdtempSync(join(tmpdir(), "xslt-sums-"));
    try {
      writeFileSync(join(dir, "xslt-linux-x64"), "abc");
      writeFileSync(join(dir, "xslt-linux-x64.tmp"), "ignored");
      writeFileSync(join(dir, "notes.txt"), "ignored");
      const file = writeChecksums(dir);
      assert.equal(file, join(dir, CHECKSUMS_FILE));
      assert.equal(
        readFileSync(file, "utf8"),
        `${sha256(Buffer.from("abc"))}  xslt-linux-x64\n`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses an empty directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "xslt-sums-"));
    try {
      assert.throws(
        () => writeChecksums(dir),
        /No xslt-<os>-<arch> executables/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
