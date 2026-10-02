import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dateTimeFunctions } from "./datetime.js";
import { DateTimeValue } from "../xdm/datetime.js";
import { Decimal } from "../xdm/decimal.js";
import {
  call,
  checkDefinitions,
  one,
  strings,
  throwsCode,
  v,
} from "./testing.test.js";

const f = (local, args, ctx = {}) => call(dateTimeFunctions, local, args, ctx);
const g = (local, ...args) => strings(f(local, args));
const dateTime = v("dateTime", "1999-05-31T13:20:00-05:00");

describe("component extraction", () => {
  checkDefinitions(dateTimeFunctions);

  it("extracts dateTime components (F&O examples)", () => {
    assert.deepEqual(g("year-from-dateTime", dateTime), ["1999"]);
    assert.deepEqual(g("month-from-dateTime", dateTime), ["5"]);
    assert.deepEqual(g("day-from-dateTime", dateTime), ["31"]);
    assert.deepEqual(g("hours-from-dateTime", dateTime), ["13"]);
    assert.deepEqual(g("minutes-from-dateTime", dateTime), ["20"]);
    assert.deepEqual(
      g("seconds-from-dateTime", v("dateTime", "1999-05-31T13:20:00.5Z")),
      ["0.5"],
    );
    assert.deepEqual(g("timezone-from-dateTime", dateTime), ["-PT5H"]);
    assert.deepEqual(
      g("timezone-from-dateTime", v("dateTime", "2000-06-12T13:20:00")),
      [],
    );
    assert.deepEqual(g("year-from-dateTime", null), []);
  });

  it("extracts date and time components", () => {
    assert.deepEqual(g("year-from-date", v("date", "-0002-06-01")), ["-2"]);
    assert.deepEqual(g("month-from-date", v("date", "2000-01-01")), ["1"]);
    assert.deepEqual(g("day-from-date", v("date", "2000-01-31+05:00")), ["31"]);
    assert.deepEqual(g("timezone-from-date", v("date", "2000-06-12Z")), [
      "PT0S",
    ]);
    assert.deepEqual(g("hours-from-time", v("time", "24:00:00")), ["0"]);
    assert.deepEqual(g("minutes-from-time", v("time", "13:00:00Z")), ["0"]);
    assert.deepEqual(g("seconds-from-time", v("time", "13:20:10.5")), ["10.5"]);
    assert.deepEqual(g("timezone-from-time", v("time", "13:20:00+14:00")), [
      "PT14H",
    ]);
  });

  it("extracts duration components (F&O examples)", () => {
    const d = (type, text) => v(type, text);
    assert.deepEqual(
      g("years-from-duration", d("yearMonthDuration", "P20Y15M")),
      ["21"],
    );
    assert.deepEqual(
      g("years-from-duration", d("yearMonthDuration", "-P15M")),
      ["-1"],
    );
    assert.deepEqual(
      g("years-from-duration", d("dayTimeDuration", "-P2DT15H")),
      ["0"],
    );
    assert.deepEqual(
      g("months-from-duration", d("yearMonthDuration", "P20Y15M")),
      ["3"],
    );
    assert.deepEqual(
      g("months-from-duration", d("yearMonthDuration", "-P20Y18M")),
      ["-6"],
    );
    assert.deepEqual(
      g("months-from-duration", d("yearMonthDuration", "-P12M")),
      ["0"],
    );
    assert.deepEqual(g("days-from-duration", d("dayTimeDuration", "P3DT10H")), [
      "3",
    ]);
    assert.deepEqual(g("days-from-duration", d("dayTimeDuration", "P3DT55H")), [
      "5",
    ]);
    assert.deepEqual(
      g("hours-from-duration", d("dayTimeDuration", "P3DT10H")),
      ["10"],
    );
    assert.deepEqual(
      g("hours-from-duration", d("dayTimeDuration", "-P3DT10H")),
      ["-10"],
    );
    assert.deepEqual(
      g("minutes-from-duration", d("dayTimeDuration", "-P5DT12H30M")),
      ["-30"],
    );
    assert.deepEqual(
      g("seconds-from-duration", d("dayTimeDuration", "P3DT10H12.5S")),
      ["12.5"],
    );
    assert.deepEqual(
      g("seconds-from-duration", d("dayTimeDuration", "-PT256S")),
      ["-16"],
    );
    assert.deepEqual(g("seconds-from-duration", null), []);
  });
});

describe("dateTime and timezone adjustment", () => {
  it("combines a date and a time", () => {
    assert.deepEqual(
      g("dateTime", v("date", "1999-12-31"), v("time", "12:00:00")),
      ["1999-12-31T12:00:00"],
    );
    assert.deepEqual(
      g("dateTime", v("date", "1999-12-31Z"), v("time", "24:00:00")),
      ["1999-12-31T00:00:00Z"],
    );
    assert.deepEqual(
      g("dateTime", v("date", "1999-12-31"), v("time", "12:00:00+01:00")),
      ["1999-12-31T12:00:00+01:00"],
    );
    assert.deepEqual(
      g("dateTime", v("date", "1999-12-31+01:00"), v("time", "12:00:00+01:00")),
      ["1999-12-31T12:00:00+01:00"],
    );
    assert.deepEqual(g("dateTime", null, v("time", "12:00:00")), []);
    assert.deepEqual(g("dateTime", v("date", "1999-12-31"), null), []);
    throwsCode(
      () =>
        f("dateTime", [v("date", "1999-12-31Z"), v("time", "12:00:00+01:00")]),
      "FORG0008",
    );
  });

  it("adjusts to timezones (F&O examples)", () => {
    const ctx = { implicitTimezone: -300 };
    const adjust = (local, args) => strings(f(local, args, ctx));
    const tz = (text) => v("dayTimeDuration", text);
    assert.deepEqual(
      adjust("adjust-dateTime-to-timezone", [
        v("dateTime", "2002-03-07T10:00:00"),
      ]),
      ["2002-03-07T10:00:00-05:00"],
    );
    assert.deepEqual(
      adjust("adjust-dateTime-to-timezone", [
        v("dateTime", "2002-03-07T10:00:00-07:00"),
      ]),
      ["2002-03-07T12:00:00-05:00"],
    );
    assert.deepEqual(
      adjust("adjust-dateTime-to-timezone", [
        v("dateTime", "2002-03-07T10:00:00-07:00"),
        tz("PT10H"),
      ]),
      ["2002-03-08T03:00:00+10:00"],
    );
    assert.deepEqual(
      adjust("adjust-dateTime-to-timezone", [
        v("dateTime", "2002-03-07T10:00:00-07:00"),
        null,
      ]),
      ["2002-03-07T10:00:00"],
    );
    assert.deepEqual(
      adjust("adjust-date-to-timezone", [v("date", "2002-03-07-07:00")]),
      ["2002-03-07-05:00"],
    );
    assert.deepEqual(
      adjust("adjust-date-to-timezone", [
        v("date", "2002-03-07-07:00"),
        tz("-PT10H"),
      ]),
      ["2002-03-06-10:00"],
    );
    assert.deepEqual(
      adjust("adjust-time-to-timezone", [
        v("time", "10:00:00-07:00"),
        tz("PT10H"),
      ]),
      ["03:00:00+10:00"],
    );
    assert.deepEqual(adjust("adjust-time-to-timezone", [null]), []);
    assert.deepEqual(
      strings(f("adjust-time-to-timezone", [v("time", "10:00:00")])),
      ["10:00:00Z"],
    );
    throwsCode(
      () =>
        adjust("adjust-time-to-timezone", [v("time", "10:00:00"), tz("PT15H")]),
      "FODT0003",
    );
    throwsCode(
      () =>
        adjust("adjust-time-to-timezone", [
          v("time", "10:00:00"),
          tz("PT1M1S"),
        ]),
      "FODT0003",
    );
  });
});

describe("context functions", () => {
  const now = new DateTimeValue({
    year: 2005,
    month: 12,
    day: 6,
    hour: 12,
    minute: 30,
    second: Decimal.parse("1.5"),
    timezone: -300,
  });
  it("read the current date and time from the context", () => {
    const ctx = { currentDateTime: now, implicitTimezone: 60 };
    assert.equal(
      one(f("current-dateTime", [], ctx)),
      "2005-12-06T12:30:01.5-05:00",
    );
    assert.equal(
      f("current-dateTime", [], ctx)[0].type.localName,
      "dateTimeStamp",
    );
    assert.equal(one(f("current-date", [], ctx)), "2005-12-06-05:00");
    assert.equal(one(f("current-time", [], ctx)), "12:30:01.5-05:00");
    assert.equal(one(f("implicit-timezone", [], ctx)), "PT1H");
    assert.equal(one(f("implicit-timezone", [], {})), "PT0S");
    const local = new DateTimeValue({ ...now, timezone: null });
    assert.equal(
      one(
        f("current-date", [], { currentDateTime: local, implicitTimezone: 60 }),
      ),
      "2005-12-06+01:00",
    );
    assert.equal(
      one(f("current-time", [], { currentDateTime: local })),
      "12:30:01.5Z",
    );
  });
});
