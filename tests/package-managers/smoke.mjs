/**
 * Package-manager smoke test, ES modules: install a jsdom window as globals
 * (as tests/cjs-smoke.cjs does), import the package (the `import` condition)
 * and its `/polyfill` entry, check that the polyfill installed
 * globalThis.XSLTProcessor, and run a transformation through it. Copied
 * into a temporary project by scripts/package-managers.mjs.
 */

import { JSDOM } from "jsdom";

const { window } = new JSDOM("<!DOCTYPE html><html><body></body></html>");
globalThis.document = window.document;
globalThis.DOMParser = window.DOMParser;
globalThis.XMLSerializer = window.XMLSerializer;

const { XSLTProcessor, VERSION } = await import("@tradik/xslt-processor");
await import("@tradik/xslt-processor/polyfill");

if (globalThis.XSLTProcessor !== XSLTProcessor) {
  throw new Error("the polyfill did not install globalThis.XSLTProcessor");
}

const parse = (xml) => new DOMParser().parseFromString(xml, "application/xml");
const processor = new globalThis.XSLTProcessor();
processor.importStylesheet(
  parse(`<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
    <xsl:template match="/"><p><xsl:value-of select="/greeting"/></p></xsl:template>
  </xsl:stylesheet>`),
);
const fragment = processor.transformToFragment(
  parse("<greeting>hello</greeting>"),
  document,
);

if (fragment.textContent !== "hello") {
  throw new Error(`unexpected ES module result: ${fragment.textContent}`);
}
process.stdout.write(`ok ${VERSION}\n`);
