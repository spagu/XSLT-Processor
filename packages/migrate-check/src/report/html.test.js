import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { analyze, toJson } from "../analysis/index.js";
import { LINKS } from "../texts.js";
import { formatDate, renderHtml } from "./html.js";
import { writeHtmlReport } from "./htmlFile.js";
import { escapeHtml } from "./htmlSections.js";
import {
  createFixture,
  removeFixture,
  scanResult,
  sheetFacts,
  usage,
} from "../../test/fixtures.js";

const generatedAt = new Date("2026-10-02T14:05:09Z");
const hostile = '<img src="https://evil.example/x.png" onerror="alert(1)">.xsl';

/** The analysis of a scan. */
function analysisOf(overrides = {}) {
  return analyze(scanResult({ scannedFiles: 9, ...overrides }), {
    version: "0.2.0",
    directory: "site/<b>/",
    durationMs: 1,
  });
}

const busy = () =>
  analysisOf({
    usages: [usage("src/a.js", 3), usage("src/a.js", 4, "transformToFragment")],
    xmlDocuments: [
      { file: "feed.xml", line: 2, href: "one.xsl", type: "text/xsl" },
    ],
    stylesheets: [
      sheetFacts({ file: "one.xsl" }),
      sheetFacts({ file: "two.xsl", version: "2.0" }),
      sheetFacts({ file: hostile, msxmlScript: true }),
    ],
  });

/** Parse a rendered report. */
function parse(analysis) {
  return new JSDOM(renderHtml(analysis, { generatedAt })).window.document;
}

describe("renderHtml", () => {
  it("has the title, meta tags, header and risk badge", () => {
    const document = parse(busy());
    assert.equal(document.title, "XSLT migration report: site/<b>/");
    assert.equal(document.documentElement.lang, "en");
    assert.equal(
      document.querySelector('meta[name="viewport"]').content,
      "width=device-width, initial-scale=1",
    );
    assert.match(
      document.querySelector('meta[name="description"]').content,
      /risk HIGH, 5 findings/,
    );
    assert.equal(document.querySelector(".risk .badge").textContent, "HIGH");
    assert.ok(
      document.querySelector(".risk .badge").classList.contains("badge-high"),
    );
    assert.equal(
      document.querySelector("time").getAttribute("datetime"),
      generatedAt.toISOString(),
    );
    assert.equal(
      document.querySelector("time").textContent,
      "2026-10-02 14:05 UTC",
    );
    assert.ok(
      document
        .querySelector(".meta")
        .textContent.includes("xslt-migrate-check 0.2.0"),
    );
  });

  it("shows the same numbers as the JSON", () => {
    const analysis = busy();
    const { summary } = toJson(analysis);
    const cells = Object.fromEntries(
      [...parse(analysis).querySelectorAll(".summary tr")].map((row) => [
        row.querySelector("th").textContent,
        row.querySelector("td").textContent,
      ]),
    );
    assert.deepEqual(cells, {
      "Native XSLTProcessor": `${summary.nativeUsages} usages`,
      "xml-stylesheet": `${summary.xmlStylesheetFiles} file`,
      Stylesheets: String(summary.stylesheets),
      "Compatible automatically": String(summary.automatic),
      "Manual review": String(summary.manualReview),
      "Recommended runtime": summary.recommendedRuntime,
      "Estimated migration difficulty": summary.difficulty,
    });
  });

  it("lists one row per finding with rating, location, reason and fix", () => {
    const analysis = busy();
    const rows = [...parse(analysis).querySelectorAll(".findings tbody tr")];
    assert.equal(rows.length, analysis.findings.length);
    assert.deepEqual(
      rows.map((row) => row.dataset.rating),
      ["HIGH", "HIGH", "HIGH", "MEDIUM", "LOW"],
    );
    const hostileRow = rows.find((row) => row.textContent.includes("evil"));
    assert.equal(hostileRow.cells[1].textContent, `${hostile}:1`);
    assert.equal(hostileRow.querySelector("img"), null);
  });

  it("makes no external request and links only the three documented pages", () => {
    const document = parse(busy());
    const sources = [...document.querySelectorAll("[src], link[href]")];
    assert.deepEqual(sources, []);
    assert.deepEqual(
      [...document.querySelectorAll("a")].map((a) => a.href),
      [LINKS.howTo, LINKS.docs, LINKS.npm],
    );
    assert.equal(document.querySelectorAll("style").length, 1);
  });

  it("shows the steps, the commands and the one-line fixes", () => {
    const document = parse(busy());
    const steps = [...document.querySelectorAll(".steps h3")].map(
      (h) => h.textContent,
    );
    assert.ok(steps.includes("Browser compatibility loader"));
    const code = [...document.querySelectorAll("pre code")].map(
      (c) => c.textContent,
    );
    assert.ok(
      code.includes("npm install @tradik/xslt-processor @tradik/xslt3"),
    );
    assert.ok(code.includes('import "@tradik/xslt-processor/polyfill";'));
    assert.equal(document.querySelectorAll("dl dt").length, 3);
  });

  it("filters and reverses the findings with the inline script", () => {
    const { document } = new JSDOM(renderHtml(busy(), { generatedAt }), {
      runScripts: "dangerously",
    }).window;
    document.querySelector('[data-filter="MEDIUM"]').click();
    const visible = () =>
      [...document.querySelectorAll(".findings tbody tr")]
        .filter((row) => !row.hidden)
        .map((row) => row.dataset.rating);
    assert.deepEqual(visible(), ["MEDIUM"]);
    assert.equal(
      document
        .querySelector('[data-filter="MEDIUM"]')
        .getAttribute("aria-pressed"),
      "true",
    );
    document.querySelector('[data-filter="ALL"]').click();
    document.querySelector(".sort").click();
    assert.deepEqual(visible(), ["LOW", "MEDIUM", "HIGH", "HIGH", "HIGH"]);
  });

  it("says there is nothing to do for an empty project", () => {
    const { document } = new JSDOM(renderHtml(analysisOf()), {
      runScripts: "dangerously",
    }).window;
    assert.equal(document.querySelector(".risk .badge").textContent, "NONE");
    assert.ok(document.body.textContent.includes("Nothing to do"));
    assert.ok(document.body.textContent.includes("No findings."));
  });
});

describe("helpers", () => {
  it("escapes the five HTML characters and formats the date", () => {
    assert.equal(
      escapeHtml(`<a href="x">'&'</a>`),
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
    assert.equal(escapeHtml(3), "3");
    assert.equal(formatDate(generatedAt), "2026-10-02 14:05 UTC");
  });

  it("writes the report and returns the absolute path", async () => {
    const dir = await createFixture({});
    try {
      const target = await writeHtmlReport(join(dir, "r.html"), "<p>x</p>");
      assert.equal(target, join(dir, "r.html"));
      assert.equal(await readFile(target, "utf8"), "<p>x</p>");
    } finally {
      await removeFixture(dir);
    }
  });
});
