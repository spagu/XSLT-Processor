import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { plainReason, rateStylesheet, stylesheetIssues } from "./rating.js";
import { sheetFacts } from "../../test/fixtures.js";

const project = { fragment: false };

/** The issue codes of a stylesheet. */
const codes = (sheet, context = project) =>
  stylesheetIssues(sheet, context).map((issue) => issue.code);

describe("rateStylesheet", () => {
  it("rates standard XSLT 1.0 LOW", () => {
    assert.deepEqual(rateStylesheet(sheetFacts(), project), {
      rating: "LOW",
      reason: "Standard XSLT 1.0",
      issues: [],
    });
  });

  it("rates document() MEDIUM", () => {
    const rated = rateStylesheet(
      sheetFacts({ documentFunction: true }),
      project,
    );
    assert.equal(rated.rating, "MEDIUM");
    assert.equal(rated.reason, "Uses document()");
  });

  it("rates XSLT 2.0 and 3.0 MEDIUM", () => {
    const rated = rateStylesheet(sheetFacts({ version: "2.0" }), project);
    assert.equal(rated.rating, "MEDIUM");
    assert.equal(rated.reason, "Declares XSLT 2.0; needs @tradik/xslt3");
  });

  it("rates MSXML HIGH and quotes only the HIGH issues", () => {
    const rated = rateStylesheet(
      sheetFacts({
        msxml: true,
        msxmlScript: true,
        msxmlFunctions: ["msxsl:format-date"],
        documentFunction: true,
      }),
      project,
    );
    assert.equal(rated.rating, "HIGH");
    assert.equal(
      rated.reason,
      "Uses msxsl:script (MSXML); no browser runtime runs it; Uses MSXML msxsl:format-date; no browser runtime runs it",
    );
    assert.equal(rated.issues.length, 3);
  });

  it("rates unsupported EXSLT, dyn:evaluate and extensions MEDIUM", () => {
    const sheet = sheetFacts({
      exsltModules: ["common", "dynamic", "functions"],
      unsupportedExslt: ["date:format-date"],
      extensionFunctions: ["saxon:evaluate"],
      extensionNamespaces: ["urn:ext"],
    });
    assert.deepEqual(codes(sheet), [
      "extension",
      "exslt-unsupported",
      "exslt-dynamic",
    ]);
    assert.equal(
      rateStylesheet(sheet, project).reason,
      "Uses extensions saxon:evaluate, urn:ext; Uses EXSLT functions, date:format-date, which no browser runtime supports; Uses EXSLT dynamic; dyn:evaluate is off by default",
    );
  });

  it("rates missing include targets MEDIUM and ignores found or remote ones", () => {
    const sheet = sheetFacts({
      includes: [
        { kind: "xsl:import", href: "gone.xsl", line: 2, found: false },
        { kind: "xsl:include", href: "a.xsl", line: 3, found: true },
        { kind: "xsl:include", href: "https://x/a.xsl", line: 4, found: null },
      ],
    });
    const rated = rateStylesheet(sheet, project);
    assert.equal(rated.rating, "MEDIUM");
    assert.equal(rated.reason, "Missing xsl:import gone.xsl");
  });

  it("rates disable-output-escaping MEDIUM only with transformToFragment", () => {
    const sheet = sheetFacts({ disableOutputEscaping: true });
    assert.deepEqual(codes(sheet), []);
    assert.deepEqual(codes(sheet, { fragment: true }), ["doe-fragment"]);
  });
});

describe("plainReason", () => {
  it("names the version and the supported extras", () => {
    assert.equal(
      plainReason(sheetFacts({ version: "unknown" })),
      "No version declared; runs as XSLT 1.0",
    );
    assert.equal(
      plainReason(
        sheetFacts({ exsltModules: ["common", "math"], msxml: true }),
      ),
      "XSLT 1.0 with EXSLT common, math, msxsl:node-set",
    );
  });
});
