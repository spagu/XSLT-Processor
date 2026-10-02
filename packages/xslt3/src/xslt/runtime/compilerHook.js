/**
 * The stylesheet compiler as seen from the run time (fn:transform): set
 * by the API module when it loads, so that the run time does not import
 * the compiler (which imports the run time).
 *
 * @module @tradik/xslt3/xslt/runtime/compilerHook
 */

/** @type {(source: *, options: object) => object} */
let compiler;

/**
 * Registers the compiler.
 * @param {(source: *, options: object) => object} compile -
 *   compileStylesheet of api.js
 */
export function setCompiler(compile) {
  compiler = compile;
}

/**
 * Compiles a stylesheet with the registered compiler.
 * @param {*} source - Document, element or text of the stylesheet
 * @param {object} options - Options of compileStylesheet
 * @returns {object} the CompiledStylesheet
 */
export const compileWith = (source, options) => compiler(source, options);
