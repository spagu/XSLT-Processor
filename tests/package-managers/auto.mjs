/**
 * Package-manager smoke test of `xsltVersion: "auto"`. With the argument
 * "missing" (@tradik/xslt3 not installed) loading the XSLT 2.0 engine must
 * fail with the "install @tradik/xslt3" message, not a resolution crash;
 * with "present" a version="2.0" stylesheet must run. Copied into a
 * temporary project by scripts/package-managers.mjs.
 */

import { JSDOM } from "jsdom";
import { XSLTProcessor } from "@tradik/xslt-processor";

const expectation = process.argv[2];
const { window } = new JSDOM("<!DOCTYPE html><html><body></body></html>");
const parse = (xml) =>
  new window.DOMParser().parseFromString(xml, "application/xml");
const stylesheet =
  parse(`<xsl:stylesheet version="2.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="text"/>
  <xsl:template match="/"><xsl:value-of select="string-join(//n, '-')"/></xsl:template>
</xsl:stylesheet>`);

const processor = new XSLTProcessor({ xsltVersion: "auto" });

if (expectation === "missing") {
  const error = await processor.importStylesheetAsync(stylesheet).then(
    () => null,
    (reason) => reason,
  );
  if (!error?.message.includes("install @tradik/xslt3")) {
    throw new Error(`expected the install message, got: ${error?.stack}`);
  }
  process.stdout.write("ok missing\n");
} else {
  await processor.importStylesheetAsync(stylesheet);
  const result = processor.transformToString(parse("<r><n>a</n><n>b</n></r>"));
  if (result.trim() !== "a-b") {
    throw new Error(`unexpected XSLT 2.0 result: ${result}`);
  }
  process.stdout.write("ok present\n");
}
