/**
 * Variables evaluated on first use: an entry of the variable environment
 * (see xpath/eval/scope.js) whose `value` is computed when it is first
 * read, so that a variable that is never used never fails, and a
 * circular definition is reported (XTDE0640).
 *
 * @module @tradik/xslt3/xslt/runtime/lazy
 */

import { xsltError } from "../names.js";

const PENDING = 0;
const RUNNING = 1;
const DONE = 2;

/** An environment entry computed on first use. */
export class LazyEntry {
  /**
   * @param {object|null} next - The enclosing entries
   * @param {() => Array} compute - Computes the value
   * @param {string} name - Variable name, for the circularity error
   */
  constructor(next, compute, name) {
    this.next = next;
    this.compute = compute;
    this.name = name;
    this.state = PENDING;
    this.cached = undefined;
  }

  /** @returns {Array} the value, computed once */
  get value() {
    if (this.state === DONE) return this.cached;
    if (this.state === RUNNING) {
      throw xsltError("XTDE0640", `Circular definition of $${this.name}`);
    }
    this.state = RUNNING;
    try {
      this.cached = this.compute();
    } catch (error) {
      this.state = PENDING;
      throw error;
    }
    this.state = DONE;
    this.compute = null;
    return this.cached;
  }
}
