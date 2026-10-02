/**
 * Unit tests of the pure helpers of the XSLT engine benchmark: output
 * normalization and comparison, pre-check problems, scenarios and inputs,
 * start-up helpers. Tables, charts and page text: xsltCharts.test.mjs.
 *
 * Run: node --test scripts/benchmark/xslt.test.mjs
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { describe, it } from "node:test";
import { splitSuite } from "./xpath.mjs";
import { XSLT30_INPUTS } from "./xslt30Inputs.mjs";
import { againstOf, compareRuns, describeProblem } from "./xsltCheck.mjs";
import {
  compareOutputs,
  excerpt,
  firstDifference,
  normalizeLoose,
  normalizeOutput,
} from "./xsltCompare.mjs";
import { engineSlug } from "./xsltEngines.mjs";
import { jsonAsXml, ordersJson } from "./xsltJson.mjs";
import { describeXslt } from "./xsltMeasure.mjs";
import { REWRITES, replaceAll, stylesheet3 } from "./xsltRewrites.mjs";
import {
  XSLT_SCENARIOS,
  pickScenarios,
  scenarioInput,
} from "./xsltScenarios.mjs";
import { importProbe, sizesOf } from "./xsltStartup.mjs";

describe("normalizeOutput", () => {
  it("drops the line break after the XML declaration", () => {
    assert.equal(
      normalizeOutput('<?xml version="1.0" encoding="UTF-8"?>\n<a/>'),
      '<?xml version="1.0" encoding="UTF-8"?><a/>',
    );
  });

  it("drops a leading HTML5 doctype", () => {
    assert.equal(normalizeOutput("<!DOCTYPE html>\n<html/>"), "<html/>");
  });

  it("keeps everything else", () => {
    const text = "<a>\n<b/></a>\n<!DOCTYPE html>";
    assert.equal(normalizeOutput(text), text);
  });

  it("loose: also drops whitespace between tags", () => {
    assert.equal(normalizeLoose("<a>\n  <b/> x </a>"), "<a><b/> x </a>");
  });
});

describe("comparing outputs", () => {
  it("finds the first difference", () => {
    assert.equal(firstDifference("abc", "abc"), -1);
    assert.equal(firstDifference("abc", "abd"), 2);
    assert.equal(firstDifference("ab", "abc"), 2);
  });

  it("quotes an excerpt around an offset", () => {
    assert.equal(excerpt("0123456789", 5, 2), '"3456"');
    assert.equal(excerpt("0123", 0, 2), '"01"');
  });

  it("reports equal outputs as null, after normalizing", () => {
    assert.equal(compareOutputs("<?xml?>\n<a/>", "<?xml?><a/>"), null);
  });

  it("describes a difference", () => {
    assert.deepEqual(compareOutputs("<a>1</a>", "<a>2</a>"), {
      offset: 3,
      chars: [8, 8],
      context: ['"<a>1</a>"', '"<a>2</a>"'],
    });
  });

  it("takes another normalizer", () => {
    assert.equal(
      compareOutputs("<a> <b/></a>", "<a><b/></a>", normalizeLoose),
      null,
    );
  });
});

describe("pre-check problems", () => {
  const where = { id: "x", dom: "jsdom" };

  it("reports a failing candidate", () => {
    assert.deepEqual(
      compareRuns(where, "ref", { output: "" }, { error: "E" }),
      [{ ...where, kind: "error", against: "ref", error: "E" }],
    );
  });

  it("accepts any output without a reference", () => {
    assert.deepEqual(compareRuns(where, "none", null, { output: "a" }), []);
  });

  it("reports a failing reference", () => {
    const [problem] = compareRuns(where, "r", { error: "R" }, { output: "" });
    assert.equal(problem.kind, "reference error");
    assert.equal(problem.error, "R");
  });

  it("reports a mismatch with its context", () => {
    const [problem] = compareRuns(where, "r", { output: "a" }, { output: "b" });
    assert.equal(problem.kind, "mismatch");
    assert.equal(problem.offset, 0);
    assert.equal(
      compareRuns(where, "r", { output: "a" }, { output: "a" }).length,
      0,
    );
  });

  it("describes problems on one line", () => {
    assert.equal(
      describeProblem({ ...where, kind: "error", against: "r", error: "E" }),
      "x on jsdom (error, against r): E",
    );
    const [mismatch] = compareRuns(
      where,
      "r",
      { output: "ab" },
      { output: "ac" },
    );
    assert.equal(
      describeProblem(mismatch),
      'x on jsdom (mismatch, against r): first difference at character 1 (2 vs 2 characters): "ab" vs "ac"',
    );
  });

  it("names what a scenario is compared with", () => {
    assert.equal(againstOf({ group: "v1" }), "1.0 package");
    assert.equal(
      againstOf({ group: "rewrite", of: "sort" }),
      "1.0 package on sort",
    );
    assert.equal(againstOf({ group: "only30" }), "none");
  });
});

describe("scenarios", () => {
  it("have unique ids, and rewrites name an existing v1 scenario", () => {
    const ids = XSLT_SCENARIOS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const s of XSLT_SCENARIOS.filter((s) => s.group === "rewrite")) {
      assert.equal(XSLT_SCENARIOS.find((v) => v.id === s.of)?.group, "v1");
      assert.ok(s.construct);
    }
  });

  it("are picked by id, in suite order", () => {
    assert.equal(pickScenarios(undefined).length, XSLT_SCENARIOS.length);
    assert.deepEqual(
      pickScenarios(["merge", "catalog"]).map((s) => s.id),
      ["catalog", "merge"],
    );
    assert.throws(() => pickScenarios(["nope"]), /Unknown scenario: nope/);
  });

  it("have an input each", () => {
    const small = XSLT_SCENARIOS.find((s) => s.id === "recursion3000Rewrite");
    const { xml, xsl } = scenarioInput(small);
    assert.equal(xml, "<r/>");
    assert.match(xsl, /xsl:iterate select="reverse\(1 to 2998\)"/);
    for (const s of XSLT_SCENARIOS) {
      const group = { v1: "v1", rewrite: REWRITES, only30: XSLT30_INPUTS }[
        s.group
      ];
      if (group !== "v1") assert.equal(typeof group[s.input], "function", s.id);
    }
    assert.throws(
      () => scenarioInput({ group: "v1", input: "nope" }),
      /No input v1\/nope/,
    );
  });
});

describe("stylesheets and inputs", () => {
  it("every rewrite and 3.0-only generator returns a source and a stylesheet", () => {
    for (const s of XSLT_SCENARIOS.filter((s) => s.group !== "v1")) {
      const { xml, xsl, params = {} } = scenarioInput(s);
      assert.match(xml, /^<[a-z]/, s.id);
      assert.match(xsl, /^<xsl:stylesheet version="3.0" /, s.id);
      for (const value of Object.values(params)) {
        assert.equal(typeof value, "string", s.id);
      }
    }
  });

  it("wraps a 3.0 stylesheet with the usual namespaces", () => {
    const xsl = stylesheet3("<x/>", "text");
    assert.match(xsl, /^<xsl:stylesheet version="3.0" /);
    assert.match(
      xsl,
      /xmlns:map="http:\/\/www.w3.org\/2005\/xpath-functions\/map"/,
    );
    assert.match(xsl, /<xsl:output method="text"\/><x\/><\/xsl:stylesheet>$/);
  });

  it("replaces fragments, failing on a missing one", () => {
    assert.equal(
      replaceAll("a b a", [
        ["a", "c"],
        ["b", "d"],
      ]),
      "c d c",
    );
    assert.throws(() => replaceAll("a", [["z", "y"]]), /Missing fragment: z/);
  });

  it("rewrites the catalogue with xsl:for-each-group", () => {
    const { xsl } = REWRITES.catalog();
    assert.match(xsl, /version="3.0"/);
    assert.match(
      xsl,
      /<xsl:for-each-group select="course" group-by="@category">/,
    );
    assert.doesNotMatch(xsl, /generate-id|byCategory/);
  });

  it("writes JSON in its XML representation", () => {
    assert.equal(
      jsonAsXml({ a: [1, "x", true, null] }, ' xmlns="f"'),
      '<map xmlns="f"><array key="a"><number>1</number><string>x</string>' +
        "<boolean>true</boolean><null/></array></map>",
    );
  });

  it("generates about 5 MB of JSON orders", () => {
    const json = ordersJson();
    assert.ok(json.length > 4.5e6 && json.length < 5.5e6);
    assert.equal(JSON.parse(json).orders.length, 37500);
  });
});

describe("helpers", () => {
  it("measures sizes", () => {
    const bytes = Buffer.from("abc".repeat(1000));
    const sizes = sizesOf(bytes);
    assert.equal(sizes.raw, 3000);
    assert.ok(sizes.gzip < 100 && sizes.brotli < 100);
  });

  it("builds the import probe", () => {
    const probe = importProbe("file:///x.js");
    assert.match(probe, /await import\("file:\/\/\/x.js"\);/);
    assert.match(probe, /type: "import"/);
  });

  it("names engines for files", () => {
    assert.equal(engineSlug("1.0 package"), "1.0-package");
    assert.equal(engineSlug("xslt3"), "xslt3");
  });

  it("summarizes a measurement", () => {
    assert.equal(describeXslt({ status: "error", note: "N" }), "error: N");
    assert.equal(
      describeXslt({
        status: "ok",
        compile: { medianMs: 1 },
        transform: { medianMs: 2 },
        maxRssMb: 3,
      }),
      "compile 1 ms, transform 2 ms, 3 MB",
    );
  });

  it("splits the xslt suite off the arguments", () => {
    assert.deepEqual(splitSuite(["--suite", "xslt", "--runs", "3"]), {
      suite: "xslt",
      rest: ["--runs", "3"],
    });
  });
});
