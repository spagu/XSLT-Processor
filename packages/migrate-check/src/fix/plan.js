/**
 * The plan of the automatic fixes: which files change and how, from the
 * analysis and the files' texts. Pure; reading and writing happen in
 * ./run.js. Stylesheets are never changed.
 *
 * @module xslt-migrate-check/fix/plan
 */

import { HTML_EXTENSIONS, extensionOf } from "../detectors.js";
import { parseManifest } from "../manifest.js";
import { addCdnScript } from "./html.js";
import {
  POLYFILL_IMPORT_LINE,
  POLYFILL_REQUIRE_LINE,
  addPolyfill,
  moduleStyle,
} from "./js.js";
import {
  RUNTIME_RANGES,
  addDependencies,
  missingDependencies,
} from "./packageJson.js";
import { addLoader } from "./xml.js";

/**
 * @typedef {object} Edit
 * @property {string} path - Report path
 * @property {string} before - Old text (latin1)
 * @property {string} after - New text (latin1)
 * @property {string} change - What changes, in a few words
 */

/**
 * @typedef {object} FixPlan
 * @property {Edit[]} edits - Files that change, sorted by path
 * @property {Array<{path: string, reason: string}>} skipped - Files that
 *   need the change but are left to the user, and why
 */

/**
 * The files the fixes may touch: the scripts and pages that call
 * XSLTProcessor, the rendered XML documents, and package.json.
 *
 * @param {import("../analysis/index.js").Analysis} analysis - The analysis
 * @returns {string[]} Report paths to read
 */
export function fixTargets(analysis) {
  const kinds = new Set(["script", "xml-stylesheet"]);
  const paths = analysis.findings
    .filter((finding) => kinds.has(finding.kind))
    .map((finding) => finding.file);
  return paths.length > 0 ? [...paths, "package.json"] : [];
}

/**
 * Plan the edit of one finding.
 *
 * @param {import("../analysis/findings.js").Finding} finding - A finding
 * @param {string} text - The file's text (latin1)
 * @param {string|undefined} packageType - package.json "type"
 * @returns {{after: string|null, change: string, reason: string}} The new
 *   text (null when skipped), the change or the reason to skip
 */
function planFinding(finding, text, packageType) {
  if (finding.kind === "xml-stylesheet") {
    if (!finding.automatic) return { after: null, reason: finding.reason };
    return {
      after: addLoader(text),
      change: "loader <script> as the first child of the root element",
      reason: "no document element found",
    };
  }
  if (HTML_EXTENSIONS.has(extensionOf(finding.file))) {
    return {
      after: addCdnScript(text),
      change: "CDN <script> in <head>",
      reason: "no <head>; add the CDN <script> before your own scripts",
    };
  }
  const style = moduleStyle(finding.file, text, packageType);
  if (!style) {
    return {
      after: null,
      reason: "not a module; add the CDN <script> to the pages that load it",
    };
  }
  return {
    after: addPolyfill(text, style),
    change: style === "module" ? POLYFILL_IMPORT_LINE : POLYFILL_REQUIRE_LINE,
  };
}

/**
 * Plan the fixes.
 *
 * @param {import("../analysis/index.js").Analysis} analysis - The analysis
 * @param {Map<string, string>} texts - Texts of the fixTargets() files
 *   that could be read (latin1)
 * @returns {FixPlan} The plan
 */
export function planFixes(analysis, texts) {
  const manifestText = texts.get("package.json");
  const packageType = parseManifest(manifestText).type;
  const edits = [];
  const skipped = [];
  const targets = analysis.findings.filter(
    (f) => f.kind === "script" || f.kind === "xml-stylesheet",
  );
  for (const finding of targets) {
    const before = texts.get(finding.file);
    const planned =
      before === undefined || before.includes("\u0000")
        ? { after: null, reason: "binary or unreadable file" }
        : planFinding(finding, before, packageType);
    if (planned.after === null) {
      skipped.push({ path: finding.file, reason: planned.reason });
    } else {
      edits.push({
        path: finding.file,
        before,
        after: planned.after,
        change: planned.change,
      });
    }
  }
  const manifestEdit = planManifest(analysis, manifestText, edits.length);
  if (manifestEdit) edits.push(manifestEdit);
  edits.sort((x, y) => (x.path > y.path) - (x.path < y.path));
  return { edits, skipped };
}

/**
 * Plan the package.json edit: the library, plus @tradik/xslt3 when a
 * stylesheet declares XSLT 2.0 or 3.0.
 *
 * @param {import("../analysis/index.js").Analysis} analysis - The analysis
 * @param {string|undefined} text - package.json text, if any
 * @param {number} editCount - Other files that change
 * @returns {Edit|null} The edit, or null when nothing is added
 */
function planManifest(analysis, text, editCount) {
  if (text === undefined || editCount === 0) return null;
  const names = Object.keys(RUNTIME_RANGES).filter(
    (name) => name !== "@tradik/xslt3" || analysis.needsXslt3,
  );
  const after = addDependencies(text, names);
  if (after === null) return null;
  const added = missingDependencies(text, names).map(
    (name) => `${name} ${RUNTIME_RANGES[name]}`,
  );
  return {
    path: "package.json",
    before: text,
    after,
    change: `dependencies: ${added.join(", ")}`,
  };
}
