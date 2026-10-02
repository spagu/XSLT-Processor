import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyze } from "./index.js";
import { scanResult, sheetFacts, usage } from "../../test/fixtures.js";

/** The summary of a scan. */
const summaryOf = (overrides) =>
  analyze(scanResult(overrides), {
    version: "0.2.0",
    directory: "./",
    durationMs: 0,
  }).summary;

describe("summarize", () => {
  it("is LOW with nothing to migrate", () => {
    assert.deepEqual(summaryOf({}), {
      nativeUsages: 0,
      xmlStylesheetFiles: 0,
      stylesheets: 0,
      findings: 0,
      automatic: 0,
      manualReview: 0,
      recommendedRuntime: "none needed",
      difficulty: "LOW",
      difficultyReason: "Nothing uses XSLT, so nothing changes.",
    });
  });

  it("is LOW when the one-line migration covers everything", () => {
    const summary = summaryOf({
      usages: [usage("a.js", 1), usage("a.js", 2)],
      xmlDocuments: [
        { file: "f.xml", line: 2, href: "s.xsl", type: "text/xsl" },
      ],
      stylesheets: [sheetFacts()],
    });
    assert.equal(summary.nativeUsages, 2);
    assert.equal(summary.xmlStylesheetFiles, 1);
    assert.equal(summary.stylesheets, 1);
    assert.equal(summary.automatic, 3);
    assert.equal(summary.manualReview, 0);
    assert.equal(summary.difficulty, "LOW");
    assert.match(summary.difficultyReason, /covers every finding/);
  });

  it("is MEDIUM with manual review but no rewrite or XSLT 3.0", () => {
    const summary = summaryOf({
      usages: [usage("a.js", 1)],
      stylesheets: [sheetFacts({ documentFunction: true })],
    });
    assert.equal(summary.manualReview, 1);
    assert.equal(summary.difficulty, "MEDIUM");
    assert.equal(
      summary.difficultyReason,
      "1 of 2 findings need a manual check, but no stylesheet needs a rewrite or the XSLT 3.0 engine.",
    );
  });

  it("is HIGH with MSXML or XSLT 2.0/3.0 to handle", () => {
    const both = summaryOf({
      stylesheets: [
        sheetFacts({ file: "a.xsl", msxmlScript: true }),
        sheetFacts({ file: "b.xsl", version: "3.0" }),
      ],
    });
    assert.equal(both.difficulty, "HIGH");
    assert.equal(
      both.difficultyReason,
      "Some stylesheets need real work: 1 with MSXML extensions to rewrite, and 1 in XSLT 2.0/3.0 to test on @tradik/xslt3.",
    );
    const xslt3 = summaryOf({ stylesheets: [sheetFacts({ version: "2.0" })] });
    assert.equal(
      xslt3.difficultyReason,
      "Some stylesheets need real work: 1 in XSLT 2.0/3.0 to test on @tradik/xslt3.",
    );
  });
});
