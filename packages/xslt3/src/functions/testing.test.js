/**
 * Helpers for the function module tests: building argument sequences from
 * JS values and calling definitions directly (no evaluator).
 */

import assert from "node:assert/strict";
import { it } from "node:test";
import { AtomicValue } from "../xdm/atomic.js";
import { canonicalString, fromLexical } from "../xdm/lexical.js";
import { types } from "../xdm/types.js";
import { FN_NAMESPACE } from "./support.js";

/** Builds an atomic value from its lexical form. */
export const v = (type, text) => fromLexical(`xs:${type}`, String(text));

/**
 * Converts a JS value to an item: string → xs:string, bigint →
 * xs:integer, number → xs:double, boolean → xs:boolean; items pass.
 */
export function item(x) {
  if (typeof x === "string") return new AtomicValue(types.string, x);
  if (typeof x === "bigint") return new AtomicValue(types.integer, x);
  if (typeof x === "number") return new AtomicValue(types.double, x);
  if (typeof x === "boolean") return new AtomicValue(types.boolean, x);
  return x;
}

/** Converts a JS value to a sequence: null → (), array → items. */
export const seq = (x) =>
  x === null ? [] : Array.isArray(x) ? x.map(item) : [item(x)];

/**
 * Calls the definition of `local` whose arity matches the arguments.
 * @param {object[]} defs - Definition array of a module
 * @param {string} local
 * @param {Array<*>} args - JS values, see {@link seq}
 * @param {object} [context]
 * @param {string} [namespace]
 * @returns {Array<*>} the result sequence
 */
export function call(defs, local, args, context = {}, namespace) {
  const def = defs.find(
    (d) =>
      d.local === local &&
      (namespace === undefined || d.namespace === namespace) &&
      (d.params.length === args.length ||
        (d.variadic && args.length >= d.params.length)),
  );
  assert.ok(def, `no definition ${local}#${args.length}`);
  return def.impl(args.map(seq), context);
}

/** Canonical strings of a result sequence. */
export const strings = (sequence) => sequence.map(canonicalString);

/** The canonical string of the single item of a result. */
export const one = (sequence) => {
  assert.equal(sequence.length, 1);
  return canonicalString(sequence[0]);
};

/** Asserts that a function throws an XPathError with a code. */
export const throwsCode = (fn, code) =>
  assert.throws(fn, (error) => error.code === code, `expected ${code}`);

/**
 * Checks that every definition is well formed.
 * @param {object[]} defs
 */
export function checkDefinitions(defs) {
  it("declares well-formed definitions", () => {
    for (const def of defs) {
      assert.equal(typeof def.local, "string");
      assert.ok(Array.isArray(def.params));
      assert.equal(typeof def.returns, "string");
      assert.equal(typeof def.impl, "function");
      assert.ok(def.namespace.startsWith(FN_NAMESPACE));
      assert.ok(Object.isFrozen(def));
    }
  });
}
