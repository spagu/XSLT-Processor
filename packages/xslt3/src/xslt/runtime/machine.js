/**
 * The explicit work stack that runs sequence constructors.
 *
 * Template rules nest as deep as the documents and recursions they
 * process. Instantiating each level with JavaScript recursion costs
 * several native frames per level and exhausts the call stack long before
 * 10,000 levels, so instructions whose content comes last (the content of
 * literal result elements, xsl:if, xsl:choose, template invocations, the
 * iterations of xsl:for-each and xsl:apply-templates) push a frame and
 * return; the driver runs the frame before the next instruction of the
 * frame below. Instructions that need a result at once (variables,
 * attributes, parameters, function calls) run a nested driver.
 *
 * @module @tradik/xslt3/xslt/runtime/machine
 */

import { xsltError } from "../names.js";

/**
 * A compiled sequence constructor: steps that are instructions
 * `(xc, out, machine) => void` or variable bindings `{binding}`.
 * @typedef {Array<Function|{binding: Function}>} Body
 */

/** Runs the steps of a body with a context and a receiver. */
export class BodyFrame {
  /**
   * @param {Body} body
   * @param {object} xc - XSLT context
   * @param {object} out - Receiver
   */
  constructor(body, xc, out) {
    this.body = body;
    this.index = 0;
    this.xc = xc;
    this.out = out;
  }

  /**
   * Runs steps until one pushes a frame or none is left.
   * @param {Machine} machine
   * @returns {boolean} false when the body is done
   */
  advance(machine) {
    const body = this.body;
    const frames = machine.frames;
    const height = frames.length;
    while (this.index < body.length) {
      const step = body[this.index++];
      if (step.binding) this.xc = step.binding(this.xc, machine);
      else step(this.xc, this.out, machine);
      if (frames.length !== height) return true;
    }
    return false;
  }
}

/** Visits the items of a sequence one after the other. */
export class LoopFrame {
  /**
   * @param {number} count
   * @param {(index: number, machine: Machine) => void} visit - May push
   *   frames, which run before the next visit
   */
  constructor(count, visit) {
    this.count = count;
    this.index = 0;
    this.visit = visit;
  }

  /**
   * @param {Machine} machine
   * @returns {boolean} false when every item is visited
   */
  advance(machine) {
    const frames = machine.frames;
    const height = frames.length;
    while (this.index < this.count) {
      this.visit(this.index++, machine);
      if (frames.length !== height) return true;
    }
    return false;
  }
}

/** The work stack of a transformation. */
export class Machine {
  /** @param {number} [maxDepth] - Deepest stack allowed */
  constructor(maxDepth = 1e6) {
    this.frames = [];
    this.maxDepth = maxDepth;
  }

  /**
   * Schedules a frame: it runs before the next step of the current one.
   * @param {BodyFrame|LoopFrame} frame
   */
  push(frame) {
    if (this.frames.length >= this.maxDepth) {
      throw xsltError(
        "XTDE0000",
        "Too deep recursion: the stylesheet probably loops",
      );
    }
    this.frames.push(frame);
  }

  /**
   * Runs a frame and everything it schedules to completion.
   * @param {BodyFrame|LoopFrame} frame
   */
  run(frame) {
    const frames = this.frames;
    const base = frames.length;
    this.push(frame);
    try {
      while (frames.length > base) {
        if (!frames[frames.length - 1].advance(this)) frames.pop();
      }
    } catch (error) {
      frames.length = base;
      throw error;
    }
  }

  /**
   * Runs a body to completion.
   * @param {Body} body
   * @param {object} xc
   * @param {object} out
   */
  runBody(body, xc, out) {
    if (body.length > 0) this.run(new BodyFrame(body, xc, out));
  }
}
