/**
 * The dynamic context of dynamic function calls and inline function
 * bodies, which XSLT 3.0 distinguishes (fn:current-output-uri is absent
 * there).
 *
 * @module @tradik/xslt3/xpath/eval/dynamicCall
 */

/** @type {WeakMap<object, object>} */
const dynamicCallContexts = new WeakMap();

/**
 * The dynamic context of a dynamic function call or an inline function
 * body: the caller's, marked `dynamicCall` (XSLT 3.0 clears the current
 * output URI there, see fn:current-output-uri).
 * @param {object} dyn - Dynamic context the function item was made in
 * @returns {object} a context inheriting from it, one per context
 */
export function dynamicCallContext(dyn) {
  let derived = dynamicCallContexts.get(dyn);
  if (!derived) {
    derived = Object.create(dyn);
    derived.dynamicCall = true;
    dynamicCallContexts.set(dyn, derived);
  }
  return derived;
}
