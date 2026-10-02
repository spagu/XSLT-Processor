import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Decimal } from "./decimal.js";
import {
  DurationValue,
  formatDuration,
  parseDuration,
  ZERO_DURATION,
} from "./duration.js";

const roundTrip = (kind, text) =>
  formatDuration(kind, parseDuration(kind, text));

describe("durations", () => {
  it("produces canonical forms", () => {
    assert.equal(roundTrip("yearMonthDuration", "P1Y12M"), "P2Y");
    assert.equal(roundTrip("dayTimeDuration", "PT36H"), "P1DT12H");
    assert.equal(roundTrip("yearMonthDuration", "P0Y"), "P0M");
    assert.equal(roundTrip("dayTimeDuration", "P0D"), "PT0S");
    assert.equal(roundTrip("duration", "P0Y0M0DT0H0M0S"), "PT0S");
    assert.equal(
      roundTrip("duration", "-P1Y2M3DT4H5M6.50S"),
      "-P1Y2M3DT4H5M6.5S",
    );
    assert.equal(roundTrip("duration", "P14M"), "P1Y2M");
    assert.equal(roundTrip("duration", "PT90M"), "PT1H30M");
    assert.equal(roundTrip("dayTimeDuration", "-PT0.000S"), "PT0S");
    assert.equal(roundTrip("duration", "P1DT0.1S"), "P1DT0.1S");
    assert.equal(roundTrip("duration", "PT3600S"), "PT1H");
  });

  it("formats durations as their subtypes", () => {
    const value = parseDuration("duration", "-P1Y2M3D");
    assert.equal(formatDuration("yearMonthDuration", value), "-P1Y2M");
    assert.equal(formatDuration("dayTimeDuration", value), "-P3D");
  });

  it("rejects invalid forms", () => {
    const cases = [
      ["duration", "P"],
      ["duration", "PT"],
      ["duration", "P1DT"],
      ["duration", "1Y"],
      ["duration", "P1M1Y"],
      ["duration", "P-1Y"],
      ["duration", "P1.5Y"],
      ["duration", "PT1.5M"],
      ["duration", "PT.5S"],
      ["duration", "PT1.S"],
      ["dayTimeDuration", "PT10M30.S"],
      ["yearMonthDuration", "P1D"],
      ["yearMonthDuration", "PT1H"],
      ["dayTimeDuration", "P1Y"],
      ["dayTimeDuration", "P1M"],
    ];
    for (const [kind, text] of cases) {
      assert.equal(parseDuration(kind, text), null, text);
    }
  });

  it("raises FODT0002 beyond the supported range", () => {
    assert.throws(() => parseDuration("duration", "P999999999999999999Y"), {
      code: "FODT0002",
    });
    assert.throws(() => new DurationValue(1.5, Decimal.ZERO), {
      code: "FODT0002",
    });
    // seconds are unbounded
    assert.equal(
      roundTrip("dayTimeDuration", "PT99999999999999999999S"),
      "P1157407407407407DT9H46M39S",
    );
  });

  it("has no negative zero months", () => {
    assert.ok(Object.is(new DurationValue(-0, Decimal.ZERO).months, 0));
    assert.equal(ZERO_DURATION.months, 0);
  });
});
