/**
 * Unit tests of the "all versions" overview: rows joined from both result
 * files, speed-ups, tables, headline and chart.
 *
 * Run: node --test scripts/benchmark/overview.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mark, overviewChart } from "./overviewChart.mjs";
import {
  overviewHero,
  overviewMemoryTable,
  overviewRows,
  overviewSpeedups,
  overviewTimeTable,
  overviewVersions,
} from "./overviewData.mjs";

/** A results.json measurement. */
const lib = (medianMs, maxRssMb = 300) => ({
  status: "ok",
  medianMs,
  maxRssMb,
});

/** A results-xslt.json measurement. */
const eng = (compile, transform, maxRssMb = 200) => ({
  status: "ok",
  compile: { medianMs: compile },
  transform: { medianMs: transform },
  maxRssMb,
});

const release = {
  results: [
    { id: "a", label: "A", versions: { "1.1.3": lib(400), "1.2.0": lib(200) } },
    {
      id: "deep",
      label: "Deep",
      versions: { "1.1.3": { status: "error" }, "1.2.0": lib(50, null) },
    },
    { id: "cli", label: "CLI", versions: { "1.1.3": lib(9), "1.2.0": lib(9) } },
  ],
};

const xslt = {
  environment: { engines: { "1.0 package": "1.3.0", xslt3: "1.0.0" } },
  results: [
    {
      id: "deep",
      label: "Deep recursion",
      group: "v1",
      doms: {
        jsdom: { "1.0 package": eng(1, 49), xslt3: { status: "timeout" } },
      },
    },
    {
      id: "a",
      label: "A | a",
      group: "v1",
      doms: { jsdom: { "1.0 package": eng(10, 90), xslt3: eng(5, 45) } },
    },
    { id: "only", label: "Only", group: "v1", doms: { jsdom: {} } },
    { id: "a30", label: "A 3.0", group: "rewrite", doms: { jsdom: {} } },
  ],
};

const versions = overviewVersions(xslt);
const rows = overviewRows(release, xslt);

describe("overview rows", () => {
  it("names the versions oldest first", () => {
    assert.deepEqual(versions, ["1.1.3", "1.2.0", "1.3.0", "xslt3 1.0.0"]);
  });

  it("keeps the shared XSLT 1.0 scenarios, slowest first", () => {
    assert.deepEqual(
      rows.map((row) => row.id),
      ["a", "deep"],
    );
    assert.deepEqual(
      rows[0].cells.map((c) => c.ms),
      [400, 200, 100, 50],
    );
    assert.deepEqual(
      rows[1].cells.map((c) => c.status),
      ["error", "ok", "ok", "timeout"],
    );
    assert.equal(rows[1].cells[1].rss, null);
  });

  it("marks a version without a measurement as not run", () => {
    const missing = overviewRows(
      {
        results: [
          { id: "a", label: "A", versions: {} },
          { id: "b", label: "B", versions: {} },
        ],
      },
      {
        ...xslt,
        results: [
          { id: "a", label: "A", group: "v1", doms: { x: {} } },
          {
            id: "b",
            label: "B",
            group: "v1",
            doms: {
              x: { "1.0 package": { ...eng(1, 1), maxRssMb: undefined } },
            },
          },
        ],
      },
      "x",
    );
    assert.deepEqual(
      missing[1].cells.map((c) => c.status),
      ["not run", "not run", "not run", "not run"],
    );
    assert.equal(missing[0].cells[2].rss, null);
    assert.equal(missing[0].id, "b"); // measured first: slowest first
    assert.deepEqual(overviewSpeedups(missing), [null, null, null, null]);
    assert.match(
      overviewTimeTable(missing, versions),
      /\| Speed vs 1\.1\.3 \(geometric mean\) (\| {2}){4}\|$/,
    );
  });

  it("averages the speed-up over 1.1.3 where both ran", () => {
    assert.deepEqual(
      overviewSpeedups(rows).map((f) => f.toFixed(6)),
      ["1.000000", "2.000000", "4.000000", "8.000000"],
    );
  });
});

describe("overview text", () => {
  it("bolds the fastest time and ends with the geometric mean", () => {
    const md = overviewTimeTable(rows, versions);
    assert.match(
      md,
      /\| A \\\| a \| 400 ms \| 200 ms \| 100 ms \| \*\*50 ms\*\* \|/,
    );
    assert.match(
      md,
      /\| Deep recursion \| error \| \*\*50 ms\*\* \| \*\*50 ms\*\* \| timeout \|/,
    );
    assert.match(
      md,
      /\| Speed vs 1\.1\.3 \(geometric mean\) \| 1\.00× \| 2\.00× \| 4\.00× \| 8\.00× \|/,
    );
  });

  it("lists peak memory per version", () => {
    const md = overviewMemoryTable(rows, versions);
    assert.match(md, /\| A \\\| a \| 300 MB \| 300 MB \| 200 MB \| 200 MB \|/);
    assert.match(
      md,
      /\| Deep recursion \| error \| ok \| 200 MB \| timeout \|/,
    );
  });

  it("states the speed-up of every later version", () => {
    assert.equal(
      overviewHero(rows, versions),
      "Against 1.1.3, on the same 2 XSLT 1.0 stylesheets (geometric mean): 1.2.0 **2.00× faster** · 1.3.0 **4.00× faster** · xslt3 1.0.0 **8.00× faster**.",
    );
  });
});

describe("overview chart", () => {
  it("draws one shape per version", () => {
    assert.match(mark(0, 10, 10), /^<circle class="v0 ring"/);
    assert.match(mark(1, 10, 10), /^<rect class="v1 ring"/);
    assert.match(
      mark(2, 10, 10, "a<b"),
      /^<polygon .*<title>a&lt;b<\/title><\/polygon>$/,
    );
    assert.match(mark(3, 10, 10), /points="10,4 16,15 4,15"/);
  });

  it("plots the measured cells and notes the others", () => {
    const svg = overviewChart(rows, versions);
    assert.match(svg, /<title>A \| a, xslt3 1\.0\.0: median 50 ms<\/title>/);
    assert.match(svg, />1\.1\.3: error</);
    assert.match(svg, />xslt3 1\.0\.0: timeout</);
    assert.match(svg, /<desc id="d">Median time of 2 XSLT 1\.0 scenarios/);
    assert.equal(svg.match(/class="grid" x1="250" x2="650"/g).length, 1);
  });
});
