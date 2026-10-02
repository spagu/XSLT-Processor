import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FAIL_ON_VALUES,
  RISK_LEVELS,
  assessRisk,
  needsXslt3,
  projectRisk,
  shouldFail,
} from "./risk.js";
import { scanResult } from "../test/fixtures.js";

const sheet = (version, msxml = false) => ({ file: "s.xsl", version, msxml });

describe("needsXslt3", () => {
  it("is true from version 2 upwards and false otherwise", () => {
    assert.equal(needsXslt3("1.0"), false);
    assert.equal(needsXslt3("2.0"), true);
    assert.equal(needsXslt3("3.0"), true);
    assert.equal(needsXslt3("unknown"), false);
  });
});

describe("projectRisk", () => {
  it("is the highest rating, NONE without findings", () => {
    assert.equal(projectRisk([]), "NONE");
    assert.equal(projectRisk([{ rating: "LOW" }]), "LOW");
    assert.equal(
      projectRisk([{ rating: "LOW" }, { rating: "MEDIUM" }, { rating: "LOW" }]),
      "MEDIUM",
    );
    assert.equal(projectRisk([{ rating: "HIGH" }, { rating: "LOW" }]), "HIGH");
  });
});

describe("assessRisk", () => {
  it("takes the risk from the findings and the flags from the stylesheets", () => {
    assert.deepEqual(assessRisk(scanResult(), []), {
      risk: "NONE",
      needsXslt3: false,
      msxml: false,
    });
    const result = assessRisk(
      scanResult({ stylesheets: [sheet("1.0"), sheet("2.0", true)] }),
      [{ rating: "MEDIUM" }],
    );
    assert.deepEqual(result, { risk: "MEDIUM", needsXslt3: true, msxml: true });
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
    assert.equal(shouldFail("LOW", "low"), true);
    assert.equal(shouldFail("LOW", "medium"), false);
  });

  it("exposes the levels in order", () => {
    assert.deepEqual(RISK_LEVELS, ["NONE", "LOW", "MEDIUM", "HIGH"]);
    assert.deepEqual(FAIL_ON_VALUES, ["none", "low", "medium", "high"]);
  });
});
