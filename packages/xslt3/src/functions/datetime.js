/**
 * Functions on durations, dates and times (F&O 3.1 sections 8.3, 9.3 to
 * 9.5, and the context functions of 16.1): component extraction,
 * fn:dateTime, timezone adjustment, current-dateTime/date/time and
 * implicit-timezone.
 *
 * @module @tradik/xslt3/functions/datetime
 */

import { XPathError } from "../errors.js";
import { AtomicValue } from "../xdm/atomic.js";
import { componentsOf, DateTimeValue } from "../xdm/datetime.js";
import { Decimal } from "../xdm/decimal.js";
import { DurationValue } from "../xdm/duration.js";
import { fromLocalSeconds, localSeconds } from "../xdm/timeline.js";
import { types } from "../xdm/types.js";
import { decimalItem, define, integerItem } from "./support.js";

/** @param {number} minutes @returns {AtomicValue} an xs:dayTimeDuration */
export const timezoneDuration = (minutes) =>
  new AtomicValue(
    types.dayTimeDuration,
    new DurationValue(0, Decimal.of(BigInt(minutes * 60))),
  );

/**
 * Replaces the timezone of a date/time value, adjusting the local value
 * when it had one (F&O 3.1 section 9.5).
 * @param {AtomicValue} item - xs:dateTime, xs:date or xs:time
 * @param {number|null} timezone - Minutes, null to remove the timezone
 * @returns {AtomicValue}
 */
export function adjustToTimezone(item, timezone) {
  const kind = item.type.primitive.localName;
  const { value } = item;
  let local = value;
  if (value.timezone !== null && timezone !== null) {
    const shift = Decimal.of(BigInt((timezone - value.timezone) * 60));
    local = fromLocalSeconds(localSeconds(value).add(shift), timezone);
  }
  const fields = { timezone };
  for (const name of componentsOf(kind)) fields[name] = local[name];
  return new AtomicValue(types[kind], new DateTimeValue(fields));
}

/**
 * The timezone argument of the adjust functions in minutes.
 * @param {Array<AtomicValue>|undefined} sequence - Undefined: the implicit
 *   timezone; empty: no timezone
 * @param {object} context
 * @returns {number|null}
 * @throws {XPathError} FODT0003 for an invalid timezone
 */
function timezoneArg(sequence, context) {
  if (sequence === undefined) return context.implicitTimezone ?? 0;
  if (sequence.length === 0) return null;
  const seconds = sequence[0].value.seconds;
  const minutes = seconds.div(Decimal.of(60n));
  if (!minutes.isInteger() || Math.abs(minutes.toNumber()) > 14 * 60) {
    throw new XPathError("FODT0003", `Invalid timezone ${seconds}S`);
  }
  return minutes.toNumber();
}

/**
 * Declares a function of one optional argument returning one optional
 * value.
 * @param {string} local
 * @param {string} param
 * @param {string} returns
 * @param {(value: *) => AtomicValue|null} extract
 * @returns {import("./support.js").FunctionDefinition}
 */
const accessor = (local, param, returns, extract) =>
  define(local, [`${param}?`], `${returns}?`, ([arg]) => {
    const result = arg.length === 0 ? null : extract(arg[0].value);
    return result === null ? [] : [result];
  });

const component = (name) => (value) =>
  name === "second" ? decimalItem(value.second) : integerItem(value[name]);
const timezoneOf = (value) =>
  value.timezone === null ? null : timezoneDuration(value.timezone);

/** Component accessors by type: [type name, [function suffix, component]] */
const extractors = [
  ["dateTime", ["year", "month", "day", "hours", "minutes", "seconds"]],
  ["date", ["year", "month", "day"]],
  ["time", ["hours", "minutes", "seconds"]],
];
const componentNames = {
  year: "year",
  month: "month",
  day: "day",
  hours: "hour",
  minutes: "minute",
  seconds: "second",
};

const DAY = 86400n;
/** Duration component extractors on (months, whole seconds, seconds). */
const durationParts = {
  years: (d) => integerItem(Math.trunc(d.months / 12)),
  months: (d) => integerItem(d.months % 12),
  days: (d) => integerItem(d.seconds.trunc() / DAY),
  hours: (d) => integerItem((d.seconds.trunc() / 3600n) % 24n),
  minutes: (d) => integerItem((d.seconds.trunc() / 60n) % 60n),
  seconds: (d) => decimalItem(d.seconds.mod(Decimal.of(60n))),
};

/**
 * The current date/time from the context, with the implicit timezone when
 * it has none, projected on a type.
 * @param {object} context
 * @param {string} kind - "dateTime", "date" or "time"
 * @returns {AtomicValue}
 */
function current(context, kind) {
  const now = context.currentDateTime;
  const fields = { timezone: now.timezone ?? context.implicitTimezone ?? 0 };
  for (const name of componentsOf(kind)) fields[name] = now[name];
  const type = kind === "dateTime" ? types.dateTimeStamp : types[kind];
  return new AtomicValue(type, new DateTimeValue(fields));
}

/**
 * fn:dateTime.
 * @param {Array<AtomicValue>[]} args - [$date, $time]
 * @returns {Array<AtomicValue>}
 */
function dateTime([date, time]) {
  if (date.length === 0 || time.length === 0) return [];
  const d = date[0].value;
  const t = time[0].value;
  if (d.timezone !== null && t.timezone !== null && d.timezone !== t.timezone) {
    throw new XPathError("FORG0008", "The date and time timezones differ");
  }
  const value = new DateTimeValue({
    ...t,
    year: d.year,
    month: d.month,
    day: d.day,
    timezone: d.timezone ?? t.timezone,
  });
  return [new AtomicValue(types.dateTime, value)];
}

/** @type {import("./support.js").FunctionDefinition[]} */
export const dateTimeFunctions = [
  ...extractors.flatMap(([type, parts]) => [
    ...parts.map((part) =>
      accessor(
        `${part}-from-${type}`,
        `xs:${type}`,
        part === "seconds" ? "xs:decimal" : "xs:integer",
        component(componentNames[part]),
      ),
    ),
    accessor(
      `timezone-from-${type}`,
      `xs:${type}`,
      "xs:dayTimeDuration",
      timezoneOf,
    ),
  ]),
  ...Object.entries(durationParts).map(([part, extract]) =>
    accessor(
      `${part}-from-duration`,
      "xs:duration",
      part === "seconds" ? "xs:decimal" : "xs:integer",
      extract,
    ),
  ),
  define("dateTime", ["xs:date?", "xs:time?"], "xs:dateTime?", dateTime),
  ...["dateTime", "date", "time"].flatMap((type) => {
    const impl = ([arg, timezone], context) =>
      arg.length === 0
        ? []
        : [adjustToTimezone(arg[0], timezoneArg(timezone, context))];
    const local = `adjust-${type}-to-timezone`;
    return [
      define(local, [`xs:${type}?`], `xs:${type}?`, impl),
      define(
        local,
        [`xs:${type}?`, "xs:dayTimeDuration?"],
        `xs:${type}?`,
        impl,
      ),
    ];
  }),
  define("current-dateTime", [], "xs:dateTimeStamp", (_a, context) => [
    current(context, "dateTime"),
  ]),
  define("current-date", [], "xs:date", (_a, context) => [
    current(context, "date"),
  ]),
  define("current-time", [], "xs:time", (_a, context) => [
    current(context, "time"),
  ]),
  define("implicit-timezone", [], "xs:dayTimeDuration", (_a, context) => [
    timezoneDuration(context.implicitTimezone ?? 0),
  ]),
];
