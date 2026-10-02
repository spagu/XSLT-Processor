import assert from "node:assert/strict";
import { URL, fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { build } from "esbuild";
import { analyzeFiles, buildScan, isAnalysed, toJson } from "./analyze.js";
import { renderedXml, stylesheetXml } from "../test/fixtures.js";

const sample = [
  { path: "package.json", text: '{"dependencies":{"saxon-js":"^2"}}' },
  { path: "src/app.js", text: "const p = new XSLTProcessor();\n" },
  { path: "public/feed.xml", text: renderedXml("text/xsl", "../xsl/a.xsl") },
  {
    path: "xsl/a.xsl",
    text: stylesheetXml("1.0", '<xsl:include href="b.xsl"/>'),
  },
  { path: "logo.png", text: null },
  { path: "README.md" },
];

describe("analyzeFiles", () => {
  it("returns the analysis the CLI renders", () => {
    const analysis = analyzeFiles(sample);
    assert.equal(analysis.scannedFiles, 6);
    assert.equal(analysis.directory, "./");
    assert.equal(analysis.durationMs, 0);
    assert.equal(analysis.risk, "HIGH");
    assert.deepEqual(analysis.serverSide, ["saxon-js"]);
    assert.equal(analysis.stylesheets[0].includes[0].found, false);
    assert.deepEqual(
      analysis.recommendations.map((r) => r.id),
      ["polyfill", "loader"],
    );
    assert.equal(toJson(analysis).summary.findings, 3);
  });

  it("takes the label, the time and an include check", () => {
    const analysis = analyzeFiles(sample, {
      directory: "site/",
      durationMs: 5,
      exists: () => true,
    });
    assert.equal(analysis.directory, "site/");
    assert.equal(analysis.durationMs, 5);
    assert.equal(analysis.stylesheets[0].includes[0].found, true);
  });

  it("finds include targets among the files by default", () => {
    const scan = buildScan([
      ...sample,
      { path: "xsl/b.xsl", text: stylesheetXml() },
    ]);
    assert.equal(scan.stylesheets[0].includes[0].found, true);
  });

  it("names the files it reads", () => {
    assert.equal(isAnalysed("package.json"), true);
    assert.equal(isAnalysed("sub/package.json"), false);
    assert.equal(isAnalysed("a/b.XSL"), true);
    assert.equal(isAnalysed("logo.png"), false);
  });
});

describe("browser bundle of the analyze entry", () => {
  it("bundles for the browser without Node.js built-ins", async () => {
    const result = await build({
      entryPoints: [fileURLToPath(new URL("./analyze.js", import.meta.url))],
      bundle: true,
      platform: "browser",
      format: "esm",
      minify: true,
      write: false,
      metafile: true,
      logLevel: "silent",
    });
    const inputs = Object.keys(result.metafile.inputs);
    assert.ok(inputs.every((input) => !input.startsWith("node:")));
    const imports = Object.values(result.metafile.inputs).flatMap((input) =>
      input.imports.map((entry) => entry.path),
    );
    assert.ok(imports.every((path) => !path.startsWith("node:")));
    assert.ok(result.outputFiles[0].contents.length > 1000);
  });
});
