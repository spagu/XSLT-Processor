/**
 * @tradik/xslt3: XSLT 3.0 and XPath 3.1 in JavaScript (in development).
 *
 * One engine for XSLT 3.0 and 2.0 stylesheets, and 1.0 ones in
 * backwards-compatible mode; see docs/XSLT3.md for the design and the
 * milestones. Public so far: XPath 3.1 (compileXPath, evaluateXPath).
 *
 * @module @tradik/xslt3
 */

/** Version of this package, kept equal to package.json. */
export const VERSION = "0.0.0";

export {
  compileXPath,
  createFunctionLibrary,
  defaultFunctionLibrary,
  evaluateXPath,
  FunctionLibrary,
  XPathError,
} from "./xpath/index.js";
