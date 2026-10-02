/**
 * The online check's page logic: reads what the visitor drops or chooses
 * (check-drop.js, check-files.js), runs the analysis of xslt-migrate-check
 * from the vendor bundle and shows the result (check-render.js). Copy
 * report puts the Markdown summary on the clipboard; Download HTML report
 * saves the command line's --html report, rendered here. No file content or
 * name leaves the page.
 *
 * @module check-app
 */

import { droppedSources, fromFileList, takeDropped } from "./check-drop.js";
import { collectFiles } from "./check-files.js";
import { markdownReport, plural, readiness } from "./check-report.js";
import { renderResult } from "./check-render.js";

const NPX_HINT = "or run npx xslt-migrate-check . on your machine";

/**
 * The notes under the findings: files left out and files not read.
 *
 * @param {import("./check-files.js").Collected} collected - What was read
 * @returns {string[]} Sentences
 */
function notes({ notRead, skipped }) {
  const lines = [];
  if (notRead > 0) {
    lines.push(
      `${plural(notRead, "file")} left out: types the checker does not read, or generated folders.`,
    );
  }
  if (skipped.length > 0) {
    const shown = skipped.slice(0, 10).map((s) => `${s.path} (${s.reason})`);
    const more = skipped.length > 10 ? ` and ${skipped.length - 10} more` : "";
    lines.push(`Not read: ${shown.join(", ")}${more}.`);
  }
  return lines;
}

/**
 * Start the check on the page.
 *
 * @param {HTMLElement} app - The input section (#ck-app); the other
 *   elements are found by their ids
 * @param {Promise<object>} checker - The import() of the vendor bundle
 * @returns {void}
 */
export function startCheck(app, checker) {
  const $ = (id) => document.getElementById(id);
  const status = $("ck-status");
  const errorBox = $("ck-error");
  const result = $("ck-result");
  const actionStatus = $("ck-action-status");
  let analysis = null;
  let busy = false;

  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
  };

  app.hidden = false;
  checker.then(
    () => {
      status.textContent = "Ready. Drop your files; nothing has been read yet.";
    },
    () => {
      status.textContent = "";
      showError(
        `The checker could not be loaded. Reload the page, ${NPX_HINT}.`,
      );
    },
  );

  /**
   * Read the sources, analyse them and show the result.
   *
   * @param {(isIgnoredDir: (name: string) => boolean) => Promise<object[]>}
   *   getSources - Lists what was given
   * @returns {Promise<void>}
   */
  const run = async (getSources) => {
    if (busy) return;
    busy = true;
    errorBox.hidden = true;
    status.textContent = "Reading the files in your browser…";
    try {
      const lib = await checker;
      const isIgnoredDir = lib.createIgnoreMatcher();
      const started = performance.now();
      const collected = await collectFiles(await getSources(isIgnoredDir), {
        isAnalysed: lib.isAnalysed,
        isIgnoredDir,
      });
      if (collected.files.length === 0) {
        throw new Error(
          [
            "None of these files is one the checker reads (scripts, templates, XML, XSL).",
            ...notes(collected),
          ].join(" "),
        );
      }
      analysis = lib.analyzeFiles(collected.files, {
        directory: collected.folder ? `${collected.folder}/` : "./",
        durationMs: Math.round(performance.now() - started),
      });
      renderResult(result, analysis, notes(collected));
      actionStatus.textContent = "";
      const { percent } = readiness(analysis.summary);
      status.textContent = `Checked ${plural(collected.files.length, "file")}: migration readiness ${percent}%, ${plural(analysis.summary.findings, "finding")}.`;
      result.focus();
    } catch (error) {
      status.textContent = "No result.";
      showError(error.message);
    } finally {
      busy = false;
    }
  };

  for (const input of [$("ck-files"), $("ck-folder")]) {
    input.addEventListener("change", () => {
      const sources = fromFileList(input.files);
      input.value = "";
      run(async () => sources);
    });
  }

  const drop = $("ck-drop");
  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("ck-drop--over");
  });
  drop.addEventListener("dragleave", () =>
    drop.classList.remove("ck-drop--over"),
  );
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("ck-drop--over");
    const dropped = takeDropped(event.dataTransfer);
    run((isIgnoredDir) => droppedSources(dropped, isIgnoredDir));
  });
  // A file dropped beside the zone would replace the page with the file
  for (const type of ["dragover", "drop"]) {
    window.addEventListener(type, (event) => event.preventDefault());
  }

  $("ck-copy").addEventListener("click", async () => {
    try {
      await window.navigator.clipboard.writeText(markdownReport(analysis));
      actionStatus.textContent = "Report copied as Markdown.";
    } catch {
      actionStatus.textContent = "The browser did not allow copying.";
    }
  });

  $("ck-download").addEventListener("click", async () => {
    const lib = await checker;
    const blob = new window.Blob([lib.renderHtml(analysis)], {
      type: "text/html",
    });
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = "xslt-migration-report.html";
    link.click();
    setTimeout(() => window.URL.revokeObjectURL(link.href), 1000);
    actionStatus.textContent = "Report saved as xslt-migration-report.html.";
  });
}
