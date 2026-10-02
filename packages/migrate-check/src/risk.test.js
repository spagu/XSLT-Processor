import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FAIL_ON_VALUES,
  RISK_LEVELS,
  assessRisk,
  needsXslt3,
  shouldFail,
} from "./risk.js";

/** A ScanResult with the given lists. */
function scan(overrides = {}) {
  return {
    scannedFiles: 0,
    usages: [],
    stylesheets: [],
    xmlDocuments: [],
    migrated: [],
    serverSide: [],
    ...overrides,
  };
}

const sheet = (version, msxml = false) => ({ file: "s.xsl", version, msxml });

describe("needsXslt3", () => {
  it("is true from version 2 upwards and false otherwise", () => {
    assert.equal(needsXslt3("1.0"), false);
    assert.equal(needsXslt3("2.0"), true);
    assert.equal(needsXslt3("3.0"), true);
    assert.equal(needsXslt3("unknown"), false);
  });
});

describe("assessRisk", () => {
  it("is NONE for an empty scan", () => {
    assert.deepEqual(assessRisk(scan()), {
      risk: "NONE",
      needsXslt3: false,
      msxml: false,
    });
  });

  it("is MEDIUM with stylesheets only, and flags their versions", () => {
    const result = assessRisk(
      scan({ stylesheets: [sheet("1.0"), sheet("2.0", true)] }),
    );
    assert.deepEqual(result, { risk: "MEDIUM", needsXslt3: true, msxml: true });
  });

  it("is HIGH with a rendered XML document or a usage", () => {
    const withXml = scan({ xmlDocuments: [{ file: "f.xml", line: 2 }] });
    assert.equal(assessRisk(withXml).risk, "HIGH");
    const withUsage = scan({ usages: [{ file: "a.js", line: 1, text: "x" }] });
    assert.equal(assessRisk(withUsage).risk, "HIGH");
  });

  it("migrated files alone do not raise the risk", () => {
    const migrated = scan({ migrated: [{ file: "a.js", count: 2 }] });
    assert.equal(assessRisk(migrated).risk, "NONE");
  });
});

describe("shouldFail", () => {
  it("compares the risk with the threshold", () => {
    assert.equal(shouldFail("HIGH", "none"), false);
    assert.equal(shouldFail("HIGH", "high"), true);
    assert.equal(shouldFail("MEDIUM", "high"), false);
    assert.equal(shouldFail("MEDIUM", "medium"), true);
    assert.equal(shouldFail("HIGH", "medium"), true);
    assert.equal(shouldFail("NONE", "medium"), false);
  });

  it("exposes the levels in order", () => {
    assert.deepEqual(RISK_LEVELS, ["NONE", "MEDIUM", "HIGH"]);
    assert.deepEqual(FAIL_ON_VALUES, ["none", "medium", "high"]);
  });
});
