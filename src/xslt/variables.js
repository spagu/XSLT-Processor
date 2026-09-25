/**
 * Variable and parameter bindings (XSLT 1.0 section 11).
 *
 * Local bindings live in the `variables` and `parameters` objects of an
 * XSLT context; the engine gives every template invocation empty ones and a
 * new copy to every sequence constructor that declares a variable, which
 * makes local variables lexically scoped. Global variables and parameters are
 * kept in a {@link GlobalBindings} table shared by all contexts of one
 * transformation and are evaluated lazily, so they may refer to each other in
 * any order (section 11.4).
 *
 * @module xslt/variables
 */

"use strict";

/** Evaluation states of a global binding. */
const PENDING = 0;
const EVALUATING = 1;
const DONE = 2;

/**
 * The global variables and parameters of one transformation.
 */
export class GlobalBindings {
  /**
   * @param {(definition: object) => *} evaluate - Computes the value of a
   *   definition; called at most once per name
   */
  constructor(evaluate) {
    this.evaluate = evaluate;
    this.entries = new Map();
  }

  /**
   * Declare a global binding. A later declaration of the same name replaces
   * an earlier one.
   *
   * @param {string} name - The variable or parameter name
   * @param {object} definition - Passed to the evaluate callback
   * @returns {void}
   *
   * @example
   * globals.define('title', { select: "'Report'" });
   */
  define(name, definition) {
    this.entries.set(name, { definition, state: PENDING, value: undefined });
  }

  /**
   * Whether a global binding with that name exists.
   *
   * @param {string} name - The variable name
   * @returns {boolean} True when declared
   */
  has(name) {
    return this.entries.has(name);
  }

  /**
   * The value of a global binding, evaluating it on first use.
   *
   * @param {string} name - The variable name
   * @returns {*} The value, undefined when the name is not declared
   * @throws {Error} When the definition (indirectly) refers to itself
   *
   * @example
   * globals.get('title'); // "Report"
   */
  get(name) {
    const entry = this.entries.get(name);
    if (!entry) return undefined;
    if (entry.state === DONE) return entry.value;
    if (entry.state === EVALUATING) {
      throw new Error(
        `Circular definition of global variable $${name} (XSLT 1.0 section 11.4)`,
      );
    }

    entry.state = EVALUATING;
    try {
      entry.value = this.evaluate(entry.definition);
    } catch (error) {
      entry.state = PENDING;
      throw error;
    }
    entry.state = DONE;
    return entry.value;
  }

  /**
   * Evaluate every binding, in declaration order, so that errors and
   * `xsl:message` side effects of unused globals still surface.
   *
   * @returns {void}
   */
  evaluateAll() {
    for (const name of this.entries.keys()) this.get(name);
  }
}

/**
 * Look a variable up in an XSLT context: local variables, then local
 * parameters, then the globals.
 *
 * @param {{variables: object, parameters: object, globals?: GlobalBindings|null}} context - The XSLT context
 * @param {string} name - The variable name
 * @returns {{found: boolean, value: *}} Whether it is bound, and its value
 */
export function lookupVariable(context, name) {
  if (Object.hasOwn(context.variables, name)) {
    return { found: true, value: context.variables[name] };
  }
  if (Object.hasOwn(context.parameters, name)) {
    return { found: true, value: context.parameters[name] };
  }
  const globals = context.globals;
  if (globals?.has(name)) return { found: true, value: globals.get(name) };
  return { found: false, value: undefined };
}

/**
 * Read-only object view of the variables in scope of an XSLT context, in the
 * shape the XPath evaluator expects (`hasOwnProperty` + property access).
 * Nothing is copied: lookups read the context live, and globals are only
 * evaluated when an expression actually refers to them.
 *
 * @param {object} context - The XSLT context
 * @returns {object} A proxy mapping variable names to values
 *
 * @example
 * new XPathContext(node, 1, 1, createVariableView(xsltContext), namespaces);
 */
export function createVariableView(context) {
  const binding = (name) =>
    typeof name === "string" ? lookupVariable(context, name) : null;

  return new Proxy(Object.create(null), {
    has: (_target, name) => binding(name)?.found === true,
    get: (_target, name) => binding(name)?.value,
    getOwnPropertyDescriptor: (_target, name) => {
      const found = binding(name);
      if (!found?.found) return undefined;
      return {
        value: found.value,
        writable: false,
        enumerable: true,
        configurable: true,
      };
    },
  });
}
