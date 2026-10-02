/**
 * Functions on the dynamic context (F&O 3.1 section 15): the current date
 * and time, the implicit timezone, the default collation and language,
 * the static base URI. No environment variables are exposed to
 * expressions (the set is implementation-dependent, and empty here).
 *
 * @module @tradik/xslt3/functions/context
 */

import { AtomicValue } from "../xdm/atomic.js";
import { DateTimeValue } from "../xdm/datetime.js";
import { Decimal } from "../xdm/decimal.js";
import { DurationValue } from "../xdm/duration.js";
import { types } from "../xdm/types.js";

/**
 * The current date/time projected onto some components.
 * @param {DateTimeValue} now
 * @param {string[]} components
 * @returns {DateTimeValue}
 */
function project(now, components) {
  const fields = { timezone: now.timezone };
  for (const name of components) fields[name] = now[name];
  return new DateTimeValue(fields);
}

/**
 * Definition of a function of the context without parameters.
 * @param {string} local
 * @param {string} returns
 * @param {(context: object) => Array} impl
 * @returns {object}
 */
const contextFunction = (local, returns, impl) => ({
  local,
  params: [],
  returns,
  impl: (_, context) => impl(context),
});

/** Function definitions. */
export const contextFunctions = [
  contextFunction("current-dateTime", "xs:dateTimeStamp", (c) => [
    new AtomicValue(types.dateTime, c.currentDateTime),
  ]),
  contextFunction("current-date", "xs:date", (c) => [
    new AtomicValue(
      types.date,
      project(c.currentDateTime, ["year", "month", "day"]),
    ),
  ]),
  contextFunction("current-time", "xs:time", (c) => [
    new AtomicValue(
      types.time,
      project(c.currentDateTime, ["hour", "minute", "second"]),
    ),
  ]),
  contextFunction("implicit-timezone", "xs:dayTimeDuration", (c) => [
    new AtomicValue(
      types.dayTimeDuration,
      new DurationValue(0, Decimal.of(BigInt(c.implicitTimezone * 60))),
    ),
  ]),
  contextFunction("default-collation", "xs:string", (c) => [
    new AtomicValue(types.string, c.defaultCollation),
  ]),
  contextFunction("default-language", "xs:language", (c) => [
    new AtomicValue(types.language, c.defaultLanguage),
  ]),
  contextFunction("available-environment-variables", "xs:string*", () => []),
  {
    local: "environment-variable",
    params: ["xs:string"],
    returns: "xs:string?",
    impl: () => [],
  },
  contextFunction("static-base-uri", "xs:anyURI?", (c) =>
    c.staticBaseUri === undefined
      ? []
      : [new AtomicValue(types.anyURI, c.staticBaseUri)],
  ),
];
