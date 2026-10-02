/**
 * Shared test helper: builds a throw-away project tree in the system's
 * temporary directory. Holds no tests of its own.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Create a temporary directory holding the given files.
 *
 * @param {Record<string, string|Buffer>} files - Relative path to content
 * @returns {Promise<string>} The directory
 */
export async function createFixture(files = {}) {
  const dir = await mkdtemp(join(tmpdir(), "xslt-migrate-check-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(dir, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return dir;
}

/**
 * Delete a fixture directory.
 *
 * @param {string} dir - Directory from createFixture
 * @returns {Promise<void>} Resolves when removed
 */
export async function removeFixture(dir) {
  await rm(dir, { recursive: true, force: true });
}

/** A stylesheet of the given version with optional extra markup. */
export function stylesheetXml(version = "1.0", extra = "") {
  const attribute = version ? ` version="${version}"` : "";
  return `<?xml version="1.0"?>\n<xsl:stylesheet${attribute} xmlns:xsl="http://www.w3.org/1999/XSL/Transform">\n${extra}\n<xsl:template match="/"><p>x</p></xsl:template>\n</xsl:stylesheet>\n`;
}

/** An XML document with an xml-stylesheet processing instruction. */
export function renderedXml(type = "text/xsl", href = "style.xsl") {
  return `<?xml version="1.0"?>\n<?xml-stylesheet type="${type}" href="${href}"?>\n<root/>\n`;
}

/** A fresh ScanResult with the given lists. */
export function scanResult(overrides = {}) {
  return {
    scannedFiles: 0,
    usages: [],
    domParser: [],
    stylesheets: [],
    xmlDocuments: [],
    migrated: [],
    serverSide: [],
    ...overrides,
  };
}

/** Stylesheet facts as detectStylesheet returns them, with overrides. */
export function sheetFacts(overrides = {}) {
  return {
    file: "s.xsl",
    version: "1.0",
    exslt: false,
    disableOutputEscaping: false,
    documentFunction: false,
    key: false,
    msxml: false,
    exsltModules: [],
    unsupportedExslt: [],
    msxmlScript: false,
    msxmlFunctions: [],
    extensionFunctions: [],
    extensionNamespaces: [],
    includes: [],
    ...overrides,
  };
}

/** A usage entry of a ScanResult. */
export function usage(file, line, method = "XSLTProcessor") {
  return { file, line, text: `call ${method}`, method };
}
