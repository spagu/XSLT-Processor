import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  civilFromDays,
  daysFromCivil,
  daysInMonth,
  isLeapYear,
} from "./calendar.js";

describe("calendar", () => {
  it("knows leap years, including year 0 and negative years", () => {
    assert.ok(isLeapYear(2000));
    assert.ok(isLeapYear(0));
    assert.ok(isLeapYear(-4));
    assert.ok(!isLeapYear(1900));
    assert.ok(!isLeapYear(-1));
    assert.ok(isLeapYear(2024));
  });

  it("knows month lengths", () => {
    assert.equal(daysInMonth(2001, 2), 28);
    assert.equal(daysInMonth(2000, 2), 29);
    assert.equal(daysInMonth(2000, 4), 30);
    assert.equal(daysInMonth(2000, 12), 31);
  });

  it("converts between dates and day numbers", () => {
    assert.equal(daysFromCivil(1970, 1, 1), 0);
    assert.equal(daysFromCivil(2000, 3, 1), 11017);
    assert.equal(daysFromCivil(1969, 12, 31), -1);
    assert.deepEqual(civilFromDays(0), [1970, 1, 1]);
    assert.deepEqual(civilFromDays(11016), [2000, 2, 29]);
    for (const [y, m, d] of [
      [0, 1, 1],
      [-1, 12, 31],
      [-12345, 6, 15],
      [123456789, 2, 28],
      [2000, 1, 31],
    ]) {
      assert.deepEqual(civilFromDays(daysFromCivil(y, m, d)), [y, m, d]);
    }
  });
});
