/**
 * `<?xml-stylesheet?>` in a browser without XSLT: the `chromium-noxslt`
 * project runs Chromium with Blink's XSLT feature disabled, which is what
 * Chrome 158 ships. The XML document's one-line XHTML script loads the
 * bundle, which applies the stylesheet and replaces the document.
 */

import { expect, test } from "@playwright/test";

const XHTML = "http://www.w3.org/1999/xhtml";

test.beforeEach(() => {
  test.skip(
    test.info().project.name !== "chromium-noxslt",
    "needs Chromium with XSLT disabled",
  );
});

test("the browser has no XSLT of its own", async ({ page }) => {
  await page.goto("/tests/browser/fixtures/esm.html");
  expect(await page.evaluate(() => typeof window.XSLTProcessor)).toBe(
    "undefined",
  );
});

test("an XML document with <?xml-stylesheet?> renders through the bundle", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixtures/pi.xml");
  await page.waitForSelector("#items li", { timeout: 10_000 });
  const result = await page.evaluate(() => ({
    rootName: document.documentElement.localName,
    rootNamespace: document.documentElement.namespaceURI,
    contentType: document.contentType,
    title: document.title,
    items: Array.from(
      document.querySelectorAll("#items li"),
      (li) => li.textContent,
    ),
    count: document.getElementById("count").textContent,
    resultScriptRan: window.resultScriptRan === true,
    globalInstalled: typeof window.XSLTProcessor,
  }));
  expect(result).toEqual({
    rootName: "html",
    rootNamespace: XHTML,
    contentType: "application/xml",
    title: "Catalog (2)",
    items: ["Apples", "Pears & quinces"],
    // catalog + 2 items: the XHTML script element is not part of the source
    count: "3 source elements",
    resultScriptRan: true,
    globalInstalled: "function",
  });
});
