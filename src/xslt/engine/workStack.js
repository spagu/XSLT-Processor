/**
 * Explicit work stack for template instantiation.
 *
 * Recursive stylesheets nest template invocations thousands of levels deep
 * (libxslt allows 3000). Instantiating each level with JavaScript recursion
 * costs several native frames per level and overflows the call stack of
 * browsers and Node long before that, so the engine keeps the pending work
 * in frames on an explicit stack instead:
 *
 * - a SequenceFrame walks the children of a stylesheet element (a sequence
 *   constructor: a template body, the content of xsl:if, a literal result
 *   element, ...);
 * - a LoopFrame visits the items of xsl:apply-templates or xsl:for-each.
 *
 * An instruction whose content comes last (xsl:if, xsl:choose,
 * xsl:call-template, literal result elements, ...) schedules that content
 * with {@link workStackMethods.continueWith} and returns; the driver loop
 * runs it before the next sibling of the instruction. The native stack then
 * stays flat however deep the templates nest. Instructions that need the
 * result at once (xsl:attribute, xsl:with-param content, ...) run a nested
 * driver with {@link workStackMethods.runFrame}.
 *
 * Methods installed on XsltEngine.prototype (`this` is the engine).
 */

import { inScopeNamespaces } from "../stylesheetNamespaces.js";

/**
 * Deepest nesting of template instantiations in a transformation, the
 * default of libxslt's `xsltMaxDepth`. Deeper recursion is reported as a
 * potential infinite recursion. Override it with the `maxTemplateDepth`
 * engine option.
 */
export const XSLT_MAX_TEMPLATE_DEPTH = 3000;

/**
 * Pending instantiation of the children of a stylesheet element.
 */
export class SequenceFrame {
  /**
   * A body declaring variables gets its own copy of the local bindings: a
   * variable is visible to its following siblings and their descendants only.
   *
   * @param {object} engine - The engine
   * @param {Element|object} node - The parent stylesheet element
   * @param {XsltContext} context - The current context
   * @param {Node} output - The result node receiving the output
   * @param {(() => void)|null} [onDone] - Called once the children are done
   */
  constructor(engine, node, context, output, onDone = null) {
    this.scope = engine.declaresVariables(node) ? context.clone() : context;
    this.saved = this.scope.namespaces;
    this.next = node.firstChild;
    this.output = output;
    // Not named `then`: an object with a `then` method is treated as a promise
    this.onDone = onDone;
    // Whether the frame is a template instantiation (counted in the depth)
    this.template = false;
  }

  /**
   * Instantiate children until one schedules further frames or none is left.
   *
   * @param {object} engine - The engine
   * @param {object[]} frames - The work stack
   * @returns {boolean} False when every child is done
   */
  advance(engine, frames) {
    const height = frames.length;
    const scope = this.scope;
    for (let child = this.next; child; child = this.next) {
      this.next = child.nextSibling;
      const type = child.nodeType;
      if (type === 1) {
        // Prefixes resolve against the namespaces in scope on the element
        scope.namespaces = inScopeNamespaces(child);
        const method = engine.instructionMethod(child);
        if (method) engine[method](child, scope, this.output);
      } else if (type === 3 || type === 4) {
        engine.processText(child, scope, this.output);
      }
      if (frames.length !== height) return true;
    }
    return false;
  }

  /**
   * Leave the frame, completed or abandoned by an error.
   *
   * @param {object} engine - The engine
   * @returns {void}
   */
  release(engine) {
    this.scope.namespaces = this.saved;
    if (this.template) engine.templateDepth--;
  }

  /**
   * Complete the frame.
   *
   * @param {object} engine - The engine
   * @returns {void}
   */
  finish(engine) {
    this.release(engine);
    if (this.onDone) this.onDone();
  }
}

/**
 * Pending visits of the items of a list (the nodes of xsl:apply-templates
 * or xsl:for-each), one at a time.
 */
export class LoopFrame {
  /**
   * @param {number} count - Number of items
   * @param {(index: number) => void} visit - Instantiates one item; it may
   *   schedule frames, which run before the next item
   */
  constructor(count, visit) {
    this.count = count;
    this.index = 0;
    this.visit = visit;
    this.template = false;
  }

  /**
   * Visit items until one schedules further frames or none is left.
   *
   * @param {object} _engine - The engine
   * @param {object[]} frames - The work stack
   * @returns {boolean} False when every item is done
   */
  advance(_engine, frames) {
    const height = frames.length;
    while (this.index < this.count) {
      this.visit(this.index++);
      if (frames.length !== height) return true;
    }
    return false;
  }

  /**
   * Leave the frame, completed or abandoned by an error.
   *
   * @param {object} engine - The engine
   * @returns {void}
   */
  release(engine) {
    if (this.template) engine.templateDepth--;
  }

  /**
   * Complete the frame.
   *
   * @param {object} engine - The engine
   * @returns {void}
   */
  finish(engine) {
    this.release(engine);
  }
}

export const workStackMethods = {
  /**
   * Run a frame, and the frames it schedules, to completion.
   *
   * The outermost call owns the work stack of the transformation; nested
   * calls (content whose result is needed at once) run on top of it.
   *
   * @param {SequenceFrame|LoopFrame} frame - The frame
   * @returns {void}
   */
  runFrame(frame) {
    const outermost = this.frames === null;
    if (outermost) {
      this.frames = [];
      this.templateDepth = 0;
    }
    const frames = this.frames;
    const base = frames.length;
    try {
      this.pushFrame(frame);
      while (frames.length > base) {
        const top = frames[frames.length - 1];
        if (!top.advance(this, frames)) {
          frames.pop();
          top.finish(this);
        }
      }
    } catch (error) {
      this.unwindFrames(base);
      throw error;
    } finally {
      if (outermost) this.frames = null;
    }
  },

  /**
   * Schedule a frame to run once the current instruction returns, before
   * its next sibling; without a running work stack, run it now.
   *
   * The instruction must not use the output of the frame afterwards.
   *
   * @param {SequenceFrame|LoopFrame} frame - The frame
   * @returns {void}
   */
  continueWith(frame) {
    if (this.frames === null) this.runFrame(frame);
    else this.pushFrame(frame);
  },

  /**
   * Push a frame on the work stack, counting template instantiations.
   *
   * @param {SequenceFrame|LoopFrame} frame - The frame
   * @returns {void}
   * @throws {Error} When the frame would nest templates deeper than
   *   `maxTemplateDepth`
   */
  pushFrame(frame) {
    if (frame.template) {
      if (this.templateDepth >= this.maxTemplateDepth) {
        throw new Error(
          `Template recursion too deep: more than ${this.maxTemplateDepth} ` +
            "nested template invocations, a potential infinite recursion " +
            "(raise the maxTemplateDepth option to allow deeper recursion)",
        );
      }
      this.templateDepth++;
    }
    this.frames.push(frame);
  },

  /**
   * Drop the frames above a height after an error.
   *
   * @param {number} base - The height to return to
   * @returns {void}
   */
  unwindFrames(base) {
    const frames = this.frames;
    while (frames.length > base) frames.pop().release(this);
  },
};
