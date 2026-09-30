/**
 * EXSLT dates-and-times arithmetic and current-time functions, through
 * XPath. Expected values follow libexslt `date.c`; the current time comes
 * from an injected clock so the tests are deterministic.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { assertValues, valueOf } from "./exsltHarness.test.js";
import { currentDate, systemClock } from "./dates.js";
import { secondsOf } from "./dateCalc.js";

/** 2020-01-02T03:04:05Z. */
const INSTANT = Date.UTC(2020, 0, 2, 3, 4, 5);

/**
 * Engine configuration installing a fixed clock.
 *
 * @param {number} offsetMinutes - Local offset east of UTC, in minutes
 * @returns {{configure: Function}} Options for the harness
 */
function fixedClock(offsetMinutes) {
  return {
    configure: (engine) => {
      engine.clock = () => ({
        getTime: () => INSTANT,
        getTimezoneOffset: () => -offsetMinutes,
      });
    },
  };
}

describe("date:add()", () => {
  it("should follow libexslt on a table", () => {
    assertValues([
      ["date:add('2000-01-31', 'P1M')", "2000-02-29"],
      ["date:add('2001-01-31', 'P1M')", "2001-02-28"],
      ["date:add('2000-02-29', 'P1Y')", "2001-02-28"],
      ["date:add('2001-12-31T23:59:59Z', 'PT1S')", "2002-01-01T00:00:00Z"],
      ["date:add('2001-12-31T23:59:59', 'PT1S')", "2002-01-01T00:00:00Z"],
      [
        "date:add('2001-01-01T10:00:00+02:00', 'P1D')",
        "2001-01-02T10:00:00+02:00",
      ],
      ["date:add('2001-01-01+02:00', 'P1D')", "2001-01-02+02:00"],
      ["date:add('2001-01-01', '-PT1S')", "2000-12-31T23:59:59Z"],
      ["date:add('2001-03-01', '-P1D')", "2001-02-28"],
      ["date:add('2001-01-15', '-P1M')", "2000-12-15"],
      ["date:add('2001-11-15', 'P3M')", "2002-02-15"],
      ["date:add('2001-01-01T00:59:00', 'PT1M')", "2001-01-01T01:00:00Z"],
      ["date:add('2001', 'P1M')", "2001-02"],
      ["date:add('2001', 'P1D')", "2001-01-02"],
      ["date:add('2001', 'PT1H')", "2001-01-01T01:00:00Z"],
      ["date:add('2001', 'P1Y')", "2002"],
      ["date:add('2001-06', 'P1Y')", "2002-06"],
      ["date:add('-0001-12-31', 'P1D')", "0001-01-01"],
      ["date:add('2000-01-01', 'P146097D')", "2400-01-01"],
      ["date:add('2000-01-01', 'P1D')", "2000-01-02"],
      ["date:add('10:00:00', 'PT1H')", ""],
      ["date:add('2001-01-01', 'x')", ""],
      ["date:add('x', 'P1D')", ""],
    ]);
  });
});

describe("date:add-duration() / date:sum()", () => {
  it("should add durations like libexslt", () => {
    assertValues([
      ["date:add-duration('P1Y', 'P1M')", "P1Y1M"],
      ["date:add-duration('PT12H', 'PT12H')", "P1D"],
      ["date:add-duration('P1D', '-P1D')", "P0D"],
      ["date:add-duration('-PT1S', '-PT1S')", "-PT2S"],
      ["date:add-duration('P1Y2M3DT4H5M6.5S', 'P0D')", "P1Y2M3DT4H5M6.5S"],
      ["date:add-duration('P1M', '-P1D')", ""],
      ["date:add-duration('x', 'P1D')", ""],
      ["date:add-duration('P1D', 'x')", ""],
    ]);
  });

  it("should sum a node-set of durations", () => {
    const xml = "<r><d>P1D</d><d>PT12H</d><m>P1M</m><m>-P1D</m><x>1D</x></r>";
    assertValues(
      [
        ["date:sum(//d)", "P1DT12H"],
        ["date:sum(//none)", ""],
        ["date:sum(//d | //x)", ""],
        ["date:sum(//m)", ""],
      ],
      { xml },
    );
    assert.throws(
      () => valueOf("date:sum('P1D')"),
      /date:sum\(\) expects a node-set/,
    );
  });
});

describe("date:difference()", () => {
  it("should follow libexslt on a table", () => {
    assertValues([
      ["date:difference('2001-01-01', '2001-03-01')", "P59D"],
      ["date:difference('2001-01-01', '2001-03-01T12:00:00')", "P59D"],
      ["date:difference('2001', '2003')", "P2Y"],
      ["date:difference('2001-03', '2001-01')", "-P2M"],
      ["date:difference('2001-01-01', '2001')", "P0D"],
      [
        "date:difference('2001-01-01T00:00:00Z', '2001-01-01T01:30:00Z')",
        "PT1H30M",
      ],
      [
        "date:difference('2001-01-01T00:00:00+01:00', '2001-01-01T00:00:00Z')",
        "PT1H",
      ],
      ["date:difference('2001-01-02', '2001-01-01')", "-P1D"],
      [
        "date:difference('2001-01-01T00:00:01', '2001-01-01T00:00:00')",
        "-PT1S",
      ],
      ["date:difference('-0001-01-01', '0001-01-01')", "P366D"],
      ["date:difference('10:00:00', '2001')", ""],
      ["date:difference('--05--', '2001')", ""],
      ["date:difference('x', '2001')", ""],
      ["date:difference('2001', 'x')", ""],
    ]);
  });
});

describe("date:seconds() / date:duration()", () => {
  it("should count seconds from the epoch or of a duration", () => {
    assertValues([
      ["date:seconds('1970-01-01T00:00:00Z')", "0"],
      ["date:seconds('1970-01-02')", "86400"],
      ["date:seconds('1969-12-31T23:59:59Z')", "-1"],
      ["date:seconds('2001-01-01T00:00:00-05:00')", "978325200"],
      ["date:seconds('1971')", "31536000"],
      ["date:seconds('1970-02')", "2678400"],
      ["date:seconds('P1D')", "86400"],
      ["date:seconds('PT1.5S')", "1.5"],
      ["date:seconds('-PT1S')", "-1"],
      ["date:seconds('P1M')", "NaN"],
      ["date:seconds('10:00:00')", "NaN"],
      ["date:seconds('x')", "NaN"],
    ]);
  });

  it("should turn seconds into a duration", () => {
    assertValues([
      ["date:duration(90061.5)", "P1DT1H1M1.5S"],
      ["date:duration(0)", "P0D"],
      ["date:duration(-1)", "-PT1S"],
      ["date:duration(-90061)", "-P1DT1H1M1S"],
      ["date:duration(60)", "PT1M"],
      ["date:duration('86400')", "P1D"],
      ["date:duration('x')", ""],
      ["date:duration(1 div 0)", ""],
    ]);
  });

  it("should accept a parsed date value", () => {
    assert.strictEqual(secondsOf(currentDate(new Date(0))), 0);
  });
});

describe("current date and time", () => {
  it("should read the injected clock", () => {
    assertValues(
      [
        ["date:date-time()", "2020-01-02T05:04:05+02:00"],
        ["date:date()", "2020-01-02+02:00"],
        ["date:time()", "05:04:05+02:00"],
        ["date:year()", "2020"],
        ["date:day-in-year()", "2"],
        ["date:seconds()", String(INSTANT / 1000)],
        ["date:duration()", "P18263DT3H4M5S"],
      ],
      fixedClock(120),
    );
  });

  it("should show a zero offset as Z only in date-time()", () => {
    assertValues(
      [
        ["date:date-time()", "2020-01-02T03:04:05Z"],
        ["date:date()", "2020-01-02"],
      ],
      fixedClock(0),
    );
    assertValues(
      [["date:date-time()", "2020-01-01T21:34:05-05:30"]],
      fixedClock(-330),
    );
  });

  it("should reject arguments to date-time()", () => {
    assert.throws(() => valueOf("date:date-time(1)"), /expects 0/);
  });
});

describe("systemClock()", () => {
  const saved = process.env.SOURCE_DATE_EPOCH;
  afterEach(() => {
    if (saved === undefined) delete process.env.SOURCE_DATE_EPOCH;
    else process.env.SOURCE_DATE_EPOCH = saved;
  });

  it("should honour SOURCE_DATE_EPOCH as UTC", () => {
    process.env.SOURCE_DATE_EPOCH = "86400";
    const now = systemClock();
    assert.strictEqual(now.getTime(), 86400000);
    assert.strictEqual(now.getTimezoneOffset(), 0);
    assert.strictEqual(valueOf("date:date-time()"), "1970-01-02T00:00:00Z");
  });

  it("should use the current time otherwise", () => {
    delete process.env.SOURCE_DATE_EPOCH;
    const before = Date.now();
    assert.ok(systemClock().getTime() >= before);
    assert.match(
      valueOf("date:date-time()"),
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(Z|[+-]\d\d:\d\d)$/,
    );
  });
});
