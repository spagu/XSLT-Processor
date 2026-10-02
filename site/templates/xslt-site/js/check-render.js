/**
 * Shows the result of the online check: readiness, summary lines, the
 * recommendation blocks and the findings table with its rating filter and
 * order. Everything is set as text (textContent), never as HTML, so a file
 * name cannot inject markup.
 *
 * @module check-render
 */

import { readiness, summaryLines, visibleFindings } from "./check-report.js";

/**
 * Create an element with a class and text.
 *
 * @param {string} tag - Tag name
 * @param {string} [text] - Text content
 * @param {string} [className] - Class attribute
 * @returns {HTMLElement} The element
 */
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/**
 * A code block.
 *
 * @param {string} code - The code
 * @returns {HTMLElement} pre > code
 */
function codeBlock(code) {
  const pre = element("pre");
  pre.append(element("code", code));
  return pre;
}

/**
 * A rating badge: the rating as text, coloured and outlined.
 *
 * @param {string} rating - HIGH, MEDIUM or LOW
 * @returns {HTMLElement} The badge
 */
function badge(rating) {
  return element("span", rating, `ck-badge ck-badge--${rating.toLowerCase()}`);
}

/**
 * One recommendation block.
 *
 * @param {object} step - A recommendation of the analysis
 * @returns {HTMLElement} The list item
 */
function stepItem(step) {
  const item = element("li", undefined, "ck-step");
  item.append(element("h4", step.title), element("p", step.why));
  if (step.commands.length > 0) {
    item.append(codeBlock(step.commands.join("\n")));
  }
  if (step.snippet) item.append(codeBlock(step.snippet));
  if (step.alternative) {
    item.append(
      element("p", "Without a bundler:"),
      codeBlock(step.alternative),
    );
  }
  const count = step.findings.length;
  const files = element("p", undefined, "ck-step__files");
  files.append(
    element("strong", `${count} ${count === 1 ? "file" : "files"}: `),
    step.findings.join(", "),
  );
  item.append(files);
  return item;
}

/**
 * Fill the findings table, keeping its filter and order controls in sync.
 *
 * @param {HTMLElement} root - The result section
 * @param {Array<object>} findings - The findings
 * @returns {void}
 */
function findingsTable(root, findings) {
  const view = { filter: "ALL", descending: true };
  const body = root.querySelector("#ck-findings tbody");
  const sort = root.querySelector("#ck-sort");
  const filters = root.querySelectorAll(".ck-filters button");
  const draw = () => {
    body.replaceChildren(
      ...visibleFindings(findings, view).map((finding) => {
        const row = element("tr");
        const rating = element("td");
        rating.append(badge(finding.rating));
        const reason = element("td");
        reason.append(
          element("span", finding.reason),
          element("span", finding.fix, "ck-fix"),
        );
        row.append(rating, element("td", finding.file, "ck-file"), reason);
        return row;
      }),
    );
    if (body.children.length === 0) {
      const empty = element("td", "No finding with this rating.");
      empty.colSpan = 3;
      body.append(element("tr"));
      body.lastChild.append(empty);
    }
    sort.parentElement.setAttribute(
      "aria-sort",
      view.descending ? "descending" : "ascending",
    );
    for (const button of filters) {
      const rating = button.dataset.filter;
      const count = findings.filter(
        (f) => rating === "ALL" || f.rating === rating,
      ).length;
      button.textContent = `${rating === "ALL" ? "All" : rating} (${count})`;
      button.setAttribute("aria-pressed", String(rating === view.filter));
    }
  };
  for (const button of filters) {
    button.onclick = () => {
      view.filter = button.dataset.filter;
      draw();
    };
  }
  sort.onclick = () => {
    view.descending = !view.descending;
    draw();
  };
  draw();
}

/**
 * Show an analysis in the result section.
 *
 * @param {HTMLElement} root - The result section (#ck-result)
 * @param {object} analysis - The analysis of xslt-migrate-check
 * @param {string[]} notes - Lines about files left out or unreadable
 * @returns {void}
 */
export function renderResult(root, analysis, notes) {
  const { summary } = analysis;
  const { percent, sentence } = readiness(summary);
  const $ = (id) => root.querySelector(`#${id}`);
  $("ck-percent").textContent = `${percent}%`;
  $("ck-sentence").textContent = sentence;
  $("ck-summary").replaceChildren(
    ...summaryLines(summary).map((line) => element("li", line)),
  );
  $("ck-runtime").textContent = summary.recommendedRuntime;
  $("ck-difficulty").textContent =
    `Estimated difficulty: ${summary.difficulty}. ${summary.difficultyReason}`;
  const steps = analysis.recommendations.map(stepItem);
  $("ck-steps").replaceChildren(
    ...(steps.length > 0 ? steps : [element("li", "Nothing to change.")]),
  );
  findingsTable(root, analysis.findings);
  const skipped = $("ck-skipped");
  skipped.textContent = notes.join(" ");
  skipped.hidden = notes.length === 0;
  root.hidden = false;
}
