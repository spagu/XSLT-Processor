/**
 * Numbering in words and other systems for format-integer and
 * format-date/time (F&O 3.1 sections 4.6.1 and 9.8.4): English cardinal
 * and ordinal words, ordinal suffixes, Roman numerals and alphabetic
 * sequences.
 *
 * @module @tradik/xslt3/functions/format/numberWords
 */

const ONES = (
  "zero one two three four five six seven eight nine ten eleven twelve " +
  "thirteen fourteen fifteen sixteen seventeen eighteen nineteen"
).split(" ");
const TENS = "  twenty thirty forty fifty sixty seventy eighty ninety".split(
  " ",
);
const SCALES = [
  [10n ** 18n, "quintillion"],
  [10n ** 15n, "quadrillion"],
  [10n ** 12n, "trillion"],
  [10n ** 9n, "billion"],
  [10n ** 6n, "million"],
  [1000n, "thousand"],
];

/**
 * English cardinal words, e.g. "one hundred and twenty-three".
 * @param {bigint} n - Non-negative
 * @returns {string}
 */
export function cardinalWords(n) {
  if (n < 20n) return ONES[Number(n)];
  if (n < 100n) {
    const units = n % 10n;
    return TENS[Number(n / 10n)] + (units ? `-${ONES[Number(units)]}` : "");
  }
  if (n < 1000n) {
    const rest = n % 100n;
    return (
      `${ONES[Number(n / 100n)]} hundred` +
      (rest ? ` and ${cardinalWords(rest)}` : "")
    );
  }
  const [scale, name] = SCALES.find(([s]) => n >= s) ?? SCALES[0];
  const rest = n % scale;
  const joiner = rest === 0n ? "" : rest < 100n ? " and " : " ";
  return (
    `${cardinalWords(n / scale)} ${name}` +
    joiner +
    (rest ? cardinalWords(rest) : "")
  );
}

const IRREGULAR_ORDINALS = {
  one: "first",
  two: "second",
  three: "third",
  five: "fifth",
  eight: "eighth",
  nine: "ninth",
  twelve: "twelfth",
};

/**
 * English ordinal words, e.g. "twenty-first".
 * @param {bigint} n - Non-negative
 * @returns {string}
 */
export function ordinalWords(n) {
  const words = cardinalWords(n);
  const [, head, last] = /^(.*?)([a-z]+)$/.exec(words);
  const ordinal =
    IRREGULAR_ORDINALS[last] ??
    (last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`);
  return head + ordinal;
}

/**
 * English ordinal suffix of a number: "st", "nd", "rd" or "th".
 * @param {bigint} n - Non-negative
 * @returns {string}
 */
export function ordinalSuffix(n) {
  const lastTwo = n % 100n;
  if (lastTwo >= 11n && lastTwo <= 13n) return "th";
  return ["th", "st", "nd", "rd"][Number(n % 10n)] ?? "th";
}

const ROMAN = [
  [1000n, "m"],
  [900n, "cm"],
  [500n, "d"],
  [400n, "cd"],
  [100n, "c"],
  [90n, "xc"],
  [50n, "l"],
  [40n, "xl"],
  [10n, "x"],
  [9n, "ix"],
  [5n, "v"],
  [4n, "iv"],
  [1n, "i"],
];

/** Largest number written in Roman numerals; larger ones use digits. */
export const MAX_ROMAN = 4999n;

/**
 * Lower-case Roman numerals.
 * @param {bigint} n - 1 to {@link MAX_ROMAN}
 * @returns {string}
 */
export function roman(n) {
  let result = "";
  let rest = n;
  for (const [value, letters] of ROMAN) {
    while (rest >= value) {
      result += letters;
      rest -= value;
    }
  }
  return result;
}

/**
 * Alphabetic numbering a, b, ..., z, aa, ab, ... (bijective base 26).
 * @param {bigint} n - Positive
 * @param {string} first - "a" or "A"
 * @returns {string}
 */
export function alphabetic(n, first) {
  const base = first.codePointAt(0);
  let result = "";
  for (let rest = n; rest > 0n; rest = (rest - 1n) / 26n) {
    result = String.fromCodePoint(base + Number((rest - 1n) % 26n)) + result;
  }
  return result;
}

/**
 * Applies the case of a word format token.
 * @param {string} words - Lower-case words
 * @param {string} token - "w", "W" or "Ww"
 * @returns {string}
 */
export function caseWords(words, token) {
  if (token === "W") return words.toUpperCase();
  if (token === "Ww") {
    // title case, with "and" kept lower-case as in the F&O examples
    return words.replace(/\b(?!and\b)[a-z]/g, (c) => c.toUpperCase());
  }
  return words;
}
