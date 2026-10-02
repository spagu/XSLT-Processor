/**
 * Errors of the XPath, XSLT and F&O specifications, identified by their
 * error code (a local name in the err namespace, e.g. "XPST0003").
 *
 * @module @tradik/xslt3/errors
 */

/** An error with a W3C error code. */
export class XPathError extends Error {
  /**
   * @param {string} code - Error code, e.g. "XPST0003"
   * @param {string} message - Description
   * @param {ErrorOptions} [options] - Standard error options (cause)
   */
  constructor(code, message, options) {
    super(`${code}: ${message}`, options);
    this.name = "XPathError";
    this.code = code;
  }
}
