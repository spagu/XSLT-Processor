/**
 * The website's online check (/check/) in a real browser: the built page
 * (site/public, `make site` first) is served on the test server's origin
 * through page.route, the sample project of xslt-migrate-check is given as
 * a folder, a zip and a drop, and the result must match the command line
 * (readiness 90%, 4 stylesheets, 9 compatible, 1 for review, three
 * recommendations). Requests to other origins are aborted, and any made
 * after the page has loaded fails the test: the files never leave the page.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { expect, test } from "@playwright/test";
import { SAMPLE_PROJECT } from "../../packages/migrate-check/test/sample.js";
import { makeZip } from "../../site/scripts/zip-fixture.mjs";

const siteRoot = join(import.meta.dirname, "..", "..", "site", "public");
const built = existsSync(join(siteRoot, "check", "index.html"));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

const STEPS = [
  "Load @tradik/xslt-processor before your XSLTProcessor code",
  "Browser compatibility loader",
  "Add @tradik/xslt3 for the XSLT 2.0 and 3.0 stylesheets",
];

/** The built site file for a URL path, or null. */
function siteFile(pathname) {
  const path = join(siteRoot, normalize(decodeURIComponent(pathname)));
  if (!path.startsWith(siteRoot)) return null;
  const file =
    existsSync(path) && statSync(path).isDirectory()
      ? join(path, "index.html")
      : path;
  return existsSync(file) ? file : null;
}

test.beforeEach(async ({ page, baseURL }) => {
  test.skip(!built, "build the site first: make site");
  const origin = new URL(baseURL).origin;
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const file = siteFile(url.pathname);
    if (!file) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({
      body: readFileSync(file),
      contentType: TYPES[extname(file)] ?? "application/octet-stream",
    });
  });
});

/** Open the page; collect every request to another origin after it loaded. */
async function openCheck(page, baseURL) {
  await page.goto("/check/", { waitUntil: "networkidle" });
  await expect(page.locator("#ck-status")).toHaveText(/^Ready\./);
  // The cookie banner shows where the geo lookup fails; reject analytics
  const reject = page.locator('.ssg-cc [data-act="reject"]');
  if (await reject.isVisible()) await reject.click();
  const origin = new URL(baseURL).origin;
  const thirdParty = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== origin) {
      thirdParty.push(request.url());
    }
  });
  return thirdParty;
}

/** The result must be the command line's for the sample project. */
async function expectSampleResult(page) {
  await expect(page.locator("#ck-result")).toBeVisible();
  await expect(page.locator("#ck-result-title")).toHaveText(
    "Migration readiness: 90%",
  );
  await expect(page.locator("#ck-summary li")).toHaveText([
    "XSLTProcessor detected: yes",
    "xml-stylesheet detected: yes",
    "4 stylesheets",
    "9 compatible",
    "1 requires review",
  ]);
  await expect(page.locator("#ck-runtime")).toHaveText(
    "@tradik/xslt-processor + @tradik/xslt3",
  );
  await expect(page.locator("#ck-steps h4")).toHaveText(STEPS);
  await expect(page.locator("#ck-findings tbody tr")).toHaveCount(10);
}

const sampleFiles = Object.entries(SAMPLE_PROJECT);

test("a chosen folder: the sample project's numbers, nothing sent", async ({
  page,
  baseURL,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "folder upload of webkitdirectory inputs",
  );
  const dir = mkdtempSync(join(tmpdir(), "check-folder-"));
  try {
    for (const [path, text] of sampleFiles) {
      mkdirSync(dirname(join(dir, "shop", path)), { recursive: true });
      writeFileSync(join(dir, "shop", path), text);
    }
    const thirdParty = await openCheck(page, baseURL);
    await page.locator("#ck-folder").setInputFiles(join(dir, "shop"));
    await expectSampleResult(page);
    expect(thirdParty).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a zip archive: inflated in the browser", async ({ page, baseURL }) => {
  const thirdParty = await openCheck(page, baseURL);
  const zip = makeZip([
    { name: "shop/", data: "" },
    ...sampleFiles.map(([path, text]) => ({
      name: `shop/${path}`,
      data: text,
    })),
    { name: "shop/node_modules/lib/index.js", data: "new XSLTProcessor()" },
    {
      name: "shop/logo.png",
      data: new Uint8Array([137, 80, 78, 71, 0]),
      method: "store",
    },
  ]);
  await page.locator("#ck-files").setInputFiles({
    name: "shop.zip",
    mimeType: "application/zip",
    buffer: zip,
  });
  await expectSampleResult(page);
  await expect(page.locator("#ck-skipped")).toHaveText(/^2 files left out/);
  await page.locator('[data-filter="MEDIUM"]').click();
  await expect(page.locator("#ck-findings tbody tr")).toHaveText([
    /styles\/modern\.xsl/,
  ]);
  expect(thirdParty).toEqual([]);
});

test("dropped files, and an error for a damaged zip", async ({
  page,
  baseURL,
}) => {
  const thirdParty = await openCheck(page, baseURL);
  const dropFiles = (files) =>
    page.evaluate((list) => {
      const transfer = new window.DataTransfer();
      for (const [name, text] of list) {
        transfer.items.add(new window.File([text], name));
      }
      const zone = document.getElementById("ck-drop");
      zone.dispatchEvent(
        new window.DragEvent("drop", {
          dataTransfer: transfer,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, files);
  await dropFiles(
    sampleFiles.map(([path, text]) => [path.split("/").pop(), text]),
  );
  await expect(page.locator("#ck-result-title")).toHaveText(
    "Migration readiness: 90%",
  );
  await expect(page.locator("#ck-steps h4")).toHaveText(STEPS);
  await dropFiles([["broken.zip", "PK not really"]]);
  await expect(page.locator("#ck-error")).toHaveText(
    /broken\.zip \(not a zip archive\)/,
  );
  expect(thirdParty).toEqual([]);
});
