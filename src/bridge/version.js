/**
 * XSLT Version Selection
 *
 * The `xsltVersion` option of XSLTProcessor: "1.0" (the default) runs every
 * stylesheet with the XSLT 1.0 engine, a stylesheet declaring a higher
 * version in forwards-compatible mode (as Chrome does); "auto" hands a
 * stylesheet whose effective version is 2.0 or more to @tradik/xslt3.
 *
 * @module bridge/version
 */

import { declaredVersion } from "../xslt/forwardsCompatible.js";

/** Values accepted by the `xsltVersion` option. */
export const XSLT_VERSION_MODES = Object.freeze(["1.0", "auto"]);

/**
 * Validate the `xsltVersion` option.
 *
 * @param {string|undefined|null} mode - The option value
 * @returns {"1.0"|"auto"} The mode, "1.0" when not given
 * @throws {RangeError} For any other value
 *
 * @example
 * xsltVersionMode(undefined); // "1.0"
 */
export function xsltVersionMode(mode) {
  const value = mode ?? "1.0";
  if (!XSLT_VERSION_MODES.includes(value)) {
    throw new RangeError(
      `Invalid xsltVersion "${value}": expected "1.0" or "auto"`,
    );
  }
  return value;
}

/**
 * The effective version of a stylesheet: the `version` attribute of
 * `xsl:stylesheet`/`xsl:transform`, or the `xsl:version` attribute of a
 * simplified stylesheet (literal result element).
 *
 * @param {Node} style - Stylesheet document or root element
 * @returns {number} The version, NaN when missing or not a number
 *
 * @example
 * stylesheetVersion(xslDoc); // 2 for <xsl:stylesheet version="2.0">
 */
export function stylesheetVersion(style) {
  const root = style.nodeType === 9 ? style.documentElement : style;
  const version = root ? declaredVersion(root) : null;
  return version ? Number(version.trim()) : NaN;
}

/**
 * Whether a stylesheet is run by @tradik/xslt3 in the given mode.
 *
 * @param {Node} style - Stylesheet document or root element
 * @param {"1.0"|"auto"} mode - The `xsltVersion` option
 * @returns {boolean} True in "auto" mode for version 2.0 and above
 */
export function usesXslt3(style, mode) {
  return mode === "auto" && stylesheetVersion(style) >= 2;
}
