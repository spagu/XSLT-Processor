/**
 * The languages numbers are written in by format-integer, the format-date
 * family and xsl:number: words (cardinal and ordinal) and the ordinal mark
 * of digits. A language is chosen by the primary subtag of its tag
 * ("de-AT" is "de"); others are English. Add a language by adding an
 * entry to {@link NUMBER_LANGUAGES}.
 *
 * @module @tradik/xslt3/functions/format/numberLanguages
 */

import { germanCardinal, germanOrdinal } from "./germanWords.js";
import { cardinalWords, ordinalSuffix, ordinalWords } from "./numberWords.js";

/**
 * How a language writes numbers.
 * @typedef {object} NumberLanguage
 * @property {(n: bigint) => string} cardinal - Lower-case words
 * @property {(n: bigint, form: string) => string} ordinal - Lower-case
 *   words; `form` is the text in parentheses of the "o" modifier, or the
 *   ordinal attribute of xsl:number ("-er", "%spellout-ordinal"...)
 * @property {(n: bigint) => string} suffix - Mark after ordinal digits
 */

/** @type {Readonly<Record<string, NumberLanguage>>} */
export const NUMBER_LANGUAGES = Object.freeze({
  en: { cardinal: cardinalWords, ordinal: ordinalWords, suffix: ordinalSuffix },
  de: { cardinal: germanCardinal, ordinal: germanOrdinal, suffix: () => "." },
});

/**
 * The number language of a language tag.
 * @param {string|null} [tag] - e.g. "de", "en-GB"; English when absent
 *   or not supported
 * @returns {NumberLanguage}
 */
export function numberLanguage(tag) {
  const primary = (tag ?? "").trim().toLowerCase().split("-")[0];
  return Object.hasOwn(NUMBER_LANGUAGES, primary)
    ? NUMBER_LANGUAGES[primary]
    : NUMBER_LANGUAGES.en;
}
