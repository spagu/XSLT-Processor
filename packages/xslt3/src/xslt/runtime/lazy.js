/**
 * Variables evaluated on first use: an entry of the variable environment
 * (see xpath/eval/scope.js) whose `value` is computed when it is first
 * read, so that a variable that is never used never fails, and a
 * circular definition is reported (XTDE0640).
 *
 * An xsl:try does not catch the errors of variables declared outside it
 * (XSLT 3.0 section 8.3), although they are computed when first read
 * inside: each xsl:try marks the pending entries of its environment, and
 * the error of a marked entry names the xsl:try instances it escapes.
 *
 * @module @tradik/xslt3/xslt/runtime/lazy
 */

import { displayName, xsltError } from "../names.js";

const PENDING = 0;
const RUNNING = 1;
const DONE = 2;

/** Marker of the global variables: outside every xsl:try. */
export const EVERY_TRY = Symbol("every xsl:try");

/** The marks of every global variable. */
const GLOBAL = Object.freeze(new Set([EVERY_TRY]));

/**
 * Marks the variables of an environment that are not computed yet as
 * declared outside an xsl:try about to run.
 * @param {object|null} env - The environment of the xsl:try
 * @param {object|null} globalEnv - Where the global variables start
 * @param {object} marker - Identifies this run of the xsl:try
 */
export function markOutside(env, globalEnv, marker) {
  for (let entry = env; entry && entry !== globalEnv; entry = entry.next) {
    if (entry instanceof LazyEntry && entry.state !== DONE) {
      entry.outside ??= new Set();
      entry.outside.add(marker);
    }
  }
}

/**
 * Whether an error escapes a run of xsl:try (raised by a variable
 * declared outside it).
 * @param {*} error
 * @param {object} marker - The run of the xsl:try
 * @returns {boolean}
 */
export const escapesTry = (error, marker) =>
  Boolean(error?.outsideTry?.has(EVERY_TRY) || error?.outsideTry?.has(marker));

/** An environment entry computed on first use. */
export class LazyEntry {
  /**
   * @param {object|null} next - The enclosing entries
   * @param {() => Array} compute - Computes the value
   * @param {string} name - Variable name, for the circularity error
   * @param {boolean} [global] - A global variable (outside every xsl:try)
   */
  constructor(next, compute, name, global = false) {
    this.next = next;
    this.compute = compute;
    this.name = name;
    /** @type {Set<object|symbol>|null} the xsl:try runs it is outside of */
    this.outside = global ? GLOBAL : null;
    this.state = PENDING;
    this.cached = undefined;
  }

  /** @returns {Array} the value, computed once */
  get value() {
    if (this.state === DONE) return this.cached;
    if (this.state === RUNNING) {
      throw xsltError(
        "XTDE0640",
        `Circular definition of $${displayName(this.name)}`,
      );
    }
    this.state = RUNNING;
    try {
      this.cached = this.compute();
    } catch (error) {
      this.state = PENDING;
      if (this.outside && error instanceof Error) {
        error.outsideTry = new Set([
          ...(error.outsideTry ?? []),
          ...this.outside,
        ]);
      }
      throw error;
    }
    this.state = DONE;
    this.compute = null;
    return this.cached;
  }
}
