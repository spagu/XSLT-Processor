/**
 * The frame that runs xsl:iterate on the work stack (XSLT 3.0 section
 * 7.2): one body per item, pushed after the previous one is done, so a
 * long input sequence costs no JavaScript recursion. Each body sees the
 * iteration state in `xc.iteration`, where xsl:next-iteration leaves the
 * new parameter values and xsl:break marks the end.
 *
 * @module @tradik/xslt3/xslt/runtime/iteration
 */

import { derive } from "./context.js";
import { BodyFrame } from "./machine.js";

/** Runs the iterations of an xsl:iterate, then its xsl:on-completion. */
export class IterateFrame {
  /**
   * @param {object} spec
   * @param {Array} spec.items - The input sequence
   * @param {object[]} spec.params - Compiled xsl:param children
   * @param {import("./machine.js").Body} spec.steps - The body
   * @param {import("./machine.js").Body} spec.completion - xsl:on-completion
   * @param {object} spec.xc - Context of the instruction
   * @param {object} spec.out - Receiver
   */
  constructor({ items, params, steps, completion, xc, out }) {
    this.items = items;
    this.params = params;
    this.steps = steps;
    this.completion = completion;
    this.xc = xc;
    this.out = out;
    this.index = 0;
    /** @type {Array[]|null} the parameter values, computed on the first advance */
    this.values = null;
    this.state = { next: null, broken: false };
    this.done = false;
  }

  /**
   * The initial values of the parameters, each seeing the ones before.
   * @param {import("./machine.js").Machine} machine
   * @returns {Array[]}
   */
  initialValues(machine) {
    const values = [];
    let ctx = this.xc;
    for (const param of this.params) {
      const value = param.value(ctx, machine);
      values.push(value);
      ctx = derive(ctx, { env: { value, next: ctx.env } });
    }
    return values;
  }

  /** Applies the values given by xsl:next-iteration. */
  applyNext() {
    const next = this.state.next;
    if (!next) return;
    this.state.next = null;
    this.params.forEach((param, i) => {
      if (next.has(param.key)) {
        this.values[i] = param.convert(next.get(param.key));
      }
    });
  }

  /**
   * The context of a body: the parameters bound, a focus or none.
   * @param {object} focus - `{item, position, size}`
   * @returns {object}
   */
  context(focus) {
    let env = this.xc.env;
    for (const value of this.values) env = { value, next: env };
    return derive(this.xc, {
      ...focus,
      env,
      rule: null,
      iteration: this.state,
    });
  }

  /**
   * Pushes the next body, or the completion.
   * @param {import("./machine.js").Machine} machine
   * @returns {boolean} false when the iteration is over
   */
  advance(machine) {
    if (this.done || this.state.broken) return false;
    if (this.values === null) this.values = this.initialValues(machine);
    else this.applyNext();
    const size = this.items.length;
    if (this.index < size) {
      const item = this.items[this.index++];
      const xc = this.context({ item, position: this.index, size });
      if (this.steps.length > 0) {
        machine.push(new BodyFrame(this.steps, xc, this.out));
      }
      return true;
    }
    this.done = true;
    if (this.completion.length === 0) return false;
    const xc = this.context({ item: undefined, position: 0, size: 0 });
    machine.push(new BodyFrame(this.completion, xc, this.out));
    return true;
  }
}
