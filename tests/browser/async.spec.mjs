/**
 * Asynchronous and streaming API in a real browser, through the ESM bundle:
 * importStylesheetAsync/transformAsync with the default fetch loader, and
 * transformToStream piped through the browser's own stream classes.
 */

import { expect, test } from "@playwright/test";
import { ESM_PAGE, openPage } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  await openPage(page, ESM_PAGE);
});

test("transformAsync loads imports and document() with fetch", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { XSLTProcessor } = window.lib;
    const base = new URL("async/", location.href).href;
    const processor = new XSLTProcessor();
    const source = new window.Blob(["<list><item/><item/></list>"]).stream();
    return processor.transformAsync(source, {
      stylesheet: (await fetch(`${base}main.xsl`)).body,
      stylesheetUri: `${base}main.xsl`,
    });
  });
  expect(result).toBe("imported|Zürich|2");
});

test("transformToStream yields bounded chunks and can be aborted", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { XSLTProcessor } = window.lib;
    const { parseXml } = window.harness;
    const processor = new XSLTProcessor();
    processor.importStylesheet(
      parseXml(`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:output omit-xml-declaration="yes"/>
        <xsl:template match="/"><out><xsl:for-each select="//i"><v><xsl:value-of select="."/></v></xsl:for-each></out></xsl:template>
      </xsl:stylesheet>`),
    );
    const source = parseXml(`<r>${"<i>é</i>".repeat(5000)}</r>`);

    const bytes = await new window.Response(
      processor
        .transformToStream(source, { chunkSize: 1024 })
        .pipeThrough(new window.TextEncoderStream()),
    ).arrayBuffer();
    const text = new window.TextDecoder().decode(bytes);

    const controller = new window.AbortController();
    const reader = processor
      .transformToStream(source, { chunkSize: 256, signal: controller.signal })
      .getReader();
    const first = await reader.read();
    controller.abort(new Error("stopped"));
    const aborted = await reader.read().then(
      () => "not aborted",
      (error) => error.message,
    );

    return {
      same: text === processor.transformToString(source),
      length: text.length,
      firstLength: first.value.length,
      aborted,
    };
  });
  expect(result).toEqual({
    same: true,
    length: 11 + 5000 * 8,
    firstLength: 256,
    aborted: "stopped",
  });
});
