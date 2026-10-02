/**
 * The fractional seconds component [f] of the format-dateTime family
 * (F&O 3.1 section 9.8.4.5): the digit pattern is applied to the reversed
 * fraction digits, so grouping separators count from the decimal point,
 * and excess digits are truncated, not rounded.
 *
 * @module @tradik/xslt3/functions/format/fractionFormat
 */

import { formatDigits, parseDigitPattern, zeroOf } from "./digitPattern.js";

const isDigit = (c) => /^\p{Nd}$/u.test(c);
const reverse = (s) => Array.from(s).reverse().join("");

/**
 * Applies the width modifier to a fractional seconds picture.
 * @param {string[]} chars - Characters of the picture
 * @param {number|null} minWidth
 * @param {number|null} maxWidth
 * @returns {string[]}
 */
function widen(chars, minWidth, maxWidth) {
  const zero = String.fromCodePoint(zeroOf(chars.find(isDigit)));
  const result = [...chars];
  let mandatory = result.filter(isDigit).length;
  for (let i = 0; i < result.length && mandatory < (minWidth ?? 0); i++) {
    if (result[i] === "#") {
      result[i] = zero;
      mandatory++;
    }
  }
  while (mandatory < (minWidth ?? 0)) {
    result.push(zero);
    mandatory++;
  }
  if (maxWidth !== null) {
    let signs = result.filter((c) => c === "#" || isDigit(c)).length;
    for (; signs < maxWidth; signs++) result.push("#");
  }
  return result;
}

/**
 * Formats fractional seconds.
 * @param {import("../../xdm/decimal.js").Decimal} second - Seconds value
 * @param {import("./datePicture.js").Marker} marker - Component f
 * @returns {string}
 */
export function formatFraction(second, marker) {
  const { minWidth, maxWidth } = marker;
  const token = Array.from(marker.first ?? "").some(isDigit)
    ? marker.first
    : "1";
  const digits = (second.toString().split(".")[1] ?? "").replace(/0+$/, "");
  const chars = Array.from(token);
  if (maxWidth === null && chars.length === 1) {
    // a single digit keeps all the digits of the value
    const zero = zeroOf(token);
    return (digits || "0")
      .padEnd(minWidth ?? 1, "0")
      .replace(/[0-9]/g, (d) => String.fromCodePoint(zero + Number(d)));
  }
  const pattern = parseDigitPattern(
    reverse(widen(chars, minWidth, maxWidth).join("")),
  );
  const out = Array.from(
    reverse(formatDigits(BigInt(reverse(digits) || "0"), pattern)),
  );
  const zero = String.fromCodePoint(pattern.zero);
  let count = out.filter(isDigit).length;
  while (
    count > pattern.digits ||
    (count > pattern.mandatory && out.at(-1) === zero)
  ) {
    out.pop();
    count--;
    while (!isDigit(out.at(-1))) out.pop();
  }
  return out.join("");
}
