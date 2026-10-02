import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hardIssues } from "./browserFindings.js";
import { RATINGS, buildFindings, compareFindings } from "./findings.js";
import { scanResult, sheetFacts, usage } from "../../test/fixtures.js";

/** The findings of a scan, by file. */
function byFile(scan) {
  return new Map(buildFindings(scan).map((f) => [f.file, f]));
}

const doc = (file, href) => ({ file, line: 2, href, type: "text/xsl" });

describe("buildFindings", () => {
  it("prints the four cases of the task in order, HIGH first", () => {
    const findings = buildFindings(
      scanResult({
        usages: [usage("src/report.js", 3)],
        xmlDocuments: [doc("public/invoice.xml", "../styles/simple.xsl")],
        stylesheets: [
          sheetFacts({ file: "styles/simple.xsl" }),
          sheetFacts({ file: "styles/report.xsl", documentFunction: true }),
        ],
      }),
    );
    assert.deepEqual(
      findings.map((f) => [f.rating, f.file, f.reason]),
      [
        ["HIGH", "public/invoice.xml", "Uses <?xml-stylesheet?>"],
        ["HIGH", "src/report.js", "Uses native XSLTProcessor"],
        ["MEDIUM", "styles/report.xsl", "Uses document()"],
        ["LOW", "styles/simple.xsl", "Standard XSLT 1.0"],
      ],
    );
    assert.deepEqual(
      findings.map((f) => f.automatic),
      [true, true, false, true],
    );
  });

  it("groups the usages of a script file and adds the DOMParser context", () => {
    const script = byFile(
      scanResult({
        usages: [
          usage("a.js", 4),
          usage("a.js", 5, "importStylesheet"),
          usage("b.js", 1),
        ],
        domParser: [{ file: "a.js", line: 1, text: "new DOMParser()" }],
      }),
    ).get("a.js");
    assert.equal(script.line, 4);
    assert.equal(script.kind, "script");
    assert.deepEqual(script.details, [
      "line 4: call XSLTProcessor",
      "line 5: call importStylesheet",
      "line 1: DOMParser prepares the input (context)",
    ]);
  });

  it("rates HTML that only links XSL HIGH and not automatic", () => {
    const link = byFile(
      scanResult({ usages: [usage("p.html", 2, "link")] }),
    ).get("p.html");
    assert.equal(link.kind, "html-link");
    assert.equal(link.rating, "HIGH");
    assert.equal(link.automatic, false);
    assert.equal(link.reason, 'Links an XSL stylesheet (type="text/xsl")');
  });

  it("takes an XML document out of the automatic set when its stylesheet needs work", () => {
    const findings = byFile(
      scanResult({
        xmlDocuments: [
          doc("a.xml", "two.xsl"),
          doc("b.xml", "/ms.xsl"),
          doc("c.xml", "https://example.com/x.xsl"),
        ],
        stylesheets: [
          sheetFacts({ file: "two.xsl", version: "2.0" }),
          sheetFacts({ file: "ms.xsl", msxml: true, msxmlScript: true }),
        ],
      }),
    );
    assert.equal(
      findings.get("a.xml").reason,
      "Uses <?xml-stylesheet?>; its stylesheet needs @tradik/xslt3",
    );
    assert.deepEqual(findings.get("a.xml").issues, ["xml-stylesheet", "xslt3"]);
    assert.equal(
      findings.get("b.xml").reason,
      "Uses <?xml-stylesheet?>; its stylesheet needs an MSXML rewrite",
    );
    assert.equal(findings.get("b.xml").automatic, false);
    assert.equal(findings.get("c.xml").automatic, true);
  });

  it("lowers MEDIUM stylesheets to LOW in a server-side project without browser usage", () => {
    const sheets = [
      sheetFacts({ file: "a.xsl", version: "2.0" }),
      sheetFacts({ file: "m.xsl", msxmlScript: true }),
    ];
    const server = byFile(
      scanResult({ stylesheets: sheets, serverSide: ["saxon-js"] }),
    );
    assert.equal(server.get("a.xsl").rating, "LOW");
    assert.equal(
      server.get("a.xsl").reason,
      "Runs on the server (saxon-js); Declares XSLT 2.0; needs @tradik/xslt3",
    );
    assert.deepEqual(server.get("a.xsl").issues, ["xslt3", "server-only"]);
    assert.equal(server.get("m.xsl").rating, "HIGH");
    const browser = byFile(
      scanResult({
        stylesheets: sheets,
        serverSide: ["saxon-js"],
        usages: [usage("x.js", 1)],
      }),
    );
    assert.equal(browser.get("a.xsl").rating, "MEDIUM");
  });

  it("uses transformToFragment anywhere as context for disable-output-escaping", () => {
    const findings = byFile(
      scanResult({
        usages: [usage("x.js", 1, "transformToFragment")],
        stylesheets: [sheetFacts({ disableOutputEscaping: true })],
      }),
    );
    assert.equal(findings.get("s.xsl").rating, "MEDIUM");
  });

  it("rates migrated files LOW", () => {
    const [migrated] = buildFindings(
      scanResult({ migrated: [{ file: "done.js", count: 2 }] }),
    );
    assert.equal(migrated.rating, "LOW");
    assert.equal(migrated.reason, "Already loads @tradik/xslt-processor");
  });
});

describe("helpers", () => {
  it("compares by rating, then path", () => {
    const sorted = [
      { rating: "LOW", file: "a" },
      { rating: "HIGH", file: "b" },
      { rating: "HIGH", file: "a" },
      { rating: "HIGH", file: "a" },
    ].sort(compareFindings);
    assert.deepEqual(
      sorted.map((f) => f.rating + f.file),
      ["HIGHa", "HIGHa", "HIGHb", "LOWa"],
    );
    assert.deepEqual(RATINGS, ["HIGH", "MEDIUM", "LOW"]);
  });

  it("hardIssues tolerates a missing finding", () => {
    assert.deepEqual(hardIssues(undefined), []);
    assert.deepEqual(hardIssues({ issues: ["document", "xslt3"] }), ["xslt3"]);
  });
});
