/**
 * Exact arbitrary-precision decimal numbers for xs:decimal.
 *
 * A value is `unscaled × 10^-scale` with a BigInt `unscaled` and a
 * non-negative integer `scale`. Values are kept normalized (no trailing
 * zero digits in the fraction), so equal numbers have equal fields.
 * No floating point is involved anywhere.
 *
 * @module @tradik/xslt3/xdm/decimal
 */

/**
 * Number of fraction digits kept by {@link Decimal#div} when both operands
 * have fewer: the precision of xs:decimal division (implementation-defined
 * in F&O 3.1 section 4.2). Results are rounded half-down, like Saxon.
 */
export const DIVISION_SCALE = 18;

const lexicalPattern = /^([+-]?)(\d*)(?:\.(\d*))?$/;

/** @param {number} n @returns {bigint} 10^n */
const pow10 = (n) => 10n ** BigInt(n);

/** An immutable exact decimal number. */
export class Decimal {
  /**
   * Use {@link Decimal.of} or {@link Decimal.parse}; the constructor does
   * not normalize.
   * @param {bigint} unscaled
   * @param {number} scale
   */
  constructor(unscaled, scale) {
    this.unscaled = unscaled;
    this.scale = scale;
    Object.freeze(this);
  }

  /**
   * Builds a normalized decimal `unscaled × 10^-scale`.
   * @param {bigint} unscaled
   * @param {number} [scale=0] - May be negative (multiplies by 10^-scale)
   * @returns {Decimal}
   */
  static of(unscaled, scale = 0) {
    if (scale < 0) return new Decimal(unscaled * pow10(-scale), 0);
    while (scale > 0 && unscaled % 10n === 0n) {
      unscaled /= 10n;
      scale--;
    }
    return new Decimal(
      unscaled === 0n ? 0n : unscaled,
      unscaled === 0n ? 0 : scale,
    );
  }

  /**
   * Parses the xs:decimal lexical form `[+-]?(\d+(\.\d*)?|\.\d+)` (no
   * whitespace).
   * @param {string} text
   * @returns {Decimal|null} null when the text is not a decimal literal
   */
  static parse(text) {
    const match = lexicalPattern.exec(text);
    if (!match) return null;
    const [, sign, whole, fraction = ""] = match;
    if (whole === "" && fraction === "") return null;
    const unscaled = BigInt(`${whole}${fraction}`);
    return Decimal.of(sign === "-" ? -unscaled : unscaled, fraction.length);
  }

  /** @returns {number} -1, 0 or 1 */
  sign() {
    return this.unscaled < 0n ? -1 : this.unscaled > 0n ? 1 : 0;
  }

  /** @returns {boolean} true when the value has no fraction part */
  isInteger() {
    return this.scale === 0;
  }

  /** @returns {Decimal} the negated value */
  neg() {
    return new Decimal(-this.unscaled, this.scale);
  }

  /**
   * Both operands as BigInts at a common scale.
   * @param {Decimal} other
   * @returns {[bigint, bigint, number]} [this, other, scale]
   */
  align(other) {
    const scale = Math.max(this.scale, other.scale);
    return [
      this.unscaled * pow10(scale - this.scale),
      other.unscaled * pow10(scale - other.scale),
      scale,
    ];
  }

  /** @param {Decimal} other @returns {Decimal} this + other */
  add(other) {
    const [a, b, scale] = this.align(other);
    return Decimal.of(a + b, scale);
  }

  /** @param {Decimal} other @returns {Decimal} this - other */
  sub(other) {
    return this.add(other.neg());
  }

  /** @param {Decimal} other @returns {Decimal} this × other */
  mul(other) {
    return Decimal.of(this.unscaled * other.unscaled, this.scale + other.scale);
  }

  /**
   * Division to `max(DIVISION_SCALE, this.scale, other.scale)` fraction
   * digits, rounded half-down (ties toward zero). The divisor must not be
   * zero.
   * @param {Decimal} other
   * @returns {Decimal}
   */
  div(other) {
    const scale = Math.max(DIVISION_SCALE, this.scale, other.scale);
    // this / other × 10^scale = (u1 × 10^(scale + s2 - s1)) / u2
    let numerator = this.unscaled;
    const shift = scale + other.scale - this.scale;
    numerator *= pow10(shift);
    let denominator = other.unscaled;
    if (denominator < 0n) {
      numerator = -numerator;
      denominator = -denominator;
    }
    let quotient = numerator / denominator;
    const remainder2 = 2n * (numerator % denominator);
    if (remainder2 > denominator) quotient++;
    else if (-remainder2 > denominator) quotient--;
    return Decimal.of(quotient, scale);
  }

  /**
   * Integer division truncating toward zero; the divisor must not be zero.
   * @param {Decimal} other
   * @returns {bigint}
   */
  idiv(other) {
    const [a, b] = this.align(other);
    return a / b;
  }

  /**
   * Remainder with the sign of the dividend (`a - b × (a idiv b)`).
   * @param {Decimal} other - Non-zero divisor
   * @returns {Decimal}
   */
  mod(other) {
    const [a, b, scale] = this.align(other);
    return Decimal.of(a % b, scale);
  }

  /** @param {Decimal} other @returns {number} -1, 0 or 1 */
  compare(other) {
    const [a, b] = this.align(other);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /** @returns {bigint} the value with the fraction discarded */
  trunc() {
    return this.unscaled / pow10(this.scale);
  }

  /** @returns {bigint} the largest integer not above the value */
  floor() {
    const t = this.trunc();
    return this.unscaled < 0n && this.scale > 0 ? t - 1n : t;
  }

  /** @returns {number} the nearest double (correctly rounded) */
  toNumber() {
    return Number(this.toString());
  }

  /**
   * Canonical lexical form: no "+" sign, no leading zeros, no trailing
   * fraction zeros, no decimal point for integers ("1", "-0.5", "0").
   * @returns {string}
   */
  toString() {
    const negative = this.unscaled < 0n;
    const digits = (negative ? -this.unscaled : this.unscaled).toString();
    const sign = negative ? "-" : "";
    if (this.scale === 0) return sign + digits;
    const padded = digits.padStart(this.scale + 1, "0");
    const point = padded.length - this.scale;
    return `${sign}${padded.slice(0, point)}.${padded.slice(point)}`;
  }
}

/** The decimal zero. */
Decimal.ZERO = Decimal.of(0n);
