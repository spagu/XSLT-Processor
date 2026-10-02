/**
 * fn:parse-ietf-date (F&O 3.1 section 9.9.1): the date formats of HTTP
 * (RFC 822/1123, RFC 850 and asctime) to xs:dateTime, case-insensitive,
 * with the liberal grammar of the specification.
 *
 * @module @tradik/xslt3/functions/parseIetfDate
 */

import { XPathError } from "../errors.js";
import { fromLexical } from "../xdm/lexical.js";
import { define } from "./support.js";

const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const ZONES = {
  ut: 0,
  utc: 0,
  gmt: 0,
  est: -5,
  edt: -4,
  cst: -6,
  cdt: -5,
  mst: -7,
  mdt: -6,
  pst: -8,
  pdt: -7,
};

const S = "[\\t\\n\\r ]+";
const DAY_NAME =
  "(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)";
const MONTH = `(${MONTHS.join("|")})`;
const DSEP = `(?:${S}|(?:${S})?-(?:${S})?)`;
const TZ_NAME = "(?:utc|ut|gmt|est|edt|cst|cdt|mst|mdt|pst|pdt)";
const TZ_OFFSET = `([+-])(\\d\\d?:(?:\\d\\d)?|\\d{1,4})(?:(?:${S})?\\((?:${S})?${TZ_NAME}(?:${S})?\\))?`;
const TIME = `(\\d\\d?):(\\d\\d)(?::(\\d\\d(?:\\.\\d+)?))?(?:(?:${S})?(?:(${TZ_NAME})|${TZ_OFFSET}))?`;
const YEAR = "(\\d\\d(?:\\d\\d)?)";
const DATE_SPEC = `(\\d\\d?)${DSEP}${MONTH}${DSEP}${YEAR}${S}${TIME}`;
const ASC_TIME = `${MONTH}${DSEP}(\\d\\d?)${S}${TIME}${S}${YEAR}`;
const INPUT = new RegExp(
  `^(?:${S})?(?:${DAY_NAME},?${S})?(?:${DATE_SPEC}|${ASC_TIME})(?:${S})?$`,
  "i",
);

/** @param {string|number} n @param {number} width @returns {string} */
const pad = (n, width) => String(n).padStart(width, "0");

/**
 * The timezone of a parsed date: offset, else zone name, else UTC.
 * @param {string|undefined} name
 * @param {string|undefined} sign
 * @param {string|undefined} offset - "H", "HH", "HMM", "HHMM" or "H:MM"
 * @returns {string} "Z" or "+HH:MM"
 */
function timezone(name, sign, offset) {
  if (offset !== undefined) {
    const [hours, minutes = "00"] = offset.includes(":")
      ? offset.split(":")
      : offset.length > 2
        ? [offset.slice(0, -2), offset.slice(-2)]
        : [offset];
    return `${sign}${pad(hours, 2)}:${pad(minutes || "00", 2)}`;
  }
  const hours = ZONES[name?.toLowerCase()] ?? 0;
  return hours === 0 ? "Z" : `-${pad(-hours, 2)}:00`;
}

/**
 * Parses an IETF date.
 * @param {string} text
 * @returns {import("../xdm/atomic.js").AtomicValue} an xs:dateTime
 * @throws {XPathError} FORG0010 when the text does not match the grammar
 *   or is not a valid date and time
 */
export function parseIetfDate(text) {
  const match = INPUT.exec(text);
  if (!match) throw new XPathError("FORG0010", `Invalid IETF date "${text}"`);
  // groups: datespec 1-9 (day, month, year, time 6), asctime 10-18
  // (month, day, time 6, year)
  const spec = match[1] !== undefined;
  const g = spec ? match.slice(1, 10) : match.slice(10, 19);
  const [day, month, year] = spec ? g : [g[1], g[0], g[8]];
  const [hours, minutes, seconds = "00", name, sign, offset] = spec
    ? g.slice(3, 9)
    : g.slice(2, 8);
  const fullYear = year.length === 2 ? `19${year}` : year;
  const lexical =
    `${fullYear}-${pad(MONTHS.indexOf(month.toLowerCase()) + 1, 2)}-` +
    `${pad(day, 2)}T${pad(hours, 2)}:${minutes}:${pad(seconds, 2)}` +
    timezone(name, sign, offset);
  try {
    return fromLexical("xs:dateTime", lexical);
  } catch (error) {
    throw new XPathError("FORG0010", `Invalid IETF date "${text}"`, {
      cause: error,
    });
  }
}

/** Function definitions. */
export const parseIetfDateFunctions = [
  define("parse-ietf-date", ["xs:string?"], "xs:dateTime?", ([value]) =>
    value.length ? [parseIetfDate(value[0].value)] : [],
  ),
];
