/**
 * Optional modules of the test mode (the library, jsdom, @tradik/xslt3,
 * Playwright): resolved from the scanned project first, then from this
 * package, and imported only when found.
 *
 * @module xslt-migrate-check/compat/engines/load
 */

import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Resolve a package.
 *
 * @param {string} name - Package name
 * @param {string} projectDir - The scanned directory
 * @param {string[]} [bases] - Where to resolve from (the project, then
 *   this package)
 * @returns {string|null} The module's file URL, null when not installed
 */
export function resolvePackage(
  name,
  projectDir,
  bases = [join(resolve(projectDir), "package.json"), import.meta.url],
) {
  for (const base of bases) {
    try {
      return pathToFileURL(createRequire(base).resolve(name)).href;
    } catch {
      // not installed there; try the next base
    }
  }
  return null;
}

/**
 * @callback ModuleLoader
 * @param {string} name - Package name
 * @param {string} projectDir - The scanned directory
 * @returns {Promise<object|null>} The module namespace, null when missing
 */

/**
 * Import a package when it is installed.
 *
 * @type {ModuleLoader}
 */
export async function loadModule(name, projectDir) {
  const url = resolvePackage(name, projectDir);
  return url ? import(url) : null;
}

/**
 * Read a named export of a module that may be CommonJS (the export then
 * sits on `default`).
 *
 * @param {object} module - Module namespace
 * @param {string} name - Export name
 * @returns {unknown} The export, undefined when absent
 */
export function exportOf(module, name) {
  return module[name] ?? module.default?.[name];
}
