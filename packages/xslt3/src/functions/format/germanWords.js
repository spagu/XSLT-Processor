/**
 * German numbers in words for format-integer and xsl:number with
 * language "de" (F&O 3.1 section 4.6.1): cardinals ("einundzwanzig",
 * "zweihunderteins", "eine Million") and ordinals with an ending
 * ("dritte", "zehnter", "zwanzigsten"); digits take "." as ordinal mark.
 *
 * @module @tradik/xslt3/functions/format/germanWords
 */

const ONES = (
  "null eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf " +
  "dreizehn vierzehn fünfzehn sechzehn siebzehn achtzehn neunzehn"
).split(" ");
const TENS =
  "  zwanzig dreißig vierzig fünfzig sechzig siebzig achtzig neunzig".split(
    " ",
  );
const SCALES = [
  [10n ** 18n, "Trillion", "Trillionen"],
  [10n ** 15n, "Billiarde", "Billiarden"],
  [10n ** 12n, "Billion", "Billionen"],
  [10n ** 9n, "Milliarde", "Milliarden"],
  [10n ** 6n, "Million", "Millionen"],
];

/**
 * A number below one million as the first part of a compound: "ein"
 * rather than "eins" at the end ("einundzwanzigtausend").
 * @param {bigint} n - 1 to 999,999
 * @returns {string}
 */
const prefixWords = (n) => cardinalBelowMillion(n).replace(/eins$/, "ein");

/**
 * German cardinal words below one million.
 * @param {bigint} n - Non-negative
 * @returns {string}
 */
function cardinalBelowMillion(n) {
  if (n < 20n) return ONES[Number(n)];
  if (n < 100n) {
    const units = n % 10n;
    const tens = TENS[Number(n / 10n)];
    return units ? `${prefixWords(units)}und${tens}` : tens;
  }
  if (n < 1000n) {
    const rest = n % 100n;
    return `${prefixWords(n / 100n)}hundert${rest ? cardinalBelowMillion(rest) : ""}`;
  }
  const rest = n % 1000n;
  return `${prefixWords(n / 1000n)}tausend${rest ? cardinalBelowMillion(rest) : ""}`;
}

/**
 * German cardinal words, e.g. "einhundertvierunddreißig".
 * @param {bigint} n - Non-negative
 * @returns {string}
 */
export function germanCardinal(n) {
  const scale = SCALES.find(([size]) => n >= size);
  if (!scale) return cardinalBelowMillion(n);
  const [size, one, many] = scale;
  const count = n / size;
  const rest = n % size;
  const head =
    count === 1n ? `eine ${one}` : `${germanCardinal(count)} ${many}`;
  return rest ? `${head} ${germanCardinal(rest)}` : head;
}

/** Ordinal stems of the numbers whose ordinal is irregular. */
const IRREGULAR = { 1: "erst", 3: "dritt", 7: "siebt", 8: "acht" };

/**
 * German ordinal words, e.g. "dritte", "zehnter", "zwanzigsten".
 * @param {bigint} n - Non-negative
 * @param {string} [form] - "-er", "-es"...: the ending (default "e");
 *   other forms (such as "%spellout-ordinal") take the default
 * @returns {string}
 */
export function germanOrdinal(n, form = "") {
  const ending = form.startsWith("-") ? form.slice(1) : "e";
  const last = n % 100n;
  if (last === 0n || last >= 20n || n >= 10n ** 6n) {
    return `${germanCardinal(n)}st${ending}`;
  }
  const head = n === last ? "" : germanCardinal(n - last);
  const stem = IRREGULAR[Number(last)] ?? `${ONES[Number(last)]}t`;
  return `${head}${stem}${ending}`;
}
