/**
 * Unit tests of the suite runner with fake engine adapters.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NotRunError } from "./assertions.mjs";
import { createConfig } from "./dependencies.mjs";
import { compileFilter, readSuiteFile, runSuite } from "./runner.mjs";

const a = (kind, extra = {}) => ({ kind, value: "", children: [], ...extra });
const error = (code) => a("error", { code });

const set = (name, testCases, dependencies = []) => ({
  name,
  family: name.split("-")[0],
  dependencies,
  testCases,
});
const qt3Case = (name, extra = {}) => ({
  id: `fn-x/${name}`,
  name,
  testSet: "fn-x",
  dependencies: [],
  environment: null,
  test: { text: name },
  result: a("assert-true"),
  ...extra,
});
const config = createConfig("qt3");

describe("runSuite on qt3", () => {
  const suite = {
    testSets: [
      set("fn-x", [
        qt3Case("ok"),
        qt3Case("bad", { result: error("XPST0003") }),
        qt3Case("xq", {
          dependencies: [{ type: "spec", value: "XQ10+", satisfied: true }],
        }),
        qt3Case("env", { environmentError: "Unknown environment" }),
        qt3Case("file", { test: { text: "", file: "/q.xq" } }),
      ]),
    ],
  };
  const parser = {
    parse(expr) {
      if (expr === "bad") {
        throw Object.assign(new Error("syntax"), { code: "XPST0003" });
      }
    },
  };

  it("runs the parse stage and reports skipped and not-run cases", () => {
    const results = runSuite(suite, {
      kind: "qt3",
      adapter: parser,
      config,
      parseOnly: true,
      readFile: () => "ok",
    });
    assert.deepEqual(
      results.map((r) => `${r.id} ${r.status}`),
      [
        "fn-x/ok pass",
        "fn-x/bad pass",
        "fn-x/xq skipped",
        "fn-x/env not-run",
        "fn-x/file pass",
      ],
    );
    assert.equal(results[0].family, "fn");
    const filtered = runSuite(suite, {
      kind: "qt3",
      adapter: {},
      config,
      parseOnly: true,
      filter: "b*",
    });
    assert.deepEqual(
      filtered.map((r) => r.status),
      ["not-run"],
    );
  });

  it("evaluates and checks results in full mode", () => {
    const engine = {
      evaluateXPath(expr, context) {
        if (expr === "bad") {
          throw Object.assign(new Error("syntax"), { code: "XPST0003" });
        }
        if (expr.includes("$result")) {
          return [context.variables.result[0] === true];
        }
        return [true];
      },
    };
    const results = runSuite(suite, {
      kind: "qt3",
      adapter: engine,
      config,
      readFile: () => "ok",
    });
    assert.deepEqual(
      results.map((r) => r.status),
      ["pass", "pass", "skipped", "not-run", "pass"],
    );
    const none = runSuite(suite, {
      kind: "qt3",
      adapter: {},
      config,
      filter: "ok",
    });
    assert.equal(none[0].reason, "adapter has no evaluateXPath");
    const noParse = runSuite(suite, {
      kind: "qt3",
      adapter: {},
      config,
      parseOnly: true,
      filter: "ok",
    });
    assert.equal(noParse[0].reason, "adapter has no parse");
  });

  it("reports environments needing missing capabilities as not-run and crashes as failures", () => {
    const withSource = {
      testSets: [
        set("fn-x", [
          qt3Case("doc", {
            environment: {
              sources: [{ role: "." }],
              params: [],
              namespaces: [],
              collections: [],
              collations: [],
            },
          }),
        ]),
      ],
    };
    const [result] = runSuite(withSource, {
      kind: "qt3",
      adapter: { evaluateXPath: () => [] },
      config,
    });
    assert.deepEqual(
      [result.status, result.reason],
      ["not-run", "adapter has no loadDocument"],
    );
    const crashing = {
      parse: () => {
        throw new NotRunError("later");
      },
    };
    const [crash] = runSuite(suite, {
      kind: "qt3",
      adapter: crashing,
      config,
      parseOnly: true,
      filter: "ok",
    });
    assert.equal(crash.status, "not-run");
    const exploding = {
      evaluateXPath: () => {
        throw new NotRunError("deep");
      },
    };
    const [deep] = runSuite(suite, {
      kind: "qt3",
      adapter: exploding,
      config,
      filter: "ok",
    });
    assert.deepEqual([deep.status, deep.reason], ["not-run", "deep"]);
    const readFailure = runSuite(suite, {
      kind: "qt3",
      adapter: parser,
      config,
      parseOnly: true,
      filter: "file",
      readFile: () => {
        throw new Error("ENOENT");
      },
    });
    assert.deepEqual(
      [readFailure[0].status, readFailure[0].reason],
      ["fail", "ENOENT"],
    );
  });
});

describe("runSuite on xslt30", () => {
  const xsltCase = (name, extra = {}) => ({
    id: `s/${name}`,
    name,
    testSet: "s",
    dependencies: [],
    environment: null,
    test: {
      stylesheets: [{ file: "/a.xsl" }],
      packages: [],
      params: [],
      postureAndSweep: false,
    },
    result: a("assert-xml", { value: "<out/>" }),
    ...extra,
  });
  const env = {
    sources: [],
    collections: [],
    collations: [],
    stylesheets: [{ file: "/env.xsl" }],
    packages: [{ file: "/p.xsl" }],
    params: [{ name: "e" }],
  };
  const suite = {
    testSets: [
      set("s", [
        xsltCase("ok"),
        xsltCase("envsheet", {
          environment: env,
          test: {
            stylesheets: [],
            packages: [],
            params: [{ name: "t" }],
            postureAndSweep: false,
          },
        }),
        xsltCase("err", { result: error("XTSE0010") }),
        xsltCase("sweep", {
          test: {
            stylesheets: [],
            packages: [],
            params: [],
            postureAndSweep: true,
          },
        }),
      ]),
    ],
  };
  const xsltConfig = createConfig("xslt30");

  it("transforms, serializes and checks", () => {
    const calls = [];
    const engine = {
      transform(stylesheet, input, params) {
        calls.push({ stylesheet, params });
        if (calls.length === 3) {
          throw Object.assign(new Error("static"), { code: "XTSE0010" });
        }
        return calls.length === 1 ? { value: "doc" } : undefined;
      },
      serialize: () => "<out/>",
    };
    const results = runSuite(suite, {
      kind: "xslt30",
      adapter: engine,
      config: xsltConfig,
    });
    assert.deepEqual(
      results.map((r) => r.status),
      ["pass", "pass", "pass", "not-run"],
    );
    assert.deepEqual(calls[1].stylesheet, {
      stylesheets: env.stylesheets,
      packages: env.packages,
    });
    assert.deepEqual(
      calls[1].params.map((p) => p.name),
      ["e", "t"],
    );
    const none = runSuite(suite, {
      kind: "xslt30",
      adapter: {},
      config: xsltConfig,
      filter: "ok",
    });
    assert.equal(none[0].reason, "adapter has no transform");
  });
});

describe("runner helpers", () => {
  it("filters with wildcards on set, case or id", () => {
    const testCase = {
      testSet: "prod-Literal",
      name: "Literal-1",
      id: "prod-Literal/Literal-1",
    };
    assert.equal(compileFilter()(testCase), true);
    assert.equal(compileFilter("prod-*")(testCase), true);
    assert.equal(compileFilter("Literal-?")(testCase), true);
    assert.equal(compileFilter("prod-Literal/*")(testCase), true);
    assert.equal(compileFilter("fn-*")(testCase), false);
  });

  it("reads suite files by their declared encoding", () => {
    const dir = mkdtempSync(join(tmpdir(), "suite-file-"));
    try {
      writeFileSync(join(dir, "q.xq"), "1 + 1");
      assert.equal(readSuiteFile(join(dir, "q.xq")), "1 + 1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
