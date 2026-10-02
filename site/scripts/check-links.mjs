/**
 * Links of the built site: every href/src that points into the site must
 * reach a file, and every #anchor an element with that id.
 *
 * @module check-links
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { URL } from "node:url";

/**
 * All HTML files below a directory.
 *
 * @param {string} dir - Directory
 * @returns {string[]} File paths
 */
export function htmlFiles(dir) {
  return readdirSync(dir, { recursive: true })
    .map((name) => join(dir, name))
    .filter((path) => path.endsWith(".html") && statSync(path).isFile());
}

/**
 * The output file a site URL path is served from, or null.
 *
 * @param {string} root - Output directory
 * @param {string} path - URL path below the prefix, starting with "/"
 * @returns {string|null} File path
 */
function fileFor(root, path) {
  const target = join(root, decodeURIComponent(path));
  if (path.endsWith("/")) {
    return existsSync(join(target, "index.html"))
      ? join(target, "index.html")
      : null;
  }
  if (existsSync(target) && statSync(target).isFile()) return target;
  return existsSync(join(target, "index.html"))
    ? join(target, "index.html")
    : null;
}

/**
 * Check every link, asset reference and anchor of the site.
 *
 * @param {string} root - Output directory
 * @param {string} prefix - Path prefix the site is served under ("" at a root)
 * @param {Map<string, Document>} docs - Parsed pages by file path
 * @returns {string[]} Problems
 */
export function linkProblems(root, prefix, docs) {
  const problems = [];
  for (const [file, doc] of docs) {
    const pageUrl = new URL(
      `https://site.test${prefix}/${relative(root, file).replace(/index\.html$/, "")}`,
    );
    for (const el of doc.querySelectorAll("[href], [src]")) {
      const raw = el.getAttribute("href") ?? el.getAttribute("src");
      if (el.tagName === "LINK" && el.getAttribute("rel") === "preconnect") {
        continue;
      }
      const url = new URL(raw, pageUrl);
      if (url.host !== "site.test") continue;
      if (!url.pathname.startsWith(`${prefix}/`)) {
        problems.push(`${relative(root, file)}: ${raw} is outside ${prefix}/`);
        continue;
      }
      const target = fileFor(root, url.pathname.slice(prefix.length));
      if (!target) {
        problems.push(`${relative(root, file)}: broken link ${raw}`);
      } else if (url.hash.length > 1 && docs.has(target)) {
        const id = decodeURIComponent(url.hash.slice(1));
        if (!docs.get(target).getElementById(id)) {
          problems.push(`${relative(root, file)}: missing anchor ${raw}`);
        }
      }
    }
  }
  return problems;
}
