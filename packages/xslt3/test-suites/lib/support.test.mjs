/**
 * Unit tests of contexts, engine adapters and result reports.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHelpers, loadAdapter, toBoolean, toText } from "./adapter.mjs";
import { NotRunError } from "./assertions.mjs";
import { dynamicContext, staticContext } from "./context.mjs";
import {
  buildBaseline,
  compareWithBaseline,
  passRate,
  renderSummary,
  renderTable,
  summarize,
} from "./results.mjs";

describe("contexts", () => {
  const environment = {
    sources: [
      { role: ".", uri: "u1" },
      { role: "$doc" },
      { role: "", uri: "u3" },
    ],
    params: [{ name: "p", select: "1" }, { name: "q" }],
    namespaces: [{ prefix: "x", uri: "y" }],
    decimalFormats: [],
    collations: [],
    resources: [],
    collections: [],
    staticBaseUri: "http://b/",
    contextItem: "'c'",
  };

  it("lists the variables of the static context", () => {
    assert.deepEqual(staticContext(environment).variables, ["p", "q", "doc"]);
    assert.deepEqual(staticContext(null), {
      namespaces: [],
      decimalFormats: [],
      variables: [],
    });
  });

  it("loads documents and evaluates parameters and the context item", () => {
    const adapter = {
      loadDocument: (source) => `doc:${source.role}`,
      evaluateXPath: (expr) => [`value:${expr}`],
    };
    const context = dynamicContext(environment, adapter);
    assert.equal(context.variables.doc, "doc:$doc");
    assert.deepEqual(context.variables.p, ["value:1"]);
    assert.deepEqual(context.contextItem, ["value:'c'"]);
    assert.deepEqual(context.documents, { u1: "doc:.", u3: "doc:" });
    assert.equal(dynamicContext(null, adapter).environment, null);
    const noXPath = { loadDocument: () => "d" };
    assert.throws(() => dynamicContext(environment, noXPath), NotRunError);
  });
});

describe("adapters", () => {
  it("loads no capabilities without a parser, the parser when present, or a module", async () => {
    const dir = mkdtempSync(join(tmpdir(), "adapter-"));
    try {
      const noEngine = join(dir, "no-engine.js");
      assert.deepEqual(
        await loadAdapter(undefined, join(dir, "missing.js"), noEngine),
        { name: "none" },
      );
      const parserFile = join(dir, "parser.mjs");
      writeFileSync(
        parserFile,
        'export function parseXPath(e) { if (e === "(") throw new Error("x"); return e; }',
      );
      const adapter = await loadAdapter(undefined, parserFile, noEngine);
      assert.equal(adapter.name, "xslt3-parser");
      assert.equal(adapter.parse("1"), "1");
      const wrong = join(dir, "wrong.mjs");
      writeFileSync(wrong, "export const other = 1;");
      assert.deepEqual(await loadAdapter(undefined, wrong, noEngine), {
        name: "none",
      });
      const custom = join(dir, "custom.mjs");
      writeFileSync(custom, 'export default { name: "custom" };');
      assert.equal((await loadAdapter(custom)).name, "custom");
      const bare = join(dir, "bare.mjs");
      writeFileSync(bare, 'export const name = "bare";');
      assert.equal((await loadAdapter(bare)).name, "bare");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("converts sequences and builds helpers", () => {
    assert.equal(toBoolean([]), false);
    assert.equal(toBoolean([new Boolean(false)]), false);
    assert.equal(toBoolean(true), true);
    assert.equal(toText([]), "");
    assert.equal(toText(["a"]), "a");
    const seen = [];
    const adapter = {
      evaluateXPath: (expr, context) => {
        seen.push(context);
        return ["s"];
      },
      serialize: () => "<x/>",
    };
    const helpers = createHelpers(adapter, {
      resultAsContext: true,
      readFile: () => "",
    });
    assert.equal(helpers.stringValue([1]), "s");
    assert.equal(helpers.test("e", [1]), true);
    assert.deepEqual(seen[0].contextItem, [1]);
    assert.equal(helpers.serialize([], {}), "<x/>");
    const empty = createHelpers({}, { readFile: () => "" });
    assert.throws(() => empty.test("e", []), NotRunError);
    assert.throws(() => empty.serialize([], {}), NotRunError);
  });
});

describe("results", () => {
  const results = [
    { id: "s/a", testSet: "s", family: "f", status: "pass" },
    { id: "s/b", testSet: "s", family: "f", status: "fail" },
    { id: "t/c", testSet: "t", family: "g", status: "skipped" },
    { id: "t/d", testSet: "t", family: "g", status: "not-run" },
    { id: "t/e", testSet: "t", family: "g", status: "error-mismatch" },
  ];

  it("summarizes per group with a total", () => {
    const rows = summarize(results, "family");
    assert.deepEqual(
      rows.map((r) => r.name),
      ["f", "g", "total"],
    );
    assert.deepEqual(rows[2], {
      name: "total",
      total: 5,
      pass: 1,
      fail: 1,
      errorMismatch: 1,
      notRun: 1,
      skipped: 1,
    });
    assert.equal(passRate(rows[0]), "50.0%");
    assert.equal(passRate({ total: 1, skipped: 1, pass: 0 }), "n/a");
    assert.match(
      renderTable(rows, "Family").at(-1),
      /^\| \*\*total\*\* \| 5 \| 4 \| 1 \|/,
    );
    assert.match(
      renderSummary({ title: "T", source: "S", adapter: "A", results }),
      /^### T/,
    );
  });

  it("builds and compares baselines", () => {
    assert.deepEqual(buildBaseline(results, { mode: "m" }), {
      mode: "m",
      count: 1,
      passing: ["s/a"],
    });
    assert.deepEqual(compareWithBaseline(results, ["s/b", "x/gone"]), {
      regressions: ["s/b", "x/gone"],
      fixed: ["s/a"],
    });
    assert.deepEqual(compareWithBaseline(results, ["s/a", "x/gone"], true), {
      regressions: [],
      fixed: [],
    });
  });
});
