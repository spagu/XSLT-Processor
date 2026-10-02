import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeFiles } from "../analyze.js";
import { fixTargets, planFixes } from "./plan.js";
import { SAMPLE_PROJECT } from "../../test/sample.js";

/** The analysis and texts of a project given as path → text. */
function prepare(project) {
  const files = Object.entries(project).map(([path, text]) => ({ path, text }));
  const analysis = analyzeFiles(files);
  const texts = new Map(
    fixTargets(analysis)
      .filter((path) => path in project)
      .map((path) => [path, project[path]]),
  );
  return { analysis, texts };
}

describe("planFixes on the sample project", () => {
  it("changes the scripts, the page, the documents and package.json", () => {
    const { analysis, texts } = prepare(SAMPLE_PROJECT);
    const plan = planFixes(analysis, texts);
    assert.deepEqual(
      plan.edits.map((edit) => [edit.path, edit.change]),
      [
        [
          "package.json",
          "dependencies: @tradik/xslt-processor ^1.3.3, @tradik/xslt3 ^1.0.0",
        ],
        [
          "public/catalog.xml",
          "loader <script> as the first child of the root element",
        ],
        ["public/index.html", "CDN <script> in <head>"],
        [
          "public/invoice.xml",
          "loader <script> as the first child of the root element",
        ],
        [
          "public/orders.xml",
          "loader <script> as the first child of the root element",
        ],
        ["src/legacy.js", 'require("@tradik/xslt-processor/polyfill");'],
        ["src/report.js", 'import "@tradik/xslt-processor/polyfill";'],
      ],
    );
    assert.deepEqual(plan.skipped, []);
    assert.ok(!plan.edits.some((edit) => edit.path.endsWith(".xsl")));
  });
});

describe("planFixes skips", () => {
  it("lists what it leaves to the user", () => {
    const { analysis, texts } = prepare({
      "a.xml": '<?xml-stylesheet type="text/xsl" href="m.xsl"?>\n<r/>\n',
      "m.xsl":
        '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:msxsl="urn:schemas-microsoft-com:xslt"><msxsl:script>x</msxsl:script></xsl:stylesheet>',
      "b.xml": '<?xml-stylesheet type="text/xsl" href="n.xsl"?>\n',
      "page.html": "<body><script>new XSLTProcessor()</script></body>",
      "classic.js": "new XSLTProcessor();\n",
      "bin.js": "new XSLTProcessor();\u0000",
      "gone.js": "new XSLTProcessor();\n",
    });
    texts.delete("gone.js");
    const plan = planFixes(analysis, texts);
    assert.deepEqual(plan.edits, []);
    assert.deepEqual(
      plan.skipped.map((s) => s.path),
      ["a.xml", "b.xml", "bin.js", "classic.js", "gone.js", "page.html"],
    );
    assert.match(plan.skipped[0].reason, /MSXML/);
    assert.equal(plan.skipped[1].reason, "no document element found");
  });

  it("touches nothing without findings, and leaves a complete package.json", () => {
    assert.deepEqual(fixTargets(analyzeFiles([])), []);
    const { analysis, texts } = prepare({
      "package.json": '{"dependencies":{"@tradik/xslt-processor":"1"}}',
      "a.mjs": "new XSLTProcessor();\n",
    });
    // package.json declares the library already: only the script changes
    assert.deepEqual(
      planFixes(analysis, texts).edits.map((e) => e.path),
      ["a.mjs"],
    );
    const plain = prepare({ "a.mjs": "new XSLTProcessor();\n" });
    assert.deepEqual(
      planFixes(plain.analysis, plain.texts).edits.map((e) => e.path),
      ["a.mjs"],
    );
  });
});
