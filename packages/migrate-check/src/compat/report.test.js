import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NO_REFERENCE_REASON,
  formatTestReport,
  summarizeResults,
  toTestJson,
} from "./report.js";

const pair = (xsl, extra) => ({ xml: "doc.xml", xsl, params: {}, ...extra });

/** 44 matches, 2 differences, 1 error: the shape of the docs. */
const results = [
  ...Array.from({ length: 44 }, (_, i) =>
    pair(`s${i}.xsl`, { status: "MATCH" }),
  ),
  pair("invoice.xsl", {
    status: "DIFFERENT",
    path: "/html/body/total/text()",
    expected: "<total>123.00</total>",
    actual: "<total>123</total>",
    expectedOutput: "<total>123.00</total>\n",
    actualOutput: "<total>123</total>\n",
  }),
  pair("list.xsl", {
    status: "DIFFERENT",
    path: "/ul",
    expected: "<ul>\n<li/>\n</ul>",
    actual: "<ul/>",
    expectedOutput: "<ul>\n<li/>\n</ul>",
    actualOutput: "<ul/>",
  }),
  pair("broken.xsl", { status: "ERROR", engine: "Tradik", message: "boom" }),
];

describe("summarizeResults", () => {
  it("computes the compatibility with one decimal", () => {
    assert.deepEqual(summarizeResults(results), {
      tested: 47,
      match: 44,
      different: 2,
      error: 1,
      skipped: 0,
      compatibility: 93.6,
    });
    assert.equal(summarizeResults([]).compatibility, null);
  });
});

describe("formatTestReport", () => {
  it("prints the documented shape", () => {
    const text = formatTestReport(results, { reference: "xsltproc" });
    assert.ok(
      text.startsWith(
        "Reference engine: xsltproc\n\n47 transformations tested\n\nMATCH:             44\nDIFFERENT OUTPUT:   2\nERROR:              1\n\nCompatibility: 93.6%\n\ninvoice.xsl\n  Input:     doc.xml\n  Expected:  <total>123.00</total>\n  Tradik:    <total>123</total>\n  At:        /html/body/total/text()\n",
      ),
      text,
    );
    assert.ok(
      text.includes(
        "  Expected:  <ul>\n             <li/>\n             </ul>\n",
      ),
    );
    assert.ok(
      text.endsWith(
        "broken.xsl\n  Input:     doc.xml\n  Error:     Tradik: boom\n",
      ),
    );
  });

  it("prints full diffs, SKIPPED, and n/a for a smoke test", () => {
    const full = formatTestReport(results.slice(44, 45), {
      reference: "x",
      diff: "full",
    });
    assert.ok(
      full.includes(
        "  --- expected (x)\n  +++ tradik\n  @@ -1,1 +1,1 @@\n  -<total>123.00</total>\n  +<total>123</total>\n",
      ),
    );
    const smoke = formatTestReport(
      [
        pair("a.xsl", { status: "SKIPPED", reason: NO_REFERENCE_REASON }),
        pair("b.xsl", {
          status: "SKIPPED",
          reason: "stylesheet not found in the project",
        }),
      ],
      { reference: "none" },
    );
    assert.ok(
      smoke.includes(
        "\nSKIPPED:            2\n\nCompatibility: n/a (nothing was compared)\n",
      ),
    );
    assert.ok(!smoke.includes("a.xsl"));
    assert.ok(
      smoke.includes(
        "b.xsl\n  Input:     doc.xml\n  Skipped:   stylesheet not found",
      ),
    );
    assert.ok(
      formatTestReport([pair("a.xsl", { status: "MATCH" })], {
        reference: "x",
      }).includes("1 transformation tested"),
    );
  });
});

describe("toTestJson", () => {
  it("puts the meta, the counts and the results together", () => {
    const json = toTestJson(results.slice(0, 1), {
      version: "0.3.0",
      reference: "x",
    });
    assert.deepEqual(Object.keys(json), [
      "version",
      "reference",
      "tested",
      "match",
      "different",
      "error",
      "skipped",
      "compatibility",
      "results",
    ]);
    assert.equal(json.compatibility, 100);
  });
});
