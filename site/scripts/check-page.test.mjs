// The online check page under jsdom: the layout's markup, js/check.js with
// the real vendor bundle, a dropped folder walked with webkitGetAsEntry,
// chosen files, the findings table, Copy report and Download HTML report.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { File } from "node:buffer";
import { SAMPLE_PROJECT } from "../../packages/migrate-check/test/sample.js";
import { startCheck } from "../templates/xslt-site/js/check-app.js";
import { drop, folderEntry, openPage, until } from "./check-page-helpers.mjs";
import { buildMigrateCheckBundle, MIGRATE_CHECK_BUNDLE } from "./vendor.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const layout = readFileSync(
  join(here, "../templates/xslt-site/layouts/check.html"),
  "utf8",
);
const main = layout.slice(
  layout.indexOf("<main"),
  layout.indexOf("</main>") + 7,
);
const outDir = mkdtempSync(join(tmpdir(), "check-page-"));
const bundle = join(outDir, MIGRATE_CHECK_BUNDLE);

before(async () => {
  await buildMigrateCheckBundle({
    entry: join(here, "migrate-check-entry.mjs"),
    outfile: bundle,
  });
});
after(() => {
  rmSync(outDir, { recursive: true, force: true });
  delete globalThis.window;
  delete globalThis.document;
});

describe("online check page", () => {
  let doc;
  const $ = (id) => doc.getElementById(id);
  const view = () => doc.defaultView;

  it("loads the checker and analyses a dropped folder", async () => {
    doc = openPage(main, pathToFileURL(bundle).href);
    await import("../templates/xslt-site/js/check.js");
    assert.equal($("ck-app").hidden, false);
    await until(() => $("ck-status").textContent.startsWith("Ready"));
    const project = {
      ...SAMPLE_PROJECT,
      "node_modules/x/index.js": "new XSLTProcessor()",
    };
    drop(doc, [
      {
        kind: "file",
        webkitGetAsEntry: () => folderEntry("shop", project),
        getAsFile: () => null,
      },
      { kind: "string" },
      // A file item the browser hands over neither as entry nor as file
      { kind: "file", getAsFile: () => null },
    ]);
    await until(() => !$("ck-result").hidden);
    assert.equal($("ck-percent").textContent, "90%");
    assert.deepEqual(
      [...$("ck-summary").children].map((li) => li.textContent),
      [
        "XSLTProcessor detected: yes",
        "xml-stylesheet detected: yes",
        "4 stylesheets",
        "9 compatible",
        "1 requires review",
      ],
    );
    assert.equal(
      $("ck-runtime").textContent,
      "@tradik/xslt-processor + @tradik/xslt3",
    );
    assert.deepEqual(
      [...doc.querySelectorAll("#ck-steps h4")].map((h) => h.textContent),
      [
        "Load @tradik/xslt-processor before your XSLTProcessor code",
        "Browser compatibility loader",
        "Add @tradik/xslt3 for the XSLT 2.0 and 3.0 stylesheets",
      ],
    );
    assert.match(
      $("ck-status").textContent,
      /^Checked 11 files: migration readiness 90%, 10 findings\.$/,
    );
    assert.equal($("ck-skipped").hidden, true);
    assert.equal(doc.activeElement, $("ck-result"));
  });

  it("filters and orders the findings table", () => {
    const rows = () => [...doc.querySelectorAll("#ck-findings tbody tr")];
    assert.equal(rows().length, 10);
    assert.equal(rows()[0].querySelector(".ck-badge").textContent, "HIGH");
    const filter = (rating) => doc.querySelector(`[data-filter="${rating}"]`);
    assert.equal(filter("LOW").textContent, "LOW (3)");
    filter("MEDIUM").click();
    assert.equal(rows().length, 1);
    assert.equal(filter("MEDIUM").getAttribute("aria-pressed"), "true");
    assert.match(
      rows()[0].textContent,
      /styles\/modern\.xslDeclares XSLT 2\.0/,
    );
    filter("ALL").click();
    $("ck-sort").click();
    assert.equal(rows()[0].querySelector(".ck-badge").textContent, "LOW");
    assert.equal(
      $("ck-sort").parentElement.getAttribute("aria-sort"),
      "ascending",
    );
  });

  it("copies the Markdown report and downloads the HTML report", async () => {
    let copied = "";
    Object.defineProperty(view().navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => (copied = text) },
    });
    $("ck-copy").click();
    await until(() => copied !== "");
    assert.match(copied, /^# XSLT migration check\n\nMigration readiness: 90%/);
    assert.equal(
      $("ck-action-status").textContent,
      "Report copied as Markdown.",
    );
    view().navigator.clipboard.writeText = () =>
      Promise.reject(new Error("denied"));
    $("ck-copy").click();
    await until(() =>
      $("ck-action-status").textContent.includes("did not allow"),
    );
    let blob = null;
    view().URL.createObjectURL = (value) => ((blob = value), "blob:report");
    let revoked = "";
    view().URL.revokeObjectURL = (url) => (revoked = url);
    $("ck-download").click();
    await until(() => blob !== null);
    assert.match(
      await blob.text(),
      /^<!doctype html>[\s\S]*Chrome 158 Migration Report/,
    );
    assert.match(
      $("ck-action-status").textContent,
      /xslt-migration-report\.html/,
    );
    await until(() => revoked === "blob:report");
  });

  it("reads chosen files and notes what it left out", async () => {
    const input = $("ck-files");
    const files = [
      new File([SAMPLE_PROJECT["styles/modern.xsl"]], "modern.xsl"),
      new File(["png"], "logo.png"),
      new File([new Uint8Array([60, 0, 62])], "data.xml"),
    ];
    Object.defineProperty(input, "files", { configurable: true, value: files });
    input.dispatchEvent(new (view().Event)("change"));
    await until(() => $("ck-percent").textContent === "0%");
    assert.match(
      $("ck-skipped").textContent,
      /^1 file left out: .* Not read: data\.xml \(binary\)\.$/,
    );
    doc.querySelector('[data-filter="LOW"]').click();
    assert.equal(
      doc.querySelector("#ck-findings tbody").textContent,
      "No finding with this rating.",
    );
  });

  it("explains a drop with nothing to read", async () => {
    const many = Array.from(
      { length: 12 },
      (_, i) => new File([new Uint8Array([0])], `${i}.xml`),
    );
    drop(
      doc,
      many.map((file) => ({ kind: "file", getAsFile: () => file })),
    );
    await until(() => !$("ck-error").hidden);
    assert.match(
      $("ck-error").textContent,
      /^None of these files is one the checker reads.*and 2 more\.$/,
    );
    assert.equal($("ck-status").textContent, "No result.");
  });

  it("says so when the checker cannot be loaded", async () => {
    doc = openPage(main, "/vendor/missing.js");
    startCheck($("ck-app"), Promise.reject(new Error("offline")));
    await until(() => !$("ck-error").hidden);
    assert.match($("ck-error").textContent, /could not be loaded/);
    drop(doc, []);
    await until(() => $("ck-status").textContent === "No result.");
  });
});
