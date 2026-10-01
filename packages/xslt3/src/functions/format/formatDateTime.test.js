import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDatePicture, parseMarker } from "./datePicture.js";
import { formatDateTime, formatDateTimeFunctions } from "./formatDateTime.js";
import { applyPlace } from "./place.js";
import { call, checkDefinitions, one, throwsCode, v } from "../testing.test.js";

const d = v("date", "2002-12-31").value;
const t = v("time", "15:58:45.762+02:00").value;
const dt = v("dateTime", "2002-12-31T15:58:45.762+02:00").value;
const date = (picture, options) => formatDateTime("date", d, picture, options);
const time = (picture, options) => formatDateTime("time", t, picture, options);
const dateTime = (picture, options) =>
  formatDateTime("dateTime", dt, picture, options);

describe("format-date, format-time and format-dateTime", () => {
  checkDefinitions(formatDateTimeFunctions);

  it("formats the F&O date examples", () => {
    assert.equal(date("[Y0001]-[M01]-[D01]"), "2002-12-31");
    assert.equal(date("[M]-[D]-[Y]"), "12-31-2002");
    assert.equal(date("[D]-[M]-[Y]"), "31-12-2002");
    assert.equal(date("[D1] [MI] [Y]"), "31 XII 2002");
    assert.equal(date("[D1o] [MNn], [Y]"), "31st December, 2002");
    assert.equal(date("[D01] [MN,*-3] [Y0001]"), "31 DEC 2002");
    assert.equal(date("[MNn] [D], [Y]"), "December 31, 2002");
    assert.equal(date("[[[Y0001]-[M01]-[D01]]]"), "[2002-12-31]");
    assert.equal(
      formatDateTime("date", v("date", "2003-01-01").value, "[YWw]"),
      "Two Thousand and Three",
    );
    assert.equal(
      date("[FNn] [D] [MNn] [Y]", { language: "sv" }),
      "[Language: en]Tuesday 31 December 2002",
    );
    assert.equal(date("[D] [MNn]", { language: "en-GB" }), "31 December");
  });

  it("formats the F&O time and dateTime examples", () => {
    assert.equal(time("[h]:[m01] [PN]"), "3:58 PM");
    assert.equal(time("[h]:[m01]:[s01] [Pn]"), "3:58:45 pm");
    assert.equal(time("[H01]:[m01]"), "15:58");
    assert.equal(time("[H01]:[m01]:[s01].[f001]"), "15:58:45.762");
    assert.equal(time("[H01]:[m01]:[s01] [z,6-6]"), "15:58:45 GMT+02:00");
    assert.equal(
      dateTime("[h].[m01][Pn] on [FNn], [D1o] [MNn]"),
      "3.58pm on Tuesday, 31st December",
    );
    assert.equal(
      dateTime("[M01]/[D01]/[Y0001] at [H01]:[m01]:[s01]"),
      "12/31/2002 at 15:58:45",
    );
  });

  it("formats other components and modifiers", () => {
    assert.equal(
      date("[d] [F] [F1] [W] [w] [Y01] [Y,2] [Yi,3-3]"),
      "365 tuesday 2 1 5 02 2002 ii ",
    );
    assert.equal(
      date("[Y9,999,*] [Da] [Mw] [DWwo] [D,3]"),
      "2,002 ae twelve Thirty-First 031",
    );
    assert.equal(
      date("[Dn] [Dx] [Fz] [C] [E] [M#1]"),
      "31 31 tuesday AD AD 12",
    );
    assert.equal(dateTime("[F,3-4] [FNn,*-3] [P1] [C1]"), "tues Tue pm AD");
    assert.equal(
      time("[h] [H] [P,2] [m] [s] [f1,1-1] [f01] [f,1-*]"),
      "3 15 pm 58 45 7 76 762",
    );
    assert.equal(
      formatDateTime("time", v("time", "00:00:00").value, "[h] [P] [f]"),
      "12 am 0",
    );
    assert.equal(
      formatDateTime(
        "time",
        v("time", "12:00:00.006").value,
        "[f,*-2] [f,1-*]",
      ),
      "0 006",
    );
    assert.equal(
      formatDateTime(
        "time",
        v("time", "12:01:01.135").value,
        "[f0'0'0] [f00'0] [f99#]",
      ),
      "1'3'5 13'5 135",
    );
    assert.equal(
      formatDateTime(
        "time",
        v("time", "12:01:01.1").value,
        "[f1###,3-3] [f٠#,2-2] [f9]",
      ),
      "100 ١٠ 1",
    );
    assert.equal(
      formatDateTime("time", v("time", "12:01:01.5").value, "[f01,3] [fx] [f]"),
      "500 5 5",
    );
    assert.equal(
      formatDateTime(
        "date",
        v("date", "-0044-03-15").value,
        "[Y] [E] [E,*-1]",
        { calendar: "AD" },
      ),
      "44 BC B",
    );
    assert.equal(
      formatDateTime("date", v("date", "-0044-03-15").value, "[E]", {
        calendar: "ISO",
      }),
      "-",
    );
    assert.equal(
      formatDateTime("date", v("date", "2006-01-30").value, "[w]", {
        calendar: "Q{}ISO",
      }),
      "5",
    );
    assert.equal(
      formatDateTime("date", v("date", "2006-01-01").value, "[w] [E]", {
        calendar: "ISO",
      }),
      "5 ",
    );
  });

  it("formats timezones", () => {
    const z = (tz, picture) =>
      formatDateTime("time", v("time", `12:00:00${tz}`).value, picture);
    assert.equal(z("-10:00", "[Z]"), "-10:00");
    assert.equal(z("-05:00", "[Z0]"), "-5");
    assert.equal(z("+05:30", "[Z0]"), "+5:30");
    assert.equal(z("Z", "[Z0:00]"), "+0:00");
    assert.equal(z("+13:00", "[Z0000]"), "+1300");
    assert.equal(z("Z", "[Z00:00t]"), "Z");
    assert.equal(z("-05:00", "[ZZ]"), "R");
    assert.equal(z("+05:30", "[ZZ]"), "+05:30");
    assert.equal(z("", "[ZZ]"), "J");
    assert.equal(z("", "[Z]"), "");
    assert.equal(z("-05:00", "[ZN]"), "EST");
    assert.equal(z("+05:30", "[ZN]"), "+05:30");
    assert.equal(
      z("+01:00", "[Z٠٠:٠٠] [z] [Zx,8]"),
      "+٠١:٠٠ GMT+01:00 +01:00  ",
    );
  });

  it("uses an IANA place to adjust the value", () => {
    const value = v("dateTime", "2015-08-15T12:00:00Z").value;
    const at = (place, picture) =>
      formatDateTime("dateTime", value, picture, { place });
    assert.equal(
      at("America/New_York", "[H01]:[m01] [Z] [ZN]"),
      "08:00 -04:00 EDT",
    );
    assert.equal(at("Europe/Paris", "[H01]:[m01] [ZN]"), "14:00 CEST");
    assert.equal(at("Asia/Kolkata", "[H01]:[m01] [ZN]"), "17:30 +05:30");
    assert.equal(at("Etc/UTC", "[H01] [ZN]"), "12 UTC");
    assert.equal(at("Nowhere/Nothing", "[H01]"), "12");
    const summer = v("date", "2015-08-15Z").value;
    assert.equal(
      formatDateTime("date", summer, "[D] [Z]", { place: "America/New_York" }),
      "14 -04:00",
    );
    assert.equal(at("us", "[H01]"), "12");
    assert.equal(applyPlace("time", t, "Europe/Paris").value, t);
    const local = v("dateTime", "2015-08-15T12:00:00").value;
    assert.equal(applyPlace("dateTime", local, "Europe/Paris").zone, null);
  });

  it("raises picture, component and calendar errors", () => {
    throwsCode(() => date("[H]"), "FOFD1350");
    throwsCode(() => time("[Y]"), "FOFD1350");
    throwsCode(() => time("[E]"), "FOFD1350");
    for (const picture of [
      "[",
      "]",
      "[]",
      "[Q]",
      "[Y,0]",
      "[Y,3-2]",
      "[Y,a]",
      "[Y,2-0]",
      "[Y999#]",
      "[f#99]",
    ]) {
      throwsCode(() => dateTime(picture), "FOFD1340");
    }
    throwsCode(() => date("[Y]", { calendar: "ZODIAC" }), "FOFD1340");
    throwsCode(() => date("[Y]", { calendar: "Q{}ZODIAC" }), "FOFD1340");
    assert.equal(date("[Y]", { calendar: "OS" }), "[Calendar: AD]2002");
    assert.equal(date("[Y]", { calendar: "q:cal" }), "[Calendar: AD]2002");
    assert.equal(date("[Y] [C]", { calendar: "CE" }), "2002 CE");
  });

  it("parses pictures", () => {
    assert.deepEqual(parseMarker(" M n , 3 - 4 "), {
      component: "M",
      first: "n",
      second: null,
      minWidth: 3,
      maxWidth: 4,
    });
    assert.deepEqual(parseMarker("D1o"), {
      component: "D",
      first: "1",
      second: "o",
      minWidth: null,
      maxWidth: null,
    });
    assert.deepEqual(parseDatePicture("a[[b]]c"), ["a[b]c"]);
  });

  it("is a function of two or five arguments", () => {
    const f = (local, args) => call(formatDateTimeFunctions, local, args);
    assert.equal(one(f("format-date", [v("date", "2002-12-31"), "[D]"])), "31");
    assert.deepEqual(f("format-time", [null, "[H]"]), []);
    assert.equal(
      one(
        f("format-dateTime", [
          v("dateTime", "2002-12-31T00:00:00Z"),
          "[D] [MNn]",
          "de",
          "AD",
          "Europe/Berlin",
        ]),
      ),
      "[Language: en]31 December",
    );
  });
});
