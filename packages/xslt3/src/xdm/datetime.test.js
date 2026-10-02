import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkYear,
  componentsOf,
  DateTimeValue,
  formatDateTime,
  formatTimezone,
  MAX_YEAR,
  parseDateTime,
} from "./datetime.js";
import { Decimal } from "./decimal.js";
import { fromLocalSeconds, localSeconds, timelineSeconds } from "./timeline.js";

/** Parses and prints back. */
const roundTrip = (kind, text) =>
  formatDateTime(kind, parseDateTime(kind, text));

describe("date/time lexical forms", () => {
  it("round-trips every kind", () => {
    const cases = [
      ["dateTime", "2002-04-02T12:00:00-01:00"],
      ["dateTime", "2002-04-02T12:00:00.5Z"],
      ["date", "2002-04-02+14:00"],
      ["time", "23:59:59.999"],
      ["gYearMonth", "2002-04"],
      ["gYear", "-0044Z"],
      ["gMonthDay", "--02-29"],
      ["gDay", "---31-05:30"],
      ["gMonth", "--12"],
    ];
    for (const [kind, text] of cases) assert.equal(roundTrip(kind, text), text);
  });

  it("produces the canonical forms of F&O 19.1.2", () => {
    assert.equal(roundTrip("time", "13:20:00.000"), "13:20:00");
    assert.equal(roundTrip("time", "13:20:05.10"), "13:20:05.1");
    assert.equal(
      roundTrip("dateTime", "2002-04-02T12:00:00+00:00"),
      "2002-04-02T12:00:00Z",
    );
    assert.equal(
      roundTrip("dateTime", "2002-04-02T12:00:00-00:00"),
      "2002-04-02T12:00:00Z",
    );
    assert.equal(roundTrip("gYear", "0000"), "0000");
    assert.equal(roundTrip("gYear", "-0000"), "0000");
    assert.equal(roundTrip("gYear", "123456"), "123456");
    assert.equal(roundTrip("gYear", "-0001"), "-0001");
  });

  it("maps 24:00:00 to midnight of the next day", () => {
    assert.equal(
      roundTrip("dateTime", "1999-12-31T24:00:00Z"),
      "2000-01-01T00:00:00Z",
    );
    assert.equal(roundTrip("time", "24:00:00"), "00:00:00");
  });

  it("rejects invalid forms", () => {
    const cases = [
      ["date", "2001-02-29"],
      ["date", "2002-13-01"],
      ["date", "2002-00-01"],
      ["date", "2002-04-00"],
      ["date", "02-04-02"],
      ["date", "01234-01-01"],
      ["date", "2002-04-02T"],
      ["time", "24:00:01"],
      ["time", "24:01:00"],
      ["time", "23:60:00"],
      ["time", "23:00:60"],
      ["time", "25:00:00"],
      ["time", "12:00:00+14:01"],
      ["time", "12:00:00+15:00"],
      ["time", "12:00:00+01:60"],
      ["time", "12:00:00+0100"],
      ["gMonthDay", "--02-30"],
      ["gDay", "---32"],
      ["gMonth", "--13"],
      ["dateTime", "2002-04-02 12:00:00"],
    ];
    for (const [kind, text] of cases) {
      assert.equal(parseDateTime(kind, text), null, text);
    }
  });

  it("raises FODT0001 for years out of range", () => {
    assert.equal(checkYear(MAX_YEAR), MAX_YEAR);
    assert.throws(() => checkYear(-MAX_YEAR - 1), { code: "FODT0001" });
    assert.throws(() => parseDateTime("gYear", "12345678901"), {
      code: "FODT0001",
    });
    assert.throws(() => parseDateTime("dateTime", "999999999-12-31T24:00:00"), {
      code: "FODT0001",
    });
  });

  it("formats timezones and lists components", () => {
    assert.equal(formatTimezone(null), "");
    assert.equal(formatTimezone(0), "Z");
    assert.equal(formatTimezone(-330), "-05:30");
    assert.equal(formatTimezone(840), "+14:00");
    assert.deepEqual(componentsOf("gYearMonth"), ["year", "month"]);
  });

  it("builds frozen values with null components", () => {
    const value = new DateTimeValue({ year: 2000 });
    assert.equal(value.month, null);
    assert.equal(value.timezone, null);
    assert.ok(Object.isFrozen(value));
  });
});

describe("time line", () => {
  const dt = (text) => parseDateTime("dateTime", text);

  it("normalizes timezones", () => {
    const a = timelineSeconds(dt("2002-04-02T12:00:00-01:00"), 0);
    const b = timelineSeconds(dt("2002-04-02T17:00:00+04:00"), 0);
    assert.equal(a.compare(b), 0);
  });

  it("applies the implicit timezone to values without one", () => {
    const local = dt("2002-04-02T12:00:00");
    const utc = dt("2002-04-02T12:00:00Z");
    assert.equal(timelineSeconds(local, 0).compare(timelineSeconds(utc, 0)), 0);
    assert.equal(
      timelineSeconds(local, 60).compare(timelineSeconds(utc, 0)),
      -1,
    );
  });

  it("uses the reference date for partial values", () => {
    const time = parseDateTime("time", "00:00:00");
    assert.equal(localSeconds(time).toString(), String(730 * 86400));
  });

  it("converts local seconds back to components", () => {
    const value = dt("-0001-12-31T23:59:59.25+01:00");
    const back = fromLocalSeconds(localSeconds(value), value.timezone);
    assert.equal(
      formatDateTime("dateTime", back),
      "-0001-12-31T23:59:59.25+01:00",
    );
    const epoch = fromLocalSeconds(Decimal.parse("-0.5"), null);
    assert.equal(formatDateTime("dateTime", epoch), "1969-12-31T23:59:59.5");
  });
});
