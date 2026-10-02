/**
 * Unit tests of the derived data, tables, charts and page text of the
 * XSLT engine benchmark.
 *
 * Run: node --test scripts/benchmark/xsltCharts.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { xsltHero, xsltMethod, xsltProblemsText } from "./xsltCharts.mjs";
import {
  byDom,
  only30Rows,
  only30Table,
  ratioOf,
  rewriteRows,
  rewriteTable,
  timeCell,
  v1Rows,
  v1Table,
} from "./xsltData.mjs";
import { rewriteChart } from "./xsltFigures.mjs";
import {
  compileTable,
  kb,
  startupTable,
  xsltMemoryTable,
} from "./xsltTables.mjs";

/** A measurement with compile and transform medians. */
const ok = (compile, transform, maxRssMb = 200) => ({
  status: "ok",
  compile: { medianMs: compile },
  transform: { medianMs: transform },
  maxRssMb,
});

/** Results of two DOMs: two v1 scenarios, one rewrite, one 3.0-only. */
const data = {
  environment: {
    cpu: "CPU",
    cores: 4,
    ramGb: 8,
    os: "Linux",
    node: "v25.0.0",
    dom: { jsdom: "1", xmldom: "2" },
    engines: { "1.0 package": "1.2.1", xslt3: "0.0.0" },
    entries: { "1.0 package": "src/index.js", xslt3: "packages/x.js" },
    warmup: 2,
    runs: 7,
    timeoutMs: 120000,
    date: "2026-10-02T00:00:00Z",
    durationMin: 30,
    provisional: true,
    doms: ["jsdom", "xmldom"],
  },
  problems: [],
  results: [
    {
      id: "a",
      label: "A | a",
      group: "v1",
      doms: {
        jsdom: { "1.0 package": ok(1, 100), xslt3: ok(2, 200) },
        xmldom: { "1.0 package": ok(1, 50), xslt3: ok(2, 25) },
      },
    },
    {
      id: "b",
      label: "B",
      group: "v1",
      doms: {
        jsdom: {
          "1.0 package": ok(1, 10),
          xslt3: { status: "timeout", note: "slow" },
        },
        xmldom: { "1.0 package": ok(1, 10), xslt3: ok(1, 10) },
      },
    },
    {
      id: "aRewrite",
      label: "A rewritten",
      group: "rewrite",
      of: "a",
      construct: "xsl:iterate",
      doms: { jsdom: { xslt3: ok(3, 20) }, xmldom: { xslt3: ok(3, 5) } },
    },
    {
      id: "c",
      label: "C",
      group: "only30",
      doms: { jsdom: { xslt3: ok(4, 400) }, xmldom: { xslt3: ok(4, 40) } },
    },
  ],
  startup: [
    {
      engine: "1.0 package",
      entry: "src/index.js",
      bundle: { raw: 143491, gzip: 45464, brotli: 39000 },
      importSource: { status: "ok", medianMs: 31 },
      importBundle: { status: "error", note: "x" },
    },
  ],
};

describe("XSLT rows", () => {
  it("computes the time ratio xslt3 ÷ 1.0 package", () => {
    const rows = v1Rows(data, "jsdom");
    assert.deepEqual(
      rows.map((row) => row.ratio),
      [2, null],
    );
    assert.equal(ratioOf(ok(0, 5), ok(0, 10)), 0.5);
    assert.equal(ratioOf(undefined, ok(0, 1)), null);
  });

  it("joins a rewrite with its 1.0 scenario", () => {
    const [row] = rewriteRows(data, "jsdom");
    assert.equal(row.label, "A | a");
    assert.equal(row.construct, "xsl:iterate");
    assert.equal(row.one.transform.medianMs, 100);
    assert.equal(row.three.transform.medianMs, 200);
    assert.equal(row.gain, 10);
  });

  it("falls back to the id of a missing 1.0 scenario", () => {
    const lonely = { ...data, results: [data.results[2]] };
    const [row] = rewriteRows(lonely, "jsdom");
    assert.equal(row.label, "a");
    assert.equal(row.gain, null);
  });

  it("groups rows by DOM", () => {
    const rows = byDom(data, only30Rows);
    assert.deepEqual(Object.keys(rows), ["jsdom", "xmldom"]);
    assert.equal(rows.xmldom[0].three.transform.medianMs, 40);
  });

  it("formats time cells", () => {
    assert.equal(timeCell(undefined), "n/a");
    assert.equal(timeCell({ status: "error" }), "error");
    assert.equal(timeCell(ok(1.5, 1200), "compile"), "1.5 ms");
    assert.equal(timeCell(ok(1.5, 1200)), "1.20 s");
  });
});

describe("XSLT tables", () => {
  it("v1: times and ratio per DOM, | escaped", () => {
    const md = v1Table(byDom(data, v1Rows));
    assert.match(md, /^\| Scenario \| 1.0 package, jsdom \| xslt3, jsdom \|/);
    assert.match(
      md,
      /\| A \\\| a \| 100 ms \| 200 ms \| 2.00× \| 50 ms \| 25 ms \| 0.50× \|/,
    );
    assert.match(md, /\| B \| 10 ms \| timeout \| n\/a \|/);
  });

  it("rewrites: three times per DOM", () => {
    const md = rewriteTable(byDom(data, rewriteRows));
    assert.match(
      md,
      /\| A \\\| a \| xsl:iterate \| 100 ms \| 200 ms \| 20 ms \| 50 ms \| 25 ms \| 5.0 ms \|/,
    );
  });

  it("3.0-only: time and compile per DOM", () => {
    const md = only30Table(byDom(data, only30Rows));
    assert.match(md, /\| C \| 400 ms \| 4.0 ms \| 40 ms \| 4.0 ms \|/);
  });

  it("compile and memory of every engine and DOM", () => {
    assert.match(
      compileTable(data),
      /\| C \| n\/a \| 4.0 ms \| n\/a \| 4.0 ms \|/,
    );
    const memory = xsltMemoryTable(data);
    assert.match(
      memory,
      /\| A \\\| a \| 200 MB \| 200 MB \| 200 MB \| 200 MB \|/,
    );
    assert.match(memory, /\| B \| 200 MB \| timeout \|/);
  });

  it("start-up: sizes and import times", () => {
    assert.equal(kb(143491), "143.5 kB");
    const md = startupTable(data.startup);
    assert.match(
      md,
      /\| 1.0 package \(`src\/index.js`\) \| 143.5 kB \| 45.5 kB \| 39.0 kB \| 31 ms \| error \|/,
    );
    assert.match(startupTable(null), /Not measured/);
  });
});

describe("XSLT page text", () => {
  it("lists the method, marked provisional", () => {
    const md = xsltMethod(data.environment);
    assert.match(
      md,
      /Engines: 1.0 package 1.2.1 \(`src\/index.js`\), xslt3 0.0.0/,
    );
    assert.match(md, /\*\*Provisional\*\*/);
    const final = xsltMethod({ ...data.environment, provisional: false });
    assert.doesNotMatch(final, /Provisional/);
  });

  it("states the pre-check outcome", () => {
    assert.match(xsltProblemsText([]), /^Both engines wrote the same output/);
    const md = xsltProblemsText([
      { id: "x", dom: "jsdom", kind: "error", against: "a | b", error: "E" },
    ]);
    assert.match(
      md,
      /^Differences found by the pre-check:\n\n- x on jsdom \(error, against a \\\| b\): E$/,
    );
  });

  it("writes the headline with the rewrite gain", () => {
    const v1 = byDom(data, v1Rows);
    const hero = xsltHero(v1, rewriteRows(data, "jsdom"), "jsdom");
    assert.match(hero, /^On jsdom, xslt3 is \*\*2.00× slower\*\*/);
    assert.match(
      hero,
      /run \*\*10.0× faster\*\* on xslt3 than their 1.0 stylesheets \(geometric mean over 1 tasks on jsdom; 10.0× faster on A \| a\)\.$/,
    );
    assert.match(xsltHero(v1, [], "jsdom"), /\)\.$/);
  });
});

describe("XSLT rewrite chart", () => {
  it("draws three marks per task with the gain", () => {
    const svg = rewriteChart(rewriteRows(data, "jsdom"), "jsdom");
    assert.match(
      svg,
      /<title id="t">XSLT 1.0 stylesheets and their 2.0\/3.0 rewrites, median time on jsdom \(log scale\)<\/title>/,
    );
    assert.match(
      svg,
      /the rewrite \(xsl:iterate\) is 10.0× faster than the 1.0 stylesheet on xslt3/,
    );
    assert.match(svg, />rewrite 10.0× faster</);
    assert.equal((svg.match(/<circle/g) ?? []).length, 6);
    assert.match(svg, /\.hollow\{/);
  });

  it("skips tasks whose rewrite failed and labels no gain without one", () => {
    const rows = rewriteRows(data, "jsdom");
    const failed = { ...rows[0], id: "f", rewrite: { status: "error" } };
    const noGain = {
      ...rows[0],
      id: "g",
      three: { status: "error" },
      gain: null,
    };
    const svg = rewriteChart([rows[0], failed, noGain], "jsdom");
    assert.equal((svg.match(/>rewrite /g) ?? []).length, 1);
  });
});
