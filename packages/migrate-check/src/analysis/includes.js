/**
 * Reference resolution: finds the files that `<?xml-stylesheet href?>`,
 * `xsl:include` and `xsl:import` point at, inside the scanned directory.
 * Pure (no Node.js built-ins), so the analyze entry runs in a browser too.
 *
 * @module xslt-migrate-check/analysis/includes
 */

const URL_PATTERN = /^[a-z][\w+.-]*:/i;

/**
 * Normalize a `/`-separated relative path: drop `.` and empty segments and
 * fold `..` into its parent (leading `..` are kept), like posix.normalize.
 *
 * @param {string} path - A relative path
 * @returns {string} The normalized path, "." when nothing is left
 */
export function normalizePath(path) {
  const parts = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === ".." && parts.length > 0 && parts.at(-1) !== "..") {
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.join("/") || ".";
}

/**
 * The directory part of a report path ("." for a file at the top).
 *
 * @param {string} path - A report path
 * @returns {string} Its directory
 */
export function dirnameOf(path) {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "." : path.slice(0, slash);
}

/**
 * Resolve an href against the file that holds it, as a path relative to
 * the scanned directory. A leading `/` means the scanned directory.
 *
 * @param {string} from - Report path of the referring file
 * @param {string} href - The reference
 * @returns {string|null} The target's report path, or null for a URL or an
 *   empty href
 */
export function resolveHref(from, href) {
  if (href === "" || URL_PATTERN.test(href)) return null;
  const path = href.split(/[?#]/)[0];
  if (path.startsWith("/")) return normalizePath(path.slice(1));
  return normalizePath(`${dirnameOf(from)}/${path}`);
}

/**
 * Mark each xsl:include / xsl:import of the stylesheets with `found`:
 * true or false for a file reference, null for a URL (not checked).
 * The stylesheet entries are updated in place.
 *
 * @param {Array<{file: string, includes: Array<object>}>} stylesheets -
 *   Scanned stylesheets
 * @param {(path: string) => boolean} exists - Tells whether a report path
 *   is a file of the project
 * @returns {void}
 */
export function markIncludes(stylesheets, exists) {
  for (const sheet of stylesheets) {
    for (const include of sheet.includes) {
      const target = resolveHref(sheet.file, include.href);
      include.found = target === null ? null : exists(target);
    }
  }
}
