import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { createIsolatedRunner, DEFAULT_TIMEOUT } from "./isolation.mjs";
import { runCase } from "./runner.mjs";

const dir = mkdtempSync(join(tmpdir(), "isolation-"));
after(() => rmSync(dir, { recursive: true, force: true }));

// An adapter whose parser loops forever on "loop" and raises a syntax
// error on anything else
const adapterPath = join(dir, "adapter.mjs");
writeFileSync(
  adapterPath,
  `export default {
    name: "test",
    parse(expr) {
      if (expr === "loop") for (;;);
      throw Object.assign(new Error("syntax"), { code: "XPST0003" });
    },
  };`,
);
const brokenPath = join(dir, "broken.mjs");
writeFileSync(brokenPath, 'throw new Error("cannot load");');

const testCase = (text) => ({
  id: `set/${text}`,
  test: { text },
  environment: null,
  result: { kind: "error", code: "XPST0003", value: "", children: [] },
});

describe("isolated test runs", () => {
  it("runs cases in a worker and survives a timeout", async () => {
    const runner = createIsolatedRunner({
      kind: "qt3",
      parseOnly: true,
      adapterPath,
      timeout: 500,
    });
    try {
      assert.deepEqual(runner.run(testCase("1 +")), {
        status: "pass",
        reason: "",
      });
      const timedOut = runner.run(testCase("loop"));
      assert.equal(timedOut.status, "fail");
      assert.match(timedOut.reason, /timeout after 500 ms/);
      assert.equal(runner.run(testCase("2 +")).status, "pass");
    } finally {
      await runner.close();
    }
    await runner.close();
    assert.equal(DEFAULT_TIMEOUT, 30000);
  });

  it("reports a worker that cannot load its adapter", async () => {
    const runner = createIsolatedRunner({
      kind: "qt3",
      adapterPath: brokenPath,
    });
    assert.throws(
      () => runner.run(testCase("1")),
      /did not start: cannot load/,
    );
    await runner.close();
  });

  it("turns harness failures into verdicts in this thread", () => {
    const broken = { evaluateXPath: () => [], parse: null };
    const bad = { ...testCase("1"), test: null };
    assert.equal(runCase(bad, { kind: "qt3", adapter: broken }).status, "fail");
  });
});
