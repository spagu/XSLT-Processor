/**
 * Unit tests of the pure helpers of the XPath benchmark: argument
 * splitting, result keys and summaries, the pre-check comparison, the
 * derived tables and the charts.
 *
 * Run: node --test scripts/benchmark/xpath.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitSuite } from "./xpath.mjs";
import { failures, mismatches } from "./xpathCheck.mjs";
import {
  geometricMean,
  problemsText,
  xpathHero,
  xpathMethod,
} from "./xpathCharts.mjs";
import {
  only31Table,
  ratioTable,
  sharedTable,
  xpathMemoryTable,
  xpathRows,
} from "./xpathData.mjs";
import {
  fnv1a,
  itemKey,
  resultKeys,
  summarizeResults,
} from "./xpathEngines.mjs";
import { engineTimeChart, only31Chart, ratioChart } from "./xpathFigures.mjs";
import { formatRatio, ratioTicks, ratioWords } from "./xpathMarks.mjs";
import { XPATH_SCENARIOS, xpathDocument } from "./xpathScenarios.mjs";

/** A minimal element. */
const element = (name, id) => ({
  nodeType: 1,
  nodeName: name,
  getAttribute: () => id ?? null,
});

/** A measurement with compiled and one-shot medians. */
const ok = (compiled, oneShot, maxRssMb = 300) => ({
  status: "ok",
  compiled: { medianMs: compiled, p95Ms: compiled, minMs: compiled },
  oneShot: { medianMs: oneShot, p95Ms: oneShot, minMs: oneShot },
  maxRssMb,
});

/** Results of two DOMs, three shared scenarios, one xslt3-only one. */
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
    date: "2026-10-01T00:00:00Z",
    durationMin: 3,
    doms: ["jsdom", "xmldom"],
  },
  problems: [],
  results: [
    ["a", "a | b", 10, 20],
    ["b", "b", 5, 5],
    ["c", "c", 100, 50],
  ]
    .map(([id, expression, one, three]) => ({
      id,
      label: id.toUpperCase(),
      expression,
      group: "shared",
      doms: {
        jsdom: { "1.0 package": ok(one, one * 2), xslt3: ok(three, three) },
        xmldom: { "1.0 package": ok(one / 2, one), xslt3: ok(three / 2, 1) },
      },
    }))
    .concat({
      id: "m",
      label: "M",
      expression: "map{}",
      group: "xpath31",
      doms: {
        jsdom: { xslt3: ok(40, 50) },
        xmldom: { xslt3: { status: "timeout", note: "slow" } },
      },
    }),
};

describe("splitSuite", () => {
  it("takes --suite NAME and --suite=NAME out of the arguments", () => {
    assert.deepEqual(splitSuite(["--suite", "xpath", "--runs", "3"]), {
      suite: "xpath",
      rest: ["--runs", "3"],
    });
    assert.deepEqual(splitSuite(["--suite=xslt"]), { suite: "xslt", rest: [] });
    assert.deepEqual(splitSuite([]), { suite: undefined, rest: [] });
  });
});

describe("result keys", () => {
  it("describes 1.0 values, nodes and XDM items alike", () => {
    assert.equal(itemKey(3), "3");
    assert.equal(itemKey(null), "null");
    assert.equal(itemKey(element("item", "i1")), "item#i1");
    assert.equal(itemKey(element("a")), "a");
    assert.equal(itemKey({ nodeType: 2, nodeName: "id" }), "id");
    assert.equal(itemKey({ type: "int", value: 7n }), "7");
    assert.equal(
      itemKey({ type: "dec", value: { toString: () => "1.50" } }),
      "1.5",
    );
    assert.equal(itemKey({ type: "str", value: "x" }), "x");
    assert.equal(itemKey({ members: [[1], [2]], size: 2 }), "array(2)");
    assert.equal(itemKey({ size: 3 }), "map(3)");
    assert.equal(itemKey({}), "function");
    assert.deepEqual(resultKeys(true), ["true"]);
    assert.deepEqual(resultKeys([element("b")]), ["b"]);
  });

  it("summarizes the same results identically, different ones not", () => {
    assert.equal(fnv1a(""), "811c9dc5");
    const a = summarizeResults([[element("item", "i1")], "x"]);
    assert.deepEqual(a, summarizeResults([[element("item", "i1")], "x"]));
    assert.notEqual(
      a.hash,
      summarizeResults([[element("item", "i2")], "x"]).hash,
    );
    assert.equal(a.items, 2);
    const long = summarizeResults([["y".repeat(30), 1, 2, 3]]);
    assert.equal(long.preview, `${"y".repeat(24)}..., 1, 2, ...`);
  });
});

describe("pre-check", () => {
  const summary = (hash) => ({ summary: { items: 1, hash, preview: "p" } });
  it("reports differing, failing and missing results", () => {
    const found = mismatches(
      ["same", "diff", "fail", "gone"],
      { same: summary("1"), diff: summary("1"), fail: summary("1") },
      { same: summary("1"), diff: summary("2"), fail: { error: "boom" } },
    );
    assert.deepEqual(
      found.map((m) => [m.id, m.b]),
      [
        ["diff", "1 items, hash 2: p"],
        ["fail", "error: boom"],
        ["gone", "missing"],
      ],
    );
    assert.deepEqual(failures(["x", "y"], { x: summary("1") }), [
      { id: "y", error: "missing" },
    ]);
  });

  it("renders the outcome", () => {
    assert.match(problemsText([]), /same result/);
    const text = problemsText([{ dom: "jsdom", id: "sum", xslt3: "error: x" }]);
    assert.match(text, /`sum` on jsdom: xslt3: error: x/);
  });
});

describe("derived data", () => {
  const shared = {
    jsdom: xpathRows(data, "shared", "jsdom"),
    xmldom: xpathRows(data, "shared", "xmldom"),
  };
  const only31 = {
    jsdom: xpathRows(data, "xpath31", "jsdom"),
    xmldom: xpathRows(data, "xpath31", "xmldom"),
  };

  it("computes xslt3 ÷ 1.0 ratios", () => {
    assert.deepEqual(
      shared.jsdom.map((row) => [row.ratio, row.oneShotRatio]),
      [
        [2, 1],
        [1, 0.5],
        [0.5, 0.25],
      ],
    );
    assert.equal(only31.jsdom[0].ratio, null);
    assert.equal(Math.round(geometricMean([2, 8]) * 100), 400);
  });

  it("renders the tables and the headline", () => {
    assert.match(
      sharedTable(shared.jsdom),
      /\| A \| 10 ms \| 20 ms \| 2\.00× \|/,
    );
    assert.match(ratioTable(shared), /^\| Scenario \| Expression \| jsdom/);
    assert.match(ratioTable(shared), /`a \\\| b`/);
    assert.match(
      only31Table(only31),
      /\| M \| `map\{\}` \| 40 ms \| 50 ms \| timeout \| timeout \|/,
    );
    assert.match(
      xpathMemoryTable(data),
      /\| M \| n\/a \| 300 MB \| n\/a \| timeout \|/,
    );
    assert.match(
      xpathHero(shared),
      /^On jsdom, xslt3 is \*\*1\.00× slower\*\* than the 1\.0 package/,
    );
    assert.match(xpathMethod(data.environment), /1\.0 package 1\.2\.1/);
  });

  it("draws the charts", () => {
    assert.match(
      engineTimeChart(shared.jsdom, "jsdom"),
      /slower than the 1\.0 package \(XPath 1\.0\) in 1 of 3/,
    );
    assert.match(ratioChart(shared), /<circle class="old hollow"/);
    assert.match(only31Chart(only31), /the slowest is M \(40 ms on jsdom\)/);
    assert.deepEqual(
      ratioTicks([0.5, 2]).map((t) => t.value),
      [0.2, 0.5, 1, 2, 5],
    );
    assert.deepEqual(
      ratioTicks([0.002, 3]).map((t) => t.value),
      [0.001, 0.01, 0.1, 1, 10],
    );
  });

  it("formats ratios", () => {
    assert.equal(formatRatio(1.5), "1.50×");
    assert.equal(formatRatio(0.00213), "0.0021×");
    assert.equal(ratioWords(2), "2.00× slower");
    assert.equal(ratioWords(0.004), "250× faster");
  });
});

describe("scenarios", () => {
  it("generates 20,000 items and unique scenario ids", () => {
    const xml = xpathDocument();
    assert.equal(xml.match(/<item /g).length, 20000);
    assert.equal(xml.match(/<leaf\/>/g).length, 1000);
    assert.equal(xml, xpathDocument());
    assert.equal(Object.keys(XPATH_SCENARIOS).length, 20);
  });
});
