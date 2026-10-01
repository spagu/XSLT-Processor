/**
 * The UCA collation family (F&O 3.1 section 5.3.4) on top of
 * `Intl.Collator`, which the `fallback=yes` default allows: `lang`,
 * `strength`, `numeric`, `caseFirst` and `alternate` are honoured, the
 * quaternary and identical strengths through a tie-break.
 *
 * @module @tradik/xslt3/functions/ucaCollation
 */

import { XPathError } from "../errors.js";
import { compareCodepoints } from "../xdm/strings.js";

/** @typedef {import("./collations.js").Collation} Collation */

const strengths = {
  primary: "base",
  1: "base",
  secondary: "accent",
  2: "accent",
  tertiary: "variant",
  3: "variant",
};

/**
 * UCA parameters that Intl.Collator honours, with their valid values
 * (null: any value).
 */
const SUPPORTED = new Map([
  ["fallback", ["yes", "no"]],
  ["lang", null],
  [
    "strength",
    Object.keys(strengths).concat(["quaternary", "identical", "4", "5"]),
  ],
  ["numeric", ["yes", "no"]],
  ["caseFirst", ["upper", "lower"]],
  ["alternate", ["non-ignorable", "shifted", "blanked"]],
]);

/**
 * Whether a UCA parameter is honoured with this value.
 * @param {string} key
 * @param {string} value
 * @returns {boolean}
 */
function isSupported(key, value) {
  if (!SUPPORTED.has(key)) return false;
  const values = SUPPORTED.get(key);
  return values === null || values.includes(value);
}

/**
 * The comparison of strings that the collator finds equal, for the levels
 * Intl.Collator lacks: at strength identical any difference counts (the
 * NFD forms compared by codepoint, UTS #10 section 4.3); at strength
 * quaternary with alternate=shifted, the ignored variable characters
 * count (with alternate=blanked they stay ignored).
 * @param {string|undefined} strength
 * @param {string|undefined} alternate
 * @param {Intl.Collator} collator
 * @returns {(a: string, b: string) => number}
 */
function tieBreaker(strength, alternate, collator) {
  if (strength === "identical" || strength === "5") {
    return (a, b) => compareCodepoints(a.normalize("NFD"), b.normalize("NFD"));
  }
  if (
    (strength === "quaternary" || strength === "4") &&
    alternate === "shifted"
  ) {
    const { locale, ...options } = collator.resolvedOptions();
    const full = new Intl.Collator(locale, {
      ...options,
      ignorePunctuation: false,
    });
    return (a, b) => Math.sign(full.compare(a, b));
  }
  return () => 0;
}

/**
 * Builds a collation from a UCA collation URI with `Intl.Collator`. Only
 * `lang`, `strength`, `numeric`, `caseFirst` and `alternate` (as
 * ignorePunctuation) are honoured; the others fall back to the defaults.
 * @param {string} uri
 * @returns {Collation}
 * @throws {XPathError} FOCH0002 when `fallback=no` asks for an unsupported
 *   parameter or value
 */
export function ucaCollation(uri) {
  const query = uri.includes("?") ? uri.slice(uri.indexOf("?") + 1) : "";
  const params = new Map(
    query
      .split(";")
      .filter(Boolean)
      .map((pair) => pair.split("=")),
  );
  if (
    params.get("fallback") === "no" &&
    [...params].some(([key, value]) => !isSupported(key, value))
  ) {
    throw new XPathError("FOCH0002", `Unsupported collation ${uri}`);
  }
  const caseFirst = params.get("caseFirst");
  const options = {
    sensitivity: strengths[params.get("strength")] ?? "variant",
    numeric: params.get("numeric") === "yes",
    caseFirst:
      caseFirst === "upper" || caseFirst === "lower" ? caseFirst : "false",
    ignorePunctuation: ["blanked", "shifted"].includes(params.get("alternate")),
  };
  let collator;
  try {
    collator = new Intl.Collator(params.get("lang") || "en", options);
  } catch {
    collator = new Intl.Collator("en", options);
  }
  const strength = params.get("strength");
  const tieBreak = tieBreaker(strength, params.get("alternate"), collator);
  return Object.freeze({
    uri,
    compare: (a, b) => Math.sign(collator.compare(a, b)) || tieBreak(a, b),
    key: null,
    // numeric collation units have no substrings ("10" is one unit)
    substrings: !options.numeric,
  });
}
