import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SUGGESTION } from "../migration.js";
import { analyze, toJson } from "./index.js";
import { scanResult, usage } from "../../test/fixtures.js";

describe("analyze and toJson", () => {
  it("keeps the 0.1.0 keys in order and adds findings, summary, recommendations", () => {
    const analysis = analyze(scanResult({ usages: [usage("a.js", 1)] }), {
      version: "0.2.0",
      directory: "./",
      durationMs: 2,
    });
    const json = toJson(analysis);
    assert.deepEqual(Object.keys(json), [
      "version",
      "scannedFiles",
      "durationMs",
      "risk",
      "usages",
      "stylesheets",
      "xmlDocuments",
      "migrated",
      "serverSide",
      "needsXslt3",
      "msxml",
      "suggestion",
      "findings",
      "summary",
      "recommendations",
    ]);
    assert.equal(json.risk, "HIGH");
    assert.equal(json.suggestion, SUGGESTION);
    assert.equal(json.findings[0].rating, "HIGH");
    assert.equal(json.recommendations[0].id, "polyfill");
    assert.equal(json.summary.nativeUsages, 1);
    assert.equal("directory" in json, false);
  });
});
