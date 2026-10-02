/**
 * Arithmetic on durations, dates and times (F&O 3.1 sections 8.2 and
 * 10.8): duration ± duration, duration × / div number, duration div
 * duration, date/time ± duration and date/time − date/time.
 *
 * @module @tradik/xslt3/xdm/temporalArithmetic
 */

import { XPathError } from "../errors.js";
import { AtomicValue } from "./atomic.js";
import { daysInMonth } from "./calendar.js";
import { checkYear, componentsOf, DateTimeValue } from "./datetime.js";
import { fromLocalSeconds, localSeconds, timelineSeconds } from "./timeline.js";
import { Decimal } from "./decimal.js";
import { DurationValue } from "./duration.js";
import { numberToDecimal } from "./numeric.js";
import { derivesFrom, isNumericType, types } from "./types.js";

const HALF = Decimal.parse("0.5");
const ONE_DAY = Decimal.of(86400n);
/** Local seconds of midnight of the reference date of xs:time values. */
const REFERENCE_DAY = localSeconds(new DateTimeValue({}));

/**
 * Operand category for the operator mapping.
 * @param {AtomicValue} item
 * @returns {string|null} "yearMonth", "dayTime", "dateTime", "date",
 *   "time", "numeric" or null
 */
function category(item) {
  if (derivesFrom(item.type, types.yearMonthDuration)) return "yearMonth";
  if (derivesFrom(item.type, types.dayTimeDuration)) return "dayTime";
  if (isNumericType(item.type)) return "numeric";
  const primitive = item.type.primitive.localName;
  return ["dateTime", "date", "time"].includes(primitive) ? primitive : null;
}

/**
 * @param {"yearMonth"|"dayTime"} kind
 * @param {Decimal} amount - Months (integral) or seconds
 * @returns {AtomicValue}
 */
function duration(kind, amount) {
  return kind === "yearMonth"
    ? new AtomicValue(
        types.yearMonthDuration,
        new DurationValue(amount.toNumber(), Decimal.ZERO),
      )
    : new AtomicValue(types.dayTimeDuration, new DurationValue(0, amount));
}

/** @param {AtomicValue} item @param {string} kind @returns {Decimal} */
const amountOf = (item, kind) =>
  kind === "yearMonth"
    ? Decimal.of(BigInt(item.value.months))
    : item.value.seconds;

/**
 * Numeric operand of duration × and div as an exact decimal.
 * @param {AtomicValue} item
 * @param {boolean} divide - Whether it is a divisor
 * @returns {Decimal|null} null for an infinite divisor (result zero)
 */
function factor(item, divide) {
  const { value } = item;
  if (typeof value === "bigint") return Decimal.of(value);
  if (value instanceof Decimal) return value;
  if (Number.isNaN(value)) {
    throw new XPathError("FOCA0005", "NaN in duration arithmetic");
  }
  if (!Number.isFinite(value)) {
    if (divide) return null;
    throw new XPathError("FODT0002", "Duration overflow");
  }
  return numberToDecimal(value);
}

/** Months rounded half toward positive infinity (F&O 8.2.3). */
const roundMonths = (amount) => Decimal.of(amount.add(HALF).floor());

/** duration × number and duration div number. */
function scaleDuration(item, kind, op, number) {
  const n = factor(number, op === "div");
  if (n === null) return duration(kind, Decimal.ZERO);
  if (op === "div" && n.sign() === 0) {
    throw new XPathError("FODT0002", "Duration division by zero");
  }
  const amount =
    op === "div" ? amountOf(item, kind).div(n) : amountOf(item, kind).mul(n);
  return duration(kind, kind === "yearMonth" ? roundMonths(amount) : amount);
}

/**
 * Adds a duration (signed) to a date, time or dateTime.
 * @param {AtomicValue} item - xs:dateTime, xs:date or xs:time
 * @param {string} kind - Its category
 * @param {DurationValue} delta
 * @returns {AtomicValue}
 */
function addToDateTime(item, kind, delta) {
  let value = item.value;
  if (delta.months !== 0) {
    const total = value.year * 12 + (value.month - 1) + delta.months;
    const year = checkYear(Math.floor(total / 12));
    const month = total - year * 12 + 1;
    const day = Math.min(value.day, daysInMonth(year, month));
    value = new DateTimeValue({ ...value, year, month, day });
  }
  let seconds = localSeconds(value).add(delta.seconds);
  if (kind === "time") {
    // wrap around midnight: seconds of the day modulo 86400
    seconds = seconds.sub(REFERENCE_DAY).mod(ONE_DAY);
    if (seconds.sign() < 0) seconds = seconds.add(ONE_DAY);
  }
  const result = fromLocalSeconds(seconds, value.timezone);
  const fields = { timezone: value.timezone };
  for (const name of componentsOf(kind)) fields[name] = result[name];
  return new AtomicValue(types[kind], new DateTimeValue(fields));
}

/**
 * Applies a date/time or duration operator (appendix B.2 mapping).
 * @param {AtomicValue} a - Already prepared (no xs:untypedAtomic)
 * @param {string} op
 * @param {AtomicValue} b
 * @param {{implicitTimezone?: number}} options
 * @returns {AtomicValue}
 * @throws {XPathError} XPTY0004 when no operator matches the types
 */
export function temporalArithmetic(a, op, b, options) {
  const ka = category(a);
  const kb = category(b);
  const durations = ["yearMonth", "dayTime"];
  const times = ["dateTime", "date", "time"];
  const sameDuration = ka === kb && durations.includes(ka);
  if (sameDuration && (op === "+" || op === "-")) {
    const delta = op === "+" ? amountOf(b, kb) : amountOf(b, kb).neg();
    return duration(ka, amountOf(a, ka).add(delta));
  }
  if (sameDuration && op === "div") {
    if (amountOf(b, kb).sign() === 0) {
      throw new XPathError("FOAR0001", "Duration division by zero");
    }
    return new AtomicValue(types.decimal, amountOf(a, ka).div(amountOf(b, kb)));
  }
  if (
    durations.includes(ka) &&
    kb === "numeric" &&
    (op === "*" || op === "div")
  ) {
    return scaleDuration(a, ka, op, b);
  }
  if (ka === "numeric" && durations.includes(kb) && op === "*") {
    return scaleDuration(b, kb, op, a);
  }
  const timeOk = (t, d) =>
    times.includes(t) &&
    durations.includes(d) &&
    !(t === "time" && d === "yearMonth");
  if (timeOk(ka, kb) && (op === "+" || op === "-")) {
    const { months, seconds } = b.value;
    const delta =
      op === "+" ? b.value : new DurationValue(-months, seconds.neg());
    return addToDateTime(a, ka, delta);
  }
  if (timeOk(kb, ka) && op === "+") return addToDateTime(b, kb, a.value);
  if (ka === kb && times.includes(ka) && op === "-") {
    const timezone = options.implicitTimezone ?? 0;
    return duration(
      "dayTime",
      timelineSeconds(a.value, timezone).sub(
        timelineSeconds(b.value, timezone),
      ),
    );
  }
  throw new XPathError(
    "XPTY0004",
    `${op} is not defined for ${a.type.prefixedName} and ${b.type.prefixedName}`,
  );
}
