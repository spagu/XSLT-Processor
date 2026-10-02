/**
 * Every user-facing recommendation text in one place: what to install, what
 * to add, the one-line fix per finding, the recommended runtime and the
 * difficulty sentence. The terminal report, the HTML report and the website
 * wizard all read them from here, so they never disagree.
 *
 * @module xslt-migrate-check/texts
 */

import { SUGGESTION } from "./migration.js";

/** The bundler entry that installs XSLTProcessor where the browser lacks it. */
export const POLYFILL_IMPORT = 'import "@tradik/xslt-processor/polyfill";';

/** Links quoted in the reports (the only URLs the HTML report links to). */
export const LINKS = Object.freeze({
  howTo: SUGGESTION.howTo,
  docs: "https://github.com/spagu/XSLT-Processor/blob/main/docs/MIGRATE-CHECK.md",
  npm: "https://www.npmjs.com/package/xslt-migrate-check",
});

/**
 * @typedef {object} RecommendationText
 * @property {string} title - Short name of the action
 * @property {string} why - One or two sentences on when and why
 * @property {string[]} commands - Shell commands, in order
 * @property {string|null} snippet - The line to add to the code, if any
 * @property {string|null} alternative - Another way to add it, if any
 * @property {string} runtime - What ends up running the XSLT
 */

/** Texts of each recommendation, by id, in their tie-break order. */
export const RECOMMENDATIONS = Object.freeze({
  polyfill: {
    title: "Load @tradik/xslt-processor before your XSLTProcessor code",
    why: "Your scripts call the browser's XSLTProcessor. The package provides the same API, so the calls stay as they are; with a bundler import the polyfill entry once, otherwise add the script tag before your own scripts.",
    commands: ["npm install @tradik/xslt-processor"],
    snippet: POLYFILL_IMPORT,
    alternative: SUGGESTION.script,
    runtime: "@tradik/xslt-processor",
  },
  loader: {
    title: "Browser compatibility loader",
    why: "These XML documents ask the browser to apply a stylesheet with <?xml-stylesheet?>, which Chrome 158 ignores. Add this line as the first child of the document element (right after its start tag); it runs the stylesheet and replaces the page with the result. --fix adds it for you.",
    commands: [],
    snippet: SUGGESTION.xmlScript,
    alternative: null,
    runtime: "@tradik/xslt-processor",
  },
  xslt3: {
    title: "Add @tradik/xslt3 for the XSLT 2.0 and 3.0 stylesheets",
    why: 'The browser never ran XSLT 2.0 or 3.0. Install the XSLT 3.0 engine next to the library and create the processor with xsltVersion: "auto", which picks the engine from each stylesheet\'s version attribute. New code that does not need the W3C XSLTProcessor API can use @tradik/xslt3 alone.',
    commands: ["npm install @tradik/xslt-processor @tradik/xslt3"],
    snippet: 'const processor = new XSLTProcessor({ xsltVersion: "auto" });',
    alternative: null,
    runtime: "@tradik/xslt-processor + @tradik/xslt3",
  },
  msxml: {
    title: "Rewrite the MSXML extensions",
    why: "No browser runtime runs MSXML extensions. Replace msxsl:script with named templates, or with xsl:function in XSLT 2.0/3.0; msxsl:format-date and msxsl:format-time with format-date() and format-time() in XSLT 2.0 or the EXSLT date: functions. msxsl:node-set already works and can stay.",
    commands: [],
    snippet: null,
    alternative: null,
    runtime: "none until the extensions are rewritten",
  },
  server: {
    title: "Render on the server with the xslt CLI",
    why: "No scanned page runs these stylesheets in the browser. If the output is the same for every visitor, transform once at build time and serve HTML; no XSLT runtime reaches the browser.",
    commands: [
      "npm install --save-dev @tradik/xslt-processor jsdom",
      "npx xslt data.xml template.xsl -o page.html",
    ],
    snippet: null,
    alternative: null,
    runtime: "the xslt CLI at build time (nothing in the browser)",
  },
});

/** One-line fix per finding kind or issue code, quoted next to the finding. */
export const FIXES = Object.freeze({
  script: "Load @tradik/xslt-processor before this code",
  "html-link":
    "Serve the page as XML with the loader line, or transform it on the server",
  "xml-stylesheet":
    "Add the loader line as the first child of the document element",
  migrated: "Nothing; it already loads @tradik/xslt-processor",
  stylesheet: "Nothing; runs as is",
  "server-only": "Nothing; it runs on the server",
  "msxml-script": "Rewrite msxsl:script as templates or xsl:function",
  "msxml-function": "Replace the msxsl: functions with XSLT 2.0 or EXSLT ones",
  xslt3: 'Install @tradik/xslt3 and pass xsltVersion: "auto"',
  document:
    "Check each file document() loads is reachable from the page (same origin)",
  "exslt-unsupported": "Replace the unsupported EXSLT calls",
  "exslt-dynamic": "Enable dyn:evaluate for trusted input only, or remove it",
  extension: "Guard the extension with function-available() or replace it",
  "missing-include": "Fix the href or add the missing stylesheet",
  "doe-fragment": "Review the output that bypasses escaping",
});

/** Fallback runtime line when there is nothing to migrate. */
export const NO_RUNTIME = "none needed";

/**
 * The sentence that explains the estimated difficulty.
 *
 * @param {"LOW"|"MEDIUM"|"HIGH"} difficulty - The estimate
 * @param {{findings: number, manual: number, msxml: number, xslt3: number}}
 *   counts - Findings in total, needing manual review, with MSXML, needing
 *   XSLT 3.0
 * @returns {string} One sentence
 */
export function difficultyReason(difficulty, counts) {
  if (counts.findings === 0) return "Nothing uses XSLT, so nothing changes.";
  if (difficulty === "LOW") {
    return "The one-line migration covers every finding; no stylesheet needs changes.";
  }
  if (difficulty === "MEDIUM") {
    return `${counts.manual} of ${counts.findings} findings need a manual check, but no stylesheet needs a rewrite or the XSLT 3.0 engine.`;
  }
  const causes = [
    [counts.msxml, "with MSXML extensions to rewrite"],
    [counts.xslt3, "in XSLT 2.0/3.0 to test on @tradik/xslt3"],
  ]
    .filter(([count]) => count > 0)
    .map(([count, what]) => `${count} ${what}`);
  return `Some stylesheets need real work: ${causes.join(", and ")}.`;
}
