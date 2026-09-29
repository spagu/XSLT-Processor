/**
 * EXSLT dates-and-times field functions, through XPath. Expected values
 * follow libexslt `date.c`, including its quirks (a "+00:00" offset is not
 * shown, gMonth is "--MM--", invalid leap-year() is NaN).
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { assertValues, valueOf } from "./exsltHarness.test.js";

describe("date:date() / date:time()", () => {
  it("should extract the date part", () => {
    assertValues([
      ["date:date('2001-12-31T10:00:00')", "2001-12-31"],
      ["date:date('2001-12-31T10:00:00Z')", "2001-12-31Z"],
      ["date:date('2001-12-31T10:00:00+00:00')", "2001-12-31"],
      ["date:date('2001-12-31-05:00')", "2001-12-31-05:00"],
      ["date:date('2000-02-29')", "2000-02-29"],
      ["date:date('2001-02-29')", ""],
      ["date:date('2001-12')", ""],
      ["date:date('10:00:00')", ""],
      ["date:date('abc')", ""],
    ]);
  });

  it("should extract the time part", () => {
    assertValues([
      ["date:time('2001-12-31T10:20:30')", "10:20:30"],
      ["date:time('10:20:30.25')", "10:20:30.25"],
      ["date:time('10:20:30.500+02:00')", "10:20:30.5+02:00"],
      ["date:time('10:20:30Z')", "10:20:30Z"],
      ["date:time('24:00:00')", ""],
      ["date:time('10:20:60')", ""],
      ["date:time('2001-12-31')", ""],
    ]);
  });
});

describe("date:year() / date:leap-year()", () => {
  it("should follow libexslt on a table", () => {
    assertValues([
      ["date:year('2001-12-31')", "2001"],
      ["date:year('2001')", "2001"],
      ["date:year('2001-05')", "2001"],
      ["date:year('2001-05:30')", "2001"],
      ["date:year('-0001')", "-1"],
      ["date:year('-0044-03-15')", "-44"],
      ["date:year('12345-01-01')", "12345"],
      ["date:year('--05--')", "NaN"],
      ["date:year('0000')", "NaN"],
      ["date:year('01234')", "NaN"],
      ["date:year('+2001')", "NaN"],
      ["date:leap-year('2000')", "true"],
      ["date:leap-year('1900')", "false"],
      ["date:leap-year('2004-03')", "true"],
      ["date:leap-year('-0001')", "true"],
      ["date:leap-year('--02-29')", "NaN"],
      ["date:leap-year('x')", "NaN"],
    ]);
  });
});

describe("month functions", () => {
  it("should follow libexslt on a table", () => {
    assertValues([
      ["date:month-in-year('2001-05-06')", "5"],
      ["date:month-in-year('--12--')", "12"],
      ["date:month-in-year('--11-30')", "11"],
      ["date:month-in-year('2001-07')", "7"],
      ["date:month-in-year('---30')", "NaN"],
      ["date:month-in-year('2001')", "NaN"],
      ["date:month-name('2001-05-06')", "May"],
      ["date:month-name('--01--')", "January"],
      ["date:month-name('x')", ""],
      ["date:month-abbreviation('2001-09-01')", "Sep"],
      ["date:month-abbreviation('2001')", ""],
    ]);
  });
});

describe("week and day functions", () => {
  it("should number ISO weeks like libexslt", () => {
    assertValues([
      ["date:week-in-year('2005-01-01')", "53"],
      ["date:week-in-year('2005-01-03')", "1"],
      ["date:week-in-year('2008-12-29')", "1"],
      ["date:week-in-year('2010-01-03')", "53"],
      ["date:week-in-year('2001-06-15T10:00:00')", "24"],
      ["date:week-in-year('0001-01-01')", "1"],
      ["date:week-in-year('2001-06')", "NaN"],
      ["date:week-in-month('2024-02-29')", "5"],
      ["date:week-in-month('2024-04-01')", "1"],
      ["date:week-in-month('2024-04-07')", "1"],
      ["date:week-in-month('2024-04-08')", "2"],
      ["date:week-in-month('x')", "NaN"],
    ]);
  });

  it("should compute days like libexslt", () => {
    assertValues([
      ["date:day-in-year('2024-12-31')", "366"],
      ["date:day-in-year('2023-03-01')", "60"],
      ["date:day-in-year('--03-01')", "NaN"],
      ["date:day-in-month('2001-05-06')", "6"],
      ["date:day-in-month('---15')", "15"],
      ["date:day-in-month('--05-06')", "6"],
      ["date:day-in-month('2001-05')", "NaN"],
      ["date:day-of-week-in-month('2024-02-29')", "5"],
      ["date:day-of-week-in-month('2024-02-07')", "1"],
      ["date:day-of-week-in-month('2024-02-08')", "2"],
      ["date:day-of-week-in-month('2024')", "NaN"],
      ["date:day-in-week('2024-02-29')", "5"],
      ["date:day-in-week('1970-01-01')", "5"],
      ["date:day-in-week('2000-01-02')", "1"],
      ["date:day-in-week('2000-01-01T23:00:00')", "7"],
      ["date:day-in-week('10:00:00')", "NaN"],
      ["date:day-name('1970-01-01')", "Thursday"],
      ["date:day-name('-0001-01-01')", "Saturday"],
      ["date:day-name('-0400-03-01')", "Thursday"],
      ["date:day-name('x')", ""],
      ["date:day-abbreviation('2024-02-26')", "Mon"],
      ["date:day-abbreviation('2024')", ""],
    ]);
  });
});

describe("time of day functions", () => {
  it("should follow libexslt on a table", () => {
    assertValues([
      ["date:hour-in-day('2001-12-31T10:20:30')", "10"],
      ["date:hour-in-day('23:20:30')", "23"],
      ["date:hour-in-day('2001-12-31')", "NaN"],
      ["date:minute-in-hour('10:20:30')", "20"],
      ["date:minute-in-hour('2001')", "NaN"],
      ["date:second-in-minute('10:20:30.5')", "30.5"],
      ["date:second-in-minute('--01--')", "NaN"],
    ]);
  });

  it("should convert node-set arguments to strings", () => {
    assert.strictEqual(
      valueOf("date:hour-in-day(/r/t)", {
        xml: "<r><t>2001-12-31T07:00:00</t></r>",
      }),
      "7",
    );
  });

  it("should check the arity", () => {
    assert.throws(
      () => valueOf("date:year('2001', 1)"),
      /date:year\(\) expects 0 to 1/,
    );
  });
});
