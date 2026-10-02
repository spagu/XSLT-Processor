import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyze } from "../analysis/index.js";
import { SUGGESTION } from "../migration.js";
import { POLYFILL_IMPORT } from "../texts.js";
import { formatReport } from "./terminal.js";
import { labelled } from "./summary.js";
import { scanResult, sheetFacts, usage } from "../../test/fixtures.js";

/** The analysis of a scan, as the CLI builds it. */
function analysisOf(overrides = {}, meta = {}) {
  return analyze(scanResult({ scannedFiles: 1284, ...overrides }), {
    version: "0.2.0",
    directory: "./",
    durationMs: 400,
    ...meta,
  });
}

const doc = {
  file: "public/invoice.xml",
  line: 2,
  href: "../styles/simple.xsl",
  type: "text/xsl",
};

describe("formatReport", () => {
  it("prints the headline, the migration report, the table, what to do and the sections", () => {
    const report = formatReport(
      analysisOf({
        usages: [
          usage("src/report.js", 12),
          usage("src/report.js", 13, "importStylesheet"),
        ],
        domParser: [
          { file: "src/report.js", line: 10, text: "new DOMParser()" },
        ],
        xmlDocuments: [doc],
        stylesheets: [
          sheetFacts({ file: "styles/simple.xsl" }),
          sheetFacts({ file: "styles/report.xsl", documentFunction: true }),
        ],
        migrated: [{ file: "src/done.js", count: 1 }],
      }),
    );
    const top = report.split("\n").slice(0, 27);
    assert.deepEqual(top, [
      "xslt-migrate-check 0.2.0 — scanned 1,284 files in ./ (0.4 s)",
      "",
      "Found 2 XSLTProcessor usages in 1 file",
      "Found 2 XSL stylesheets (2 × XSLT 1.0)",
      "Found 1 XML document rendered with <?xml-stylesheet?>",
      "Found 1 file already using @tradik/xslt-processor",
      "",
      "Chrome 158 Migration Report",
      "",
      "Risk: HIGH",
      "  Chrome 158 (17 November 2026) stops running XSLT; these pages break then.",
      "",
      "Native XSLTProcessor:      2 usages",
      "xml-stylesheet:            1 file",
      "Stylesheets:               2",
      "Compatible automatically:  4",
      "Manual review:             1",
      "",
      "Recommended runtime:       @tradik/xslt-processor",
      "Estimated migration difficulty: MEDIUM",
      "  1 of 5 findings need a manual check, but no stylesheet needs a rewrite or the XSLT 3.0 engine.",
      "",
      "Found 5 XSLT usages",
      "",
      "HIGH    public/invoice.xml  Uses <?xml-stylesheet?>",
      "HIGH    src/report.js       Uses native XSLTProcessor",
      "MEDIUM  styles/report.xsl   Uses document()",
    ]);
    assert.ok(
      report.includes("\nLOW     styles/simple.xsl   Standard XSLT 1.0\n"),
    );
    assert.ok(
      report.includes(
        "\nWhat to do\n\n1. Load @tradik/xslt-processor before your XSLTProcessor code (1 file)\n",
      ),
    );
    assert.ok(report.includes(" The 1 stylesheet they run needs no change.\n"));
    assert.ok(report.includes("   $ npm install @tradik/xslt-processor\n"));
    assert.ok(report.includes(`   ${POLYFILL_IMPORT}\n`));
    assert.ok(
      report.includes(`   or, without a bundler: ${SUGGESTION.script}\n`),
    );
    assert.ok(report.includes(`2. Browser compatibility loader (1 file)\n`));
    assert.ok(report.includes(`   ${SUGGESTION.xmlScript}\n`));
    assert.ok(report.includes(`\nHow-to: ${SUGGESTION.howTo}\n`));
    assert.ok(
      report.includes(
        "\nXSLTProcessor usages\n  src/report.js:12  call XSLTProcessor\n",
      ),
    );
    assert.ok(
      report.includes(
        "\nDOMParser next to them (context, not a risk)\n  src/report.js:10  new DOMParser()\n",
      ),
    );
    assert.ok(
      report.includes(
        '\nXML documents with <?xml-stylesheet?>\n  public/invoice.xml:2  href="../styles/simple.xsl"\n',
      ),
    );
    assert.ok(
      report.includes(
        "\nXSL stylesheets\n  styles/simple.xsl  XSLT 1.0\n  styles/report.xsl  XSLT 1.0, document()\n",
      ),
    );
    assert.ok(
      report.includes(
        "\nAlready using @tradik/xslt-processor\n  src/done.js  1 usage\n",
      ),
    );
    assert.ok(report.endsWith("\n"));
  });

  it("keeps the migration report short for an empty scan", () => {
    const report = formatReport(
      analysisOf({ scannedFiles: 1 }, { durationMs: 50 }),
    );
    assert.equal(
      report,
      [
        "xslt-migrate-check 0.2.0 — scanned 1 file in ./ (0.1 s)",
        "",
        "Chrome 158 Migration Report",
        "",
        "Risk: NONE",
        "  No XSLT found; nothing here changes when Chrome 158 (17 November 2026) stops running XSLT.",
        "",
        "Native XSLTProcessor:      0 usages",
        "xml-stylesheet:            0 files",
        "Stylesheets:               0",
        "Compatible automatically:  0",
        "Manual review:             0",
        "",
        "Recommended runtime:       none needed",
        "Estimated migration difficulty: LOW",
        "  Nothing uses XSLT, so nothing changes.",
        "",
      ].join("\n"),
    );
  });

  it("explains MEDIUM and LOW, and lists server-side packages", () => {
    const medium = formatReport(
      analysisOf({
        stylesheets: [sheetFacts({ msxml: true, version: "2.0" })],
      }),
    );
    assert.ok(
      medium.includes(
        "Risk: MEDIUM\n  Nothing calls the browser's XSLT directly",
      ),
    );
    assert.ok(
      medium.includes(
        "MEDIUM  s.xsl  Declares XSLT 2.0; needs @tradik/xslt3\n",
      ),
    );
    const low = formatReport(
      analysisOf({
        stylesheets: [sheetFacts()],
        serverSide: ["saxon-js", "xslt3"],
      }),
    );
    assert.ok(low.includes("Risk: LOW\n  Only standard XSLT"));
    assert.ok(
      low.includes(
        "Server-side / already migrated: package.json depends on saxon-js, xslt3\n",
      ),
    );
    assert.ok(!low.includes("What to do"));
  });

  it("uses bold and dim codes only when asked", () => {
    const plain = formatReport(analysisOf());
    assert.ok(!plain.includes("\u001b["));
    const colored = formatReport(analysisOf({ usages: [usage("a.js", 1)] }), {
      color: true,
    });
    assert.ok(colored.includes("\u001b[1mRisk: HIGH\u001b[22m"));
    assert.ok(colored.includes("\u001b[2m  Chrome 158"));
  });

  it("does not let a long path widen the table without limit", () => {
    const long = `${"deep/".repeat(12)}a.xsl`;
    const report = formatReport(
      analysisOf({ stylesheets: [sheetFacts({ file: long })] }),
    );
    assert.ok(report.includes(`LOW     ${long}  Standard XSLT 1.0\n`));
    assert.equal(labelled("Stylesheets", 3), "Stylesheets:               3");
  });
});
