/**
 * Lexical forms of the EXSLT dates-and-times module: parsing and formatting
 * of dates and durations, checked against libexslt `date.c` behaviour.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { DateType, createDate, isLeapYear } from "./calendar.js";
import { parseDate } from "./dateParse.js";
import {
  formatByType,
  formatDateTime,
  formatTimeZone,
  formatYear,
} from "./dateFormat.js";
import { addDurations, formatDuration, parseDuration } from "./duration.js";

describe("parseDate()", () => {
  it("should recognise every type libexslt parses", () => {
    const rows = [
      ["2001-12-31T10:20:30.5-05:00", DateType.DATETIME],
      ["2001-12-31", DateType.DATE],
      ["10:20:30Z", DateType.TIME],
      ["2001-12", DateType.GYEARMONTH],
      ["2001", DateType.GYEAR],
      ["--12-31", DateType.GMONTHDAY],
      ["--02-30", DateType.GMONTHDAY],
      ["--12--", DateType.GMONTH],
      ["---31", DateType.GDAY],
      ["2001-05:30", DateType.GYEAR],
      ["-0044-03-15", DateType.DATE],
      ["12345-01-01", DateType.DATE],
    ];
    for (const [text, type] of rows) {
      assert.strictEqual(parseDate(text)?.type, type, text);
    }
  });

  it("should reject what libexslt rejects", () => {
    const rows = [
      "",
      "x",
      "+2001",
      "0000",
      "01234",
      "201",
      "9".repeat(20),
      "2001-13",
      "2001-02-29",
      "2001-12-32",
      "2001-12-31 10:00:00",
      "2001-12-31T10:00",
      "2001-12-31T10:00:00.",
      "2001-12-31T24:00:00",
      "2001-12-31T10:00:60",
      "2001-12-31T10:00:00+24:00",
      "2001-12-31T10:00:00+05:60",
      "2001-12-31T10:00:00+05",
      "2001-12-31T10:00:00Zjunk",
      "2001Zx",
      "2001-01:00-05",
      "10:00:00Zx",
      "10:00",
      "12:3",
      "--13--",
      "--05",
      "--05-x",
      "---32",
      "---3",
      "--05--x",
    ];
    for (const text of rows) {
      assert.strictEqual(parseDate(text), null, text);
    }
  });

  it("should keep the fields and time zone", () => {
    const dt = parseDate("-0044-03-15T01:02:03.25+05:30");
    assert.deepStrictEqual(
      [dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec, dt.tzo, dt.tzFlag],
      [-43, 3, 15, 1, 2, 3.25, 330, false],
    );
    assert.strictEqual(parseDate("2001-01-01Z").tzFlag, true);
  });

  it("should follow the proleptic Gregorian leap rule", () => {
    assert.deepStrictEqual(
      [2000, 1900, 2004, 2001, 0, -4, -100].map(isLeapYear),
      [true, false, true, false, true, true, false],
    );
  });
});

describe("date formatting", () => {
  it("should format years, zones and every type", () => {
    assert.strictEqual(formatYear(1), "0001");
    assert.strictEqual(formatYear(0), "-0001");
    assert.strictEqual(formatTimeZone(-330), "-05:30");
    assert.strictEqual(formatTimeZone(0), "Z");
    assert.strictEqual(formatByType(parseDate("2001-05:30")), "2001-05:30");
    assert.strictEqual(formatByType(parseDate("2001-05Z")), "2001-05Z");
    assert.strictEqual(formatByType(parseDate("10:00:00.1")), "10:00:00.1");
    assert.strictEqual(formatByType(parseDate("---05")), null);
  });

  it("should always give an xs:dateTime a time zone", () => {
    assert.strictEqual(
      formatDateTime(parseDate("2001-01-01T00:00:00")),
      "2001-01-01T00:00:00Z",
    );
    const invalid = createDate(DateType.DATETIME);
    invalid.mon = 13;
    assert.strictEqual(formatDateTime(invalid), null);
    invalid.mon = 1;
    invalid.sec = 59.9999999999;
    assert.strictEqual(
      formatDateTime(invalid),
      "-0001-01-01T00:00:59.999999999Z",
    );
  });
});

describe("parseDuration()", () => {
  it("should normalise durations like libexslt", () => {
    const rows = [
      ["P1Y2M", { mon: 14, day: 0, sec: 0 }],
      ["P3DT4H5M6.5S", { mon: 0, day: 3, sec: 14706.5 }],
      ["PT36H", { mon: 0, day: 1, sec: 43200 }],
      ["PT1441M", { mon: 0, day: 1, sec: 60 }],
      ["PT86401S", { mon: 0, day: 1, sec: 1 }],
      ["PT.5S", { mon: 0, day: 0, sec: 0.5 }],
      ["PT1.S", { mon: 0, day: 0, sec: 1 }],
      ["-P1D", { mon: 0, day: -1, sec: 0 }],
      ["-PT1S", { mon: 0, day: -1, sec: 86399 }],
      ["-P1Y", { mon: -12, day: 0, sec: 0 }],
    ];
    for (const [text, expected] of rows) {
      assert.deepStrictEqual(parseDuration(text), expected, text);
    }
  });

  it("should reject what libexslt rejects", () => {
    const rows = [
      "",
      "x",
      "P",
      "-P",
      "PT",
      "P1",
      "P1D2",
      "P1H",
      "PT1D",
      "P1.5D",
      "PT1.5M",
      "P1Y1Y",
      "P1M1Y",
      "PT1H1H",
      "PT1HT1M",
      "P1DT",
      "P1S",
      "P.D",
      "P1D ",
      "PT1S1",
      "P99999999999999999999D",
      "1D",
    ];
    for (const text of rows) {
      assert.strictEqual(parseDuration(text), null, text);
    }
  });
});

describe("duration formatting and addition", () => {
  it("should format durations like libexslt", () => {
    const rows = [
      [{ mon: 0, day: 0, sec: 0 }, "P0D"],
      [{ mon: 14, day: 3, sec: 3661.5 }, "P1Y2M3DT1H1M1.5S"],
      [{ mon: 12, day: 0, sec: 3600 }, "P1YT1H"],
      [{ mon: 0, day: -1, sec: 86399 }, "-PT1S"],
      [{ mon: -2, day: 0, sec: 0 }, "-P2M"],
      [{ mon: 0, day: 0, sec: 0.9999999999 }, "PT1S"],
      [{ mon: 0, day: 0, sec: 0.000000001 }, "PT0.000000001S"],
      [{ mon: 0, day: 0, sec: 3600.25 }, "PT1H0.25S"],
    ];
    for (const [dur, expected] of rows) {
      assert.strictEqual(formatDuration(dur), expected);
    }
  });

  it("should refuse indeterminate sums", () => {
    const d = (text) => parseDuration(text);
    assert.strictEqual(addDurations(d("P1M"), d("-P1D")), null);
    assert.strictEqual(addDurations(d("-P1M"), d("P1D")), null);
    assert.strictEqual(addDurations(d("-P1M"), d("PT0S")).mon, -1);
    assert.deepStrictEqual(addDurations(d("PT12H"), d("PT12H")), {
      mon: 0,
      day: 1,
      sec: 0,
    });
  });
});
