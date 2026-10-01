/**
 * The XSLT context of an instruction (XSLT 3.0 section 5.4.3): the focus,
 * the variables in scope, the current mode and template rule, the current
 * group and grouping key, the captured groups of xsl:analyze-string, the
 * tunnel parameters, and the transformation it belongs to. Contexts are
 * immutable: instructions derive new ones.
 *
 * @module @tradik/xslt3/xslt/runtime/context
 */

/**
 * @typedef {object} XsltContext
 * @property {object} tx - The transformation (see transformation.js)
 * @property {*} item - Context item, undefined when absent
 * @property {number} position
 * @property {number} size
 * @property {{value: Array, next: object}|null} env - Variable values
 * @property {object|null} mode - Current mode
 * @property {object|null} rule - Current template rule
 * @property {Array|undefined} group - Current group
 * @property {Array|undefined} groupKey - Current grouping key
 * @property {string[]|undefined} regex - Captured groups
 * @property {Map<string, Array>|null} tunnel - Tunnel parameters
 * @property {boolean} temporary - Temporary output state
 * @property {object|null} dyn - Dynamic context of XPath, made on demand
 */

/**
 * A context with some fields changed.
 * @param {XsltContext} xc
 * @param {Partial<XsltContext>} changes
 * @returns {XsltContext}
 */
export function derive(xc, changes) {
  const next = { ...xc, ...changes };
  next.dyn = null;
  return next;
}

/**
 * A context with a new focus.
 * @param {XsltContext} xc
 * @param {*} item
 * @param {number} position
 * @param {number} size
 * @returns {XsltContext}
 */
export const withFocus = (xc, item, position, size) =>
  derive(xc, { item, position, size });

/**
 * A context with a variable bound innermost.
 * @param {XsltContext} xc
 * @param {Array} value
 * @returns {XsltContext}
 */
export const withVariable = (xc, value) =>
  derive(xc, { env: { value, next: xc.env } });

/**
 * The XPath dynamic context of an XSLT context: the dynamic context of
 * the transformation with the XSLT context attached (read by current(),
 * current-group(), regex-group()...).
 * @param {XsltContext} xc
 * @returns {object}
 */
export function dynamicContextOf(xc) {
  let dyn = xc.dyn;
  if (!dyn) {
    dyn = Object.create(xc.tx.dyn);
    dyn.xc = xc;
    xc.dyn = dyn;
  }
  return dyn;
}

/**
 * Evaluates a compiled expression in an XSLT context.
 * @param {{run: Function}} expr
 * @param {XsltContext} xc
 * @returns {Array} the result sequence
 */
export function evaluate(expr, xc) {
  const dyn = dynamicContextOf(xc);
  useStaticContext(dyn, expr.sc);
  return expr.run({
    item: xc.item,
    position: xc.position,
    size: xc.size,
    env: xc.env,
    dyn,
  });
}

/**
 * Makes the static context of the expression about to run visible to
 * the functions that need it (key(), system-property(), format-number(),
 * doc() with a relative URI...).
 * @param {object} dyn - XPath dynamic context
 * @param {object} sc - Static context of the expression
 */
export function useStaticContext(dyn, sc) {
  dyn.sc = sc;
  dyn.staticBaseUri = sc.baseUri;
  dyn.decimalFormats = sc.decimalFormats;
}
