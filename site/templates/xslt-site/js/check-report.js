/**
 * The texts of the online check's result, from the analysis object of
 * xslt-migrate-check: the readiness percentage and its sentence, the summary
 * lines and the Markdown report of "Copy report". The recommendation texts
 * themselves come from the analysis (the package's texts.js). No DOM
 * access, so the site tests run it in Node.js.
 *
 * @module check-report
 */

/** Where the check runs, quoted in the copied report. */
export const CHECK_URL = "https://xslt-processor.tradik.com/check/";

/** The command for the full report. */
export const FULL_REPORT_COMMAND = "npx xslt-migrate-check . --html";

/**
 * "1 stylesheet", "2 stylesheets".
 *
 * @param {number} count - How many
 * @param {string} one - Singular
 * @param {string} [many] - Plural (singular + "s")
 * @returns {string} The count with the right noun
 */
export const plural = (count, one, many = `${one}s`) =>
  `${count.toLocaleString("en")} ${count === 1 ? one : many}`;

/**
 * Migration readiness: the share of findings the one-line migration handles
 * on its own (summary.automatic of summary.findings), rounded down so 99.5%
 * never shows as 100%. With no finding nothing breaks: 100%.
 *
 * @param {{findings: number, automatic: number, manualReview: number}}
 *   summary - The analysis summary
 * @returns {{percent: number, sentence: string}} The percentage and what it
 *   means
 */
export function readiness(summary) {
  const { findings, automatic, manualReview } = summary;
  if (findings === 0) {
    return {
      percent: 100,
      sentence:
        "Nothing in these files uses the browser's XSLT, so nothing breaks in Chrome 158.",
    };
  }
  const percent = Math.floor((automatic * 100) / findings);
  const review =
    manualReview === 0
      ? "none needs a person to look at it"
      : `${plural(manualReview, "needs", "need")} a person to look at it`;
  return {
    percent,
    sentence: `${automatic} of ${findings} ${findings === 1 ? "finding is" : "findings are"} covered by the one-line migration with no change to the stylesheets; ${review}.`,
  };
}

/**
 * The summary lines under the percentage.
 *
 * @param {object} summary - The analysis summary
 * @returns {string[]} The lines, in the order of the CLI's summary
 */
export function summaryLines(summary) {
  const yes = (count) => (count > 0 ? "yes" : "no");
  return [
    `XSLTProcessor detected: ${yes(summary.nativeUsages)}`,
    `xml-stylesheet detected: ${yes(summary.xmlStylesheetFiles)}`,
    plural(summary.stylesheets, "stylesheet"),
    `${summary.automatic.toLocaleString("en")} compatible`,
    `${plural(summary.manualReview, "requires", "require")} review`,
  ];
}

/** Ratings, most serious first (the package's analysis/findings.js order). */
export const RATINGS = Object.freeze(["HIGH", "MEDIUM", "LOW"]);

/**
 * The findings the table shows: those of one rating (or all), ordered by
 * rating, most or least serious first, then by file.
 *
 * @param {Array<{rating: string, file: string}>} findings - All findings
 * @param {{filter: string, descending: boolean}} view - "ALL" or a rating,
 *   and whether the most serious come first
 * @returns {Array<object>} The rows to show
 */
export function visibleFindings(findings, { filter, descending }) {
  const rank = (finding) => RATINGS.indexOf(finding.rating);
  const direction = descending ? 1 : -1;
  return findings
    .filter((finding) => filter === "ALL" || finding.rating === filter)
    .sort(
      (a, b) =>
        direction * (rank(a) - rank(b)) || a.file.localeCompare(b.file, "en"),
    );
}

/**
 * Escape a Markdown table cell.
 *
 * @param {string} text - Cell text
 * @returns {string} The text with pipes escaped and on one line
 */
const cell = (text) => String(text).replaceAll("|", "\\|").replace(/\s+/g, " ");

/**
 * A fenced code block.
 *
 * @param {string} code - The code
 * @param {string} [language] - Info string
 * @returns {string} The block
 */
const fence = (code, language = "") => `\`\`\`${language}\n${code}\n\`\`\``;

/**
 * One recommendation as Markdown.
 *
 * @param {object} step - A recommendation of the analysis
 * @param {number} index - Its position (0-based)
 * @returns {string} The section
 */
function stepMarkdown(step, index) {
  const parts = [`### ${index + 1}. ${step.title}`, step.why];
  if (step.commands.length > 0) {
    parts.push(fence(step.commands.join("\n"), "sh"));
  }
  if (step.snippet) parts.push(fence(step.snippet));
  if (step.alternative) {
    parts.push(`Without a bundler:\n\n${fence(step.alternative)}`);
  }
  parts.push(`Files: ${step.findings.join(", ")}`);
  return parts.join("\n\n");
}

/**
 * The Markdown report of "Copy report": summary, findings, what to do.
 *
 * @param {object} analysis - The analysis of xslt-migrate-check
 * @returns {string} Markdown
 */
export function markdownReport(analysis) {
  const { summary } = analysis;
  const { percent, sentence } = readiness(summary);
  const lines = [
    "# XSLT migration check",
    "",
    `Migration readiness: ${percent}%`,
    "",
    sentence,
    "",
    ...summaryLines(summary).map((line) => `- ${line}`),
    "",
    `Recommended migration: ${summary.recommendedRuntime}`,
    "",
    `Difficulty: ${summary.difficulty}. ${summary.difficultyReason}`,
  ];
  if (analysis.findings.length > 0) {
    lines.push(
      "",
      "## Findings",
      "",
      "| Rating | File | Reason |",
      "|---|---|---|",
    );
    for (const finding of analysis.findings) {
      lines.push(
        `| ${finding.rating} | ${cell(finding.file)} | ${cell(finding.reason)} |`,
      );
    }
  }
  if (analysis.recommendations.length > 0) {
    lines.push(
      "",
      "## What to do",
      "",
      analysis.recommendations.map(stepMarkdown).join("\n\n"),
    );
  }
  lines.push(
    "",
    `Full report: \`${FULL_REPORT_COMMAND}\``,
    "",
    `Checked in the browser at ${CHECK_URL} (nothing uploaded), xslt-migrate-check ${analysis.version}.`,
  );
  return `${lines.join("\n")}\n`;
}
