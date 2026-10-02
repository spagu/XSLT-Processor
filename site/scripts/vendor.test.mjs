// The @tradik/xslt3 browser bundle of the playground and the mode selection.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import {
  compareMode,
  isMode,
  loadMode,
  MODE_KEY,
  MODES,
  modeUrl,
  resolveMode,
  saveMode,
} from "../templates/xslt-site/js/playground-modes.js";
import {
  buildMigrateCheckBundle,
  buildXslt3Bundle,
  formatSize,
  MIGRATE_CHECK_BUNDLE,
  noNodeBuiltins,
  protectCdnNames,
  XSLT3_BUNDLE,
} from "./vendor.mjs";
import { SAMPLE_PROJECT } from "../../packages/migrate-check/test/sample.js";

const { DOMParser } = new JSDOM("").window;
const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("xslt3 bundle", () => {
  it("bundles @tradik/xslt3 into one working ES module", async () => {
    const dir = mkdtempSync(join(tmpdir(), "xslt3-bundle-"));
    try {
      const outfile = join(dir, XSLT3_BUNDLE);
      const size = await buildXslt3Bundle({
        entry: join(rootDir, "packages", "xslt3", "src", "index.js"),
        outfile,
      });
      assert.ok(size.raw > size.gzip && size.gzip > 0);
      const lib = await import(pathToFileURL(outfile).href);
      const [result] = lib.evaluateXPath("sum(1 to 10)", null);
      assert.equal(result.type.prefixedName, "xs:integer");
      assert.equal(result.value, 55n);
      assert.equal(typeof lib.VERSION, "string");
      // The XSLT 3.0 mode uses the same bundle.
      const parseXml = (text) =>
        new DOMParser().parseFromString(text, "application/xml");
      const stylesheet = lib.compileStylesheet(
        '<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" expand-text="yes"><xsl:output method="text"/><xsl:template match="/">{count(//b)}</xsl:template></xsl:stylesheet>',
        { parseXml },
      );
      const run = stylesheet.transform({ source: parseXml("<a><b/><b/></a>") });
      assert.equal(lib.serialize([run.principal].flat(), run.output), "2");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("formats sizes in kilobytes", () => {
    assert.equal(formatSize(144731), "144.7 kB");
    assert.equal(formatSize(0), "0.0 kB");
  });
});

describe("xslt-migrate-check bundle", () => {
  it("runs the analysis and the HTML report in one ES module", async () => {
    const dir = mkdtempSync(join(tmpdir(), "migrate-check-bundle-"));
    try {
      const outfile = join(dir, MIGRATE_CHECK_BUNDLE);
      const size = await buildMigrateCheckBundle({
        entry: join(rootDir, "site", "scripts", "migrate-check-entry.mjs"),
        outfile,
      });
      assert.ok(size.raw > size.gzip && size.gzip > 0);
      const code = readFileSync(outfile, "utf8");
      assert.doesNotMatch(code, /node:/);
      assert.doesNotMatch(code, /xslt-processor\.browser\.min\.js/);
      const lib = await import(pathToFileURL(outfile).href);
      const files = Object.entries(SAMPLE_PROJECT).map(([path, text]) => ({
        path,
        text,
      }));
      const analysis = lib.analyzeFiles(files);
      assert.equal(analysis.summary.automatic, 9);
      assert.match(
        analysis.recommendations[0].alternative,
        /dist\/xslt-processor\.browser\.min\.js"><\/script>$/,
      );
      assert.match(lib.renderHtml(analysis), /Chrome 158 Migration Report/);
      assert.equal(lib.isAnalysed("a.xsl"), true);
      assert.equal(lib.createIgnoreMatcher()("node_modules"), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a Node.js built-in in the online check's bundle", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vendor-node-"));
    try {
      const entry = join(dir, "entry.mjs");
      writeFileSync(
        entry,
        'import { readFile } from "node:fs/promises";\nexport { readFile };\n',
      );
      await assert.rejects(
        build({
          entryPoints: [entry],
          bundle: true,
          write: false,
          plugins: [noNodeBuiltins],
        }),
        /node:fs\/promises imported by .*not available in the browser/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("escapes the file name of CDN URLs, not of local ones", () => {
    const cdn =
      "https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/x.min.js";
    assert.equal(
      protectCdnNames(`a="${cdn}";b=\`${cdn} \`;c="./x.min.js"`),
      `a="${cdn.replace(/\.js$/, "\\x2ejs")}";b=\`${cdn.replace(/\.js$/, "\\x2ejs")} \`;c="./x.min.js"`,
    );
    assert.equal(
      protectCdnNames('"https://unpkg.com/npm/p/a.js\\"'),
      '"https://unpkg.com/npm/p/a\\x2ejs\\"',
    );
  });
});

describe("playground modes", () => {
  it("knows its modes", () => {
    assert.ok(isMode("xslt") && isMode("xslt3") && isMode("xpath"));
    assert.equal(isMode("xslt2"), false);
    assert.equal(isMode(null), false);
  });

  it("prefers ?mode=, then the stored mode, then XSLT 1.0", () => {
    assert.equal(resolveMode("?mode=xpath", "xslt"), MODES.xpath);
    assert.equal(resolveMode("?mode=xslt3", "xpath"), MODES.xslt3);
    assert.equal(resolveMode("", "xslt3"), MODES.xslt3);
    assert.equal(resolveMode("?mode=other", "xpath"), MODES.xpath);
    assert.equal(resolveMode("", "bogus"), MODES.xslt);
    assert.equal(resolveMode("", null), MODES.xslt);
  });

  it("puts the mode in the address, XSLT 1.0 without a parameter", () => {
    const base = "https://example.com/playground/";
    assert.equal(modeUrl(base, "xpath"), `${base}?mode=xpath`);
    assert.equal(modeUrl(`${base}?mode=xpath`, "xslt3"), `${base}?mode=xslt3`);
    assert.equal(modeUrl(`${base}?mode=xpath&x=1#r`, "xslt"), `${base}?x=1#r`);
  });

  it("compares XSLT 1.0 and 3.0 with each other, not XPath", () => {
    assert.equal(compareMode(MODES.xslt), MODES.xslt3);
    assert.equal(compareMode(MODES.xslt3), MODES.xslt);
    assert.equal(compareMode(MODES.xpath), null);
  });

  it("remembers the mode when storage works", () => {
    const store = new Map();
    const storage = () => ({
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
    });
    assert.equal(loadMode(storage), null);
    saveMode(storage, "xpath");
    assert.equal(store.get(MODE_KEY), "xpath");
    assert.equal(loadMode(storage), "xpath");
  });

  it("does without storage when it is blocked", () => {
    const blocked = () => {
      throw new Error("SecurityError");
    };
    assert.equal(loadMode(blocked), null);
    assert.doesNotThrow(() => saveMode(blocked, "xpath"));
  });
});
