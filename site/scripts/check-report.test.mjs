// The online check's texts: readiness, summary lines, the findings view and
// the Markdown report, on the analysis of the checker's sample project.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHECK_URL,
  markdownReport,
  plural,
  RATINGS,
  readiness,
  summaryLines,
  visibleFindings,
} from "../templates/xslt-site/js/check-report.js";
import { analyzeFiles } from "../../packages/migrate-check/src/analyze.js";
import { RATINGS as PACKAGE_RATINGS } from "../../packages/migrate-check/src/analysis/findings.js";
import { SAMPLE_PROJECT } from "../../packages/migrate-check/test/sample.js";

const sample = analyzeFiles(
  Object.entries(SAMPLE_PROJECT).map(([path, text]) => ({ path, text })),
);

describe("readiness", () => {
  it("is the share of findings the one-line migration covers", () => {
    const { percent, sentence } = readiness(sample.summary);
    assert.equal(percent, 90);
    assert.equal(
      sentence,
      "9 of 10 findings are covered by the one-line migration with no change to the stylesheets; 1 needs a person to look at it.",
    );
  });

  it("rounds down, and is 100% with nothing to migrate", () => {
    const summary = { findings: 200, automatic: 199, manualReview: 1 };
    assert.equal(readiness(summary).percent, 99);
    const one = readiness({ findings: 1, automatic: 1, manualReview: 0 });
    assert.equal(one.percent, 100);
    assert.match(one.sentence, /^1 of 1 finding is covered.*; none needs/);
    assert.match(
      readiness({ findings: 3, automatic: 0, manualReview: 3 }).sentence,
      /3 need a person/,
    );
    const none = readiness({ findings: 0, automatic: 0, manualReview: 0 });
    assert.equal(none.percent, 100);
    assert.match(none.sentence, /nothing breaks in Chrome 158/);
  });
});

describe("summary and findings", () => {
  it("writes the summary lines of the sample project", () => {
    assert.deepEqual(summaryLines(sample.summary), [
      "XSLTProcessor detected: yes",
      "xml-stylesheet detected: yes",
      "4 stylesheets",
      "9 compatible",
      "1 requires review",
    ]);
    const empty = analyzeFiles([{ path: "a.js", text: "" }]).summary;
    assert.deepEqual(summaryLines(empty), [
      "XSLTProcessor detected: no",
      "xml-stylesheet detected: no",
      "0 stylesheets",
      "0 compatible",
      "0 require review",
    ]);
    assert.equal(plural(1, "file"), "1 file");
    assert.equal(plural(5000, "file"), "5,000 files");
  });

  it("uses the package's rating order", () => {
    assert.deepEqual(RATINGS, PACKAGE_RATINGS);
  });

  it("filters by rating and orders by rating, then file", () => {
    const all = visibleFindings(sample.findings, {
      filter: "ALL",
      descending: true,
    });
    assert.equal(all.length, 10);
    assert.equal(all[0].rating, "HIGH");
    assert.equal(all[9].rating, "LOW");
    const up = visibleFindings(sample.findings, {
      filter: "ALL",
      descending: false,
    });
    assert.deepEqual(
      up.slice(0, 4).map((f) => f.file),
      [
        "styles/catalog.xsl",
        "styles/invoice.xsl",
        "styles/orders.xsl",
        "styles/modern.xsl",
      ],
    );
    const medium = visibleFindings(sample.findings, {
      filter: "MEDIUM",
      descending: true,
    });
    assert.deepEqual(
      medium.map((f) => f.file),
      ["styles/modern.xsl"],
    );
    assert.equal(sample.findings.length, 10, "the analysis is not reordered");
  });
});

describe("Markdown report", () => {
  it("has the summary, the findings and the steps", () => {
    const markdown = markdownReport(sample);
    assert.match(
      markdown,
      /^# XSLT migration check\n\nMigration readiness: 90%\n/,
    );
    assert.match(
      markdown,
      /\n- 4 stylesheets\n- 9 compatible\n- 1 requires review\n/,
    );
    assert.match(
      markdown,
      /Recommended migration: @tradik\/xslt-processor \+ @tradik\/xslt3/,
    );
    assert.match(
      markdown,
      /\| HIGH \| public\/catalog\.xml \| Uses <\?xml-stylesheet\?> \|/,
    );
    assert.match(
      markdown,
      /### 1\. Load @tradik\/xslt-processor before your XSLTProcessor code/,
    );
    assert.match(markdown, /```sh\nnpm install @tradik\/xslt-processor\n```/);
    assert.match(markdown, /Without a bundler:\n\n```\n<script src=/);
    assert.match(markdown, /### 3\. Add @tradik\/xslt3/);
    assert.match(
      markdown,
      /Files: public\/index\.html, src\/legacy\.js, src\/report\.js/,
    );
    assert.ok(markdown.includes(CHECK_URL));
    assert.match(markdown, /`npx xslt-migrate-check \. --html`/);
  });

  it("escapes table cells and leaves out empty sections", () => {
    const analysis = analyzeFiles([
      { path: "a|b.js", text: "new XSLTProcessor()" },
    ]);
    assert.match(markdownReport(analysis), /\| a\\\|b\.js \|/);
    const none = markdownReport(analyzeFiles([]));
    assert.doesNotMatch(none, /## Findings|## What to do/);
    assert.match(none, /Migration readiness: 100%/);
  });
});
