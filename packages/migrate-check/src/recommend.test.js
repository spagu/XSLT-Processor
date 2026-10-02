import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFindings } from "./analysis/findings.js";
import { recommend, recommendedRuntime } from "./recommend.js";
import { NO_RUNTIME, POLYFILL_IMPORT, RECOMMENDATIONS } from "./texts.js";
import { scanResult, sheetFacts, usage } from "../test/fixtures.js";

/** Recommendations of a scan. */
const recommendScan = (overrides) =>
  recommend({ findings: buildFindings(scanResult(overrides)) });

const doc = (file) => ({ file, line: 2, href: "one.xsl", type: "text/xsl" });

describe("recommend", () => {
  it("counts the files to change: loader, xslt3, polyfill", () => {
    const recommendations = recommendScan({
      usages: [usage("src/a.js", 1)],
      migrated: [{ file: "src/done.js", count: 1 }],
      xmlDocuments: [doc("a.xml"), doc("b.xml"), doc("c.xml")],
      stylesheets: [
        sheetFacts({ file: "one.xsl" }),
        sheetFacts({ file: "two.xsl", version: "2.0" }),
        sheetFacts({ file: "three.xsl", version: "3.0" }),
        sheetFacts({ file: "four.xsl", documentFunction: true }),
        sheetFacts({ file: "five.xsl" }),
      ],
    });
    assert.deepEqual(
      recommendations.map((r) => [r.id, r.findings.length]),
      [
        ["loader", 3],
        ["xslt3", 2],
        ["polyfill", 1],
      ],
    );
    const polyfill = recommendations[2];
    assert.deepEqual(polyfill.findings, ["src/a.js"]);
    assert.ok(
      polyfill.why.endsWith(" The 2 stylesheets they run need no change."),
    );
    assert.deepEqual(polyfill.commands, ["npm install @tradik/xslt-processor"]);
    assert.equal(polyfill.snippet, POLYFILL_IMPORT);
    assert.ok(polyfill.alternative.startsWith("<script src="));
    assert.deepEqual(recommendations[1].findings, ["three.xsl", "two.xsl"]);
    assert.equal(
      recommendedRuntime(recommendations),
      "@tradik/xslt-processor + @tradik/xslt3",
    );
  });

  it("asks for an MSXML rewrite and covers HTML links with the loader", () => {
    const recommendations = recommendScan({
      usages: [usage("p.html", 1, "link")],
      stylesheets: [sheetFacts({ msxml: true, msxmlScript: true })],
    });
    assert.deepEqual(
      recommendations.map((r) => r.id),
      ["loader", "msxml"],
    );
    assert.equal(recommendations[1].snippet, null);
  });

  it("recommends server rendering for stylesheets without browser usage", () => {
    const recommendations = recommendScan({
      stylesheets: [
        sheetFacts({ file: "a.xsl" }),
        sheetFacts({ file: "m.xsl", msxmlScript: true }),
      ],
    });
    assert.deepEqual(
      recommendations.map((r) => [r.id, r.findings]),
      [
        ["msxml", ["m.xsl"]],
        ["server", ["a.xsl"]],
      ],
    );
    assert.equal(
      recommendedRuntime(recommendations),
      RECOMMENDATIONS.server.runtime,
    );
  });

  it("recommends nothing for server-side or migrated projects", () => {
    assert.deepEqual(
      recommendScan({
        stylesheets: [sheetFacts({ version: "2.0" })],
        serverSide: ["saxon-js"],
      }),
      [],
    );
    assert.deepEqual(
      recommendScan({ migrated: [{ file: "a.js", count: 1 }] }),
      [],
    );
  });
});

describe("polyfill explanation", () => {
  it("keeps the plain text when no stylesheet runs unchanged", () => {
    const [polyfill] = recommendScan({ usages: [usage("a.js", 1)] });
    assert.equal(polyfill.why, RECOMMENDATIONS.polyfill.why);
  });
});

describe("recommendedRuntime", () => {
  it("falls back through the runtimes", () => {
    const only = (id) => recommendedRuntime([{ id }]);
    assert.equal(only("polyfill"), "@tradik/xslt-processor");
    assert.equal(only("loader"), "@tradik/xslt-processor");
    assert.equal(only("msxml"), RECOMMENDATIONS.msxml.runtime);
    assert.equal(recommendedRuntime([]), NO_RUNTIME);
  });
});
