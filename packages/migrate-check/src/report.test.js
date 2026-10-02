import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SUGGESTION } from "./migration.js";
import { formatReport } from "./report.js";

/** An Analysis with the given overrides. */
function analysis(overrides = {}) {
  return {
    version: "0.1.0",
    directory: "./",
    scannedFiles: 1284,
    durationMs: 400,
    risk: "NONE",
    needsXslt3: false,
    msxml: false,
    usages: [],
    stylesheets: [],
    xmlDocuments: [],
    migrated: [],
    serverSide: [],
    ...overrides,
  };
}

const sheet = (file, version, flags = {}) => ({
  file,
  version,
  exslt: false,
  disableOutputEscaping: false,
  documentFunction: false,
  key: false,
  msxml: false,
  ...flags,
});

describe("formatReport", () => {
  it("prints the headline, risk, suggestion and sections for a HIGH result", () => {
    const report = formatReport(
      analysis({
        risk: "HIGH",
        needsXslt3: true,
        usages: [
          { file: "src/a.js", line: 12, text: "new XSLTProcessor()" },
          { file: "src/a.js", line: 40, text: "p.importStylesheet(x)" },
          {
            file: "src/b.js",
            line: 3,
            text: "transformToFragment(d, document)",
          },
        ],
        stylesheets: [
          sheet("xsl/one.xsl", "1.0", { exslt: true }),
          sheet("xsl/two.xsl", "2.0"),
        ],
        xmlDocuments: [
          { file: "feed/rss.xml", line: 2, href: "rss.xsl", type: "text/xsl" },
        ],
      }),
    );
    const lines = report.split("\n");
    assert.equal(
      lines[0],
      "xslt-migrate-check 0.1.0 — scanned 1,284 files in ./ (0.4 s)",
    );
    assert.equal(lines[1], "");
    assert.equal(lines[2], "Found 3 XSLTProcessor usages in 2 files");
    assert.equal(
      lines[3],
      "Found 2 XSL stylesheets (1 × XSLT 1.0, 1 × XSLT 2.0)",
    );
    assert.equal(
      lines[4],
      "Found 1 XML document rendered with <?xml-stylesheet?>",
    );
    assert.equal(lines[5], "Chrome compatibility risk: HIGH");
    assert.equal(
      lines[6],
      "  Chrome 158 (17 November 2026) stops running XSLT; these pages break then.",
    );
    assert.equal(lines[7], "");
    assert.equal(lines[8], "Suggested migration: @tradik/xslt-processor");
    assert.equal(
      lines[9],
      "  One line, before your other scripts, keeps XSLTProcessor working:",
    );
    assert.equal(lines[10], `  ${SUGGESTION.script}`);
    assert.equal(
      lines[11],
      "  Inside an XML document rendered with <?xml-stylesheet?>, right after the processing instruction:",
    );
    assert.equal(lines[12], `  ${SUGGESTION.xmlScript}`);
    assert.equal(
      lines[13],
      '  XSLT 2.0/3.0 stylesheets: also install @tradik/xslt3 and pass { xsltVersion: "auto" }.',
    );
    assert.equal(lines[14], `  How-to: ${SUGGESTION.howTo}`);
    assert.ok(
      report.includes(
        "\nXSLTProcessor usages\n  src/a.js:12  new XSLTProcessor()\n",
      ),
    );
    assert.ok(
      report.includes(
        '\nXML documents with <?xml-stylesheet?>\n  feed/rss.xml:2  href="rss.xsl"\n',
      ),
    );
    assert.ok(
      report.includes(
        "\nXSL stylesheets\n  xsl/one.xsl  XSLT 1.0, EXSLT\n  xsl/two.xsl  XSLT 2.0\n",
      ),
    );
    assert.ok(!report.includes("Already using"));
    assert.ok(!report.includes("MSXML"));
    assert.ok(report.endsWith("\n"));
  });

  it("keeps only the risk line for an empty scan", () => {
    const report = formatReport(analysis({ scannedFiles: 1, durationMs: 50 }));
    assert.equal(
      report,
      [
        "xslt-migrate-check 0.1.0 — scanned 1 file in ./ (0.1 s)",
        "",
        "Chrome compatibility risk: NONE",
        "  No XSLT found; nothing here changes when Chrome 158 (17 November 2026) stops running XSLT.",
        "",
      ].join("\n"),
    );
  });

  it("explains MEDIUM, warns about MSXML and lists migrated and server-side findings", () => {
    const report = formatReport(
      analysis({
        risk: "MEDIUM",
        msxml: true,
        stylesheets: [sheet("s.xsl", "unknown", { msxml: true, key: true })],
        migrated: [{ file: "src/done.js", count: 1 }],
        serverSide: ["saxon-js", "xslt3"],
      }),
    );
    assert.ok(
      report.includes("Found 1 XSL stylesheet (1 × unknown version)\n"),
    );
    assert.ok(
      report.includes("Found 1 file already using @tradik/xslt-processor\n"),
    );
    assert.ok(
      report.includes(
        "Server-side / already migrated: package.json depends on saxon-js, xslt3\n",
      ),
    );
    assert.ok(
      report.includes(
        "Chrome compatibility risk: MEDIUM\n  Stylesheets found but no browser usage;",
      ),
    );
    assert.ok(
      report.includes(
        "  MSXML extensions (msxsl:) will not work in any browser polyfill; rewrite those templates.\n",
      ),
    );
    assert.ok(!report.includes("XSLT 2.0/3.0 stylesheets: also install"));
    assert.ok(
      report.includes(
        "\nAlready using @tradik/xslt-processor\n  src/done.js  1 usage\n",
      ),
    );
    assert.ok(
      report.includes(
        "\nXSL stylesheets\n  s.xsl  unknown version, xsl:key, MSXML extension: will not work in any browser polyfill\n",
      ),
    );
    assert.ok(!report.includes("XSLTProcessor usages"));
  });

  it("uses bold and dim codes only when asked", () => {
    const plain = formatReport(analysis());
    assert.ok(!plain.includes("\u001b["));
    const colored = formatReport(analysis({ risk: "HIGH" }), { color: true });
    assert.ok(
      colored.includes("\u001b[1mChrome compatibility risk: HIGH\u001b[22m"),
    );
    assert.ok(colored.includes("\u001b[2m  Chrome 158"));
  });
});
