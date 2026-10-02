/**
 * The engine under test: @tradik/xslt-processor on jsdom, both optional
 * peer dependencies loaded at run time. With @tradik/xslt3 installed the
 * processor runs in `xsltVersion: "auto"` mode.
 *
 * @module xslt-migrate-check/compat/engines/tradik
 */

import { join, resolve } from "node:path";
import { URL, pathToFileURL } from "node:url";
import { createDomTools } from "../dom.js";
import { readConfined } from "./files.js";
import { exportOf, loadModule } from "./load.js";

/** The command that runs the test mode with its peers. */
export const NPX_COMMAND =
  "npx -p xslt-migrate-check -p @tradik/xslt-processor -p jsdom xslt-migrate-test .";

/**
 * Parse XML, failing with the parser's message.
 *
 * @param {object} window - jsdom window
 * @param {string} text - XML text
 * @param {string} label - File name for the message
 * @returns {Document} The document
 */
function parseXml(window, text, label) {
  const doc = new window.DOMParser().parseFromString(text, "application/xml");
  const error = doc.getElementsByTagName("parsererror")[0];
  if (error) {
    throw new Error(`${label} is not well-formed: ${error.textContent.trim()}`);
  }
  return doc;
}

/**
 * Create the Tradik engine.
 *
 * @param {{XSLTProcessor: Function, JSDOM: Function, auto: boolean}} parts -
 *   The library's processor, jsdom's class, and whether to run in auto mode
 * @returns {{name: string, tools: object, transform: Function}} The engine
 *   and the DOM tools of the comparison
 */
export function createTradikEngine({ XSLTProcessor, JSDOM, auto }) {
  const tools = createDomTools(JSDOM);
  const { window } = tools;
  // The library builds result documents through these globals
  globalThis.document = window.document;
  globalThis.DOMParser = window.DOMParser;
  globalThis.XMLSerializer = window.XMLSerializer;
  return {
    name: auto ? "Tradik (xsltVersion: auto)" : "Tradik",
    tools,
    /**
     * Run one pair.
     *
     * @param {{xml: string, xsl: string, params: object}} pair - The pair
     * @param {string} rootDir - The scanned directory
     * @returns {Promise<string>} The serialized result
     */
    async transform({ xml, xsl, params }, rootDir) {
      const root = pathToFileURL(join(resolve(rootDir), "/")).href;
      const base = new URL(xsl, root).href;
      const xmlDoc = parseXml(window, readConfined(rootDir, xml, root), xml);
      const xslDoc = parseXml(window, readConfined(rootDir, xsl, root), xsl);
      const processor = new XSLTProcessor({
        xsltVersion: auto ? "auto" : "1.0",
      });
      processor.setStylesheetLoader((href, uri) =>
        readConfined(rootDir, href, uri ?? base),
      );
      processor.setDocumentLoader((href, uri) => {
        try {
          return readConfined(rootDir, href, uri ?? base);
        } catch {
          return null;
        }
      });
      processor.importStylesheet(xslDoc, base);
      for (const [name, value] of Object.entries(params)) {
        processor.setParameter(null, name, value);
      }
      return processor.transformAsync(xmlDoc);
    },
  };
}

/**
 * Load the Tradik engine from the project (or this package's peers).
 *
 * @param {string} projectDir - The scanned directory
 * @param {import("./load.js").ModuleLoader} [load] - Module loader
 * @returns {Promise<object|null>} The engine, null when the library or
 *   jsdom is missing
 */
export async function loadTradik(projectDir, load = loadModule) {
  const [library, jsdom] = await Promise.all([
    load("@tradik/xslt-processor", projectDir),
    load("jsdom", projectDir),
  ]);
  if (!library || !jsdom) return null;
  const XSLTProcessor = exportOf(library, "XSLTProcessor");
  let auto = true;
  try {
    await XSLTProcessor.preload();
  } catch {
    auto = false;
  }
  return createTradikEngine({
    XSLTProcessor,
    JSDOM: exportOf(jsdom, "JSDOM"),
    auto,
  });
}
