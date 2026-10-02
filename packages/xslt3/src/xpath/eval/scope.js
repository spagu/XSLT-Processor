/**
 * Variables and focus at compile time and at run time.
 *
 * Compile time: a scope is the static context plus the in-scope variables,
 * a linked list from the innermost binding outwards. A variable reference
 * is resolved once, to its depth in that list.
 *
 * Run time: an evaluator receives a context `{item, position, size, env,
 * dyn}`: the focus (item undefined when absent), the environment (a linked
 * list of values matching the compile-time scope, so a reference walks
 * `depth` links) and the dynamic context shared by the whole evaluation.
 *
 * @module @tradik/xslt3/xpath/eval/scope
 */

import { XPathError } from "../../errors.js";

/**
 * @typedef {object} Scope
 * @property {import("./staticContext.js").StaticContext} sc
 * @property {{key: string, next: object}|null} vars - Innermost binding first
 */

/**
 * @typedef {object} Context
 * @property {*} item - Context item, undefined when the focus is absent
 * @property {number} position - Context position
 * @property {number} size - Context size
 * @property {{value: Array, next: object}|null} env - Variable values
 * @property {object} dyn - Dynamic context (see dynamicContext.js)
 */

/**
 * @typedef {(ctx: Context) => Array} Evaluator - A compiled expression
 */

/**
 * @param {import("./staticContext.js").StaticContext} sc
 * @param {string[]} keys - Clark names of the external variables, the
 *   first one outermost
 * @returns {Scope}
 */
export function rootScope(sc, keys) {
  let scope = { sc, vars: null };
  for (const key of keys) scope = bindVariable(scope, key);
  return scope;
}

/**
 * @param {Scope} scope
 * @param {string} key - Clark name of the new variable
 * @returns {Scope} the scope with the variable added innermost
 */
export function bindVariable(scope, key) {
  return { sc: scope.sc, vars: { key, next: scope.vars } };
}

/**
 * @param {Scope} scope
 * @param {string} key - Clark name
 * @returns {number} depth of the innermost binding of the name, -1 when
 *   the variable is not in scope
 */
export function variableDepth(scope, key) {
  let depth = 0;
  for (let v = scope.vars; v !== null; v = v.next, depth++) {
    if (v.key === key) return depth;
  }
  return -1;
}

/**
 * @param {Context} ctx
 * @param {Array} value
 * @returns {Context} the context with a value bound innermost
 */
export function withVariable(ctx, value) {
  return {
    item: ctx.item,
    position: ctx.position,
    size: ctx.size,
    env: { value, next: ctx.env },
    dyn: ctx.dyn,
  };
}

/**
 * @param {Context} ctx
 * @param {*} item
 * @param {number} position
 * @param {number} size
 * @returns {Context} the context with a new focus
 */
export function withFocus(ctx, item, position, size) {
  return { item, position, size, env: ctx.env, dyn: ctx.dyn };
}

/**
 * @param {Context} ctx
 * @returns {*} the context item
 * @throws {XPathError} XPDY0002 when the focus is absent
 */
export function contextItem(ctx) {
  if (ctx.item === undefined) {
    throw new XPathError("XPDY0002", "The context item is absent");
  }
  return ctx.item;
}
