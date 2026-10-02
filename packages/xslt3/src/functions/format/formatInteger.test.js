import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDigits, parseDigitPattern, zeroOf } from "./digitPattern.js";
import { formatInteger, formatIntegerFunctions } from "./formatInteger.js";
import {
  alphabetic,
  cardinalWords,
  ordinalWords,
  roman,
} from "./numberWords.js";
import { call, checkDefinitions, one, throwsCode } from "../testing.test.js";

const fi = (value, picture) => formatInteger(BigInt(value), picture);

describe("format-integer", () => {
  checkDefinitions(formatIntegerFunctions);

  it("formats decimal digit patterns (F&O examples)", () => {
    assert.equal(fi(123, "0000"), "0123");
    assert.equal(fi(1500000, "#,###,000"), "1,500,000");
    assert.equal(fi(1500000, "#,##,000"), "15,00,000");
    assert.equal(fi(1500000, "#,000"), "1,500,000");
    assert.equal(fi(1234567, "#;##0;"), "1;234;567");
    assert.equal(fi(-1234, "#,##0"), "-1,234");
    assert.equal(fi(123, "#0"), "123");
    assert.equal(fi(1, "١"), "١");
    assert.equal(fi(1234, "٠٬٠٠٠"), "١٬٢٣٤");
    assert.equal(fi(1234, "𝟎"), "𝟏𝟐𝟑𝟒");
    assert.equal(fi(14, "1;o"), "14th");
    assert.equal(fi(21, "1;o(-e)"), "21st");
    assert.equal(fi(22, "1;o"), "22nd");
    assert.equal(fi(23, "1;o"), "23rd");
    assert.equal(fi(111, "1;o"), "111th");
    assert.equal(fi(12, "0;c"), "12");
  });

  it("formats alphabetic, Roman and word sequences", () => {
    assert.equal(fi(7, "a"), "g");
    assert.equal(fi(27, "A"), "AA");
    assert.equal(fi(0, "a"), "0");
    assert.equal(fi(1999, "i"), "mcmxcix");
    assert.equal(fi(57, "I"), "LVII");
    assert.equal(fi(5000, "I"), "5000");
    assert.equal(fi(0, "i"), "0");
    assert.equal(fi(-5, "Ww;o"), "-Fifth");
    assert.equal(fi(123, "w"), "one hundred and twenty-three");
    assert.equal(fi(2003, "Ww"), "Two Thousand and Three");
    assert.equal(fi(12, "W;o"), "TWELFTH");
    assert.equal(fi(1234, "()Ww;o"), "1234th");
    assert.equal(fi(5, "#"), "5");
  });

  it("rejects invalid pictures with FODF1310", () => {
    for (const picture of [
      "",
      ";",
      "0,000,",
      ",123",
      "0,00,,000",
      "11#0,000",
      "123١",
      "1a",
      "1;o(-en",
      "1;o(-er)z",
      "Ww;o()(",
      "1;x",
    ]) {
      throwsCode(() => fi(1, picture), "FODF1310");
    }
  });

  it("is a function of two or three arguments", () => {
    const f = (...args) =>
      one(call(formatIntegerFunctions, "format-integer", args));
    assert.equal(f(11n, "Ww", "en"), "Eleven");
    assert.equal(f(null, "1"), "");
    assert.equal(f(5n, "1"), "5");
    assert.equal(f(21n, "Ww", "de-AT"), "Einundzwanzig");
    assert.equal(f(3n, "1;o", "de"), "3.");
    assert.equal(f(3n, "w;o(-er)", "de"), "dritter");
    assert.equal(f(3n, "w;o", "fr"), "third");
  });
});

describe("format-integer in German", () => {
  const de = (value, picture) => formatInteger(BigInt(value), picture, "de");

  it("writes cardinal words", () => {
    const cases = {
      0: "null",
      1: "eins",
      16: "sechzehn",
      21: "einundzwanzig",
      30: "dreißig",
      101: "einhunderteins",
      134: "einhundertvierunddreißig",
      1000: "eintausend",
      21000: "einundzwanzigtausend",
      1000000: "eine Million",
      2000001: "zwei Millionen eins",
      3000000000: "drei Milliarden",
    };
    for (const [n, words] of Object.entries(cases)) {
      assert.equal(de(n, "w"), words, n);
    }
    assert.equal(de(134, "W"), "EINHUNDERTVIERUNDDREISSIG");
    assert.equal(de(2134816, "Ww").startsWith("Zwei Millionen Ein"), true);
  });

  it("writes ordinal words with an ending", () => {
    assert.equal(de(1, "w;o"), "erste");
    assert.equal(de(3, "w;o(-es)"), "drittes");
    assert.equal(de(7, "w;o(%spellout-ordinal)"), "siebte");
    assert.equal(de(10, "w;o(-er)"), "zehnter");
    assert.equal(de(20, "w;o(-en)"), "zwanzigsten");
    assert.equal(de(201, "w;o"), "zweihunderterste");
    assert.equal(de(1000000, "w;o"), "eine Millionste");
    assert.equal(de(5, "I;o"), "V");
    assert.equal(de(5, "Z;o"), "5.");
  });
});

describe("number words and digit patterns", () => {
  it("writes English cardinal and ordinal words", () => {
    assert.equal(cardinalWords(0n), "zero");
    assert.equal(cardinalWords(40n), "forty");
    assert.equal(cardinalWords(100n), "one hundred");
    assert.equal(cardinalWords(1001n), "one thousand and one");
    assert.equal(cardinalWords(1100n), "one thousand one hundred");
    assert.equal(cardinalWords(2000000n), "two million");
    assert.equal(cardinalWords(10n ** 21n), "one thousand quintillion");
    assert.equal(ordinalWords(1n), "first");
    assert.equal(ordinalWords(20n), "twentieth");
    assert.equal(ordinalWords(103n), "one hundred and third");
    assert.equal(ordinalWords(1000n), "one thousandth");
    assert.equal(ordinalWords(8n), "eighth");
  });

  it("writes Roman and alphabetic numbers", () => {
    assert.equal(roman(4999n), "mmmmcmxcix");
    assert.equal(alphabetic(702n, "a"), "zz");
    assert.equal(alphabetic(703n, "a"), "aaa");
  });

  it("finds digit families and applies grouping", () => {
    assert.equal(zeroOf("٣"), 0x660);
    assert.equal(zeroOf("𝟗"), 0x1d7ce + 10 * 0 + 0);
    assert.equal(zeroOf("𝟙"), 0x1d7d8);
    const irregular = parseDigitPattern("#,##,##0");
    assert.equal(irregular.grouping, 2 * 0);
    assert.equal(formatDigits(12345678n, irregular), "123,45,678");
    assert.equal(formatDigits("7", parseDigitPattern("000")), "007");
    assert.equal(parseDigitPattern("0,000").grouping, 3);
    assert.equal(parseDigitPattern("0.000,000").grouping, 0);
  });
});
