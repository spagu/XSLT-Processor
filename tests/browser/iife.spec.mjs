/**
 * The IIFE (CDN) bundles: global XsltProcessorLib and installGlobal().
 */

import { expect, test } from "@playwright/test";
import { IIFE_PAGE, openPage } from "./helpers.mjs";

/** Collect the global state a <script> include leaves behind. */
function globalState() {
  const lib = window.XsltProcessorLib;
  return {
    libType: typeof lib,
    version: lib?.VERSION,
    hasNative: window.NativeXSLTProcessor !== null,
    nativeSupported: lib.isNativeXSLTSupported(),
    globalIsLibrary: window.XSLTProcessor === lib.XSLTProcessor,
    globalIsNative:
      window.NativeXSLTProcessor !== null &&
      window.XSLTProcessor === window.NativeXSLTProcessor,
  };
}

for (const variant of ["", "min"]) {
  const label = variant === "min" ? "minified bundle" : "bundle";

  test(`${label}: exposes XsltProcessorLib and keeps a working native`, async ({
    page,
  }) => {
    await openPage(page, `${IIFE_PAGE}${variant ? "?min" : ""}`);
    const state = await page.evaluate(globalState);

    expect(state.libType).toBe("object");
    expect(state.version).toMatch(/^\d+\.\d+\.\d+/);
    // The footer calls installGlobal(): it only replaces a missing or broken
    // native processor.
    expect(state.nativeSupported).toBe(state.hasNative);
    expect(state.globalIsLibrary).toBe(!state.nativeSupported);
    expect(state.globalIsNative).toBe(state.nativeSupported);
    test.info().annotations.push({
      type: "native XSLTProcessor",
      description: state.hasNative ? "present" : "absent",
    });
  });

  test(`${label}: installs itself when the browser has no XSLTProcessor`, async ({
    page,
  }) => {
    await openPage(page, `${IIFE_PAGE}?noNative${variant ? "&min" : ""}`);
    const result = await page.evaluate(() => {
      const processor = new window.XSLTProcessor();
      processor.importStylesheet(
        new DOMParser().parseFromString(
          `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
             <xsl:output method="html"/>
             <xsl:template match="/"><p class="ok">installed</p></xsl:template>
           </xsl:stylesheet>`,
          "application/xml",
        ),
      );
      const fragment = processor.transformToFragment(
        new DOMParser().parseFromString("<x/>", "application/xml"),
        document,
      );
      document.getElementById("out").replaceChildren(fragment);
      const paragraph = document.querySelector("#out p.ok");
      return {
        globalIsLibrary:
          window.XSLTProcessor === window.XsltProcessorLib.XSLTProcessor,
        nativeSupported: window.XsltProcessorLib.isNativeXSLTSupported(),
        isParagraph: paragraph instanceof HTMLParagraphElement,
        text: paragraph?.textContent,
      };
    });

    expect(result).toEqual({
      globalIsLibrary: true,
      nativeSupported: false,
      isParagraph: true,
      text: "installed",
    });
  });
}

test("installGlobal(true) replaces a working native and still detects it", async ({
  page,
}) => {
  await openPage(page, IIFE_PAGE);
  const result = await page.evaluate(() => {
    const lib = window.XsltProcessorLib;
    const installed = lib.installGlobal(true);
    return {
      installed,
      globalIsLibrary: window.XSLTProcessor === lib.XSLTProcessor,
      hasNative: window.NativeXSLTProcessor !== null,
      // The original native constructor is probed, never the library
      nativeSupported: lib.isNativeXSLTSupported(),
    };
  });

  expect(result.installed).toBe(true);
  expect(result.globalIsLibrary).toBe(true);
  expect(result.nativeSupported).toBe(result.hasNative);
});
