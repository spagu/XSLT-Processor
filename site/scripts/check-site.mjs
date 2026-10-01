#!/usr/bin/env node
/**
 * Checks of the built site, run after ssg by `make site` and in CI:
 *
 * - every internal link and asset resolves to a file, and every #anchor to
 *   an id on the target page (the site is served under a path prefix, which
 *   ssg's own link check does not know about);
 * - every page has the maintainer's required head: title, description,
 *   canonical, Open Graph, Twitter card, theme-color and both halves of the
 *   Google Tag Manager snippet;
 * - accessibility basics: lang, one <main>, one <h1>, no skipped heading
 *   levels, alt on every image, a title on every iframe;
 * - WCAG 2.2 contrast of the colour pairs of css/tokens.css (or its
 *   fingerprinted css/tokens.<hash>.css), light and dark.
 *
 * Usage: node site/scripts/check-site.mjs <output dir> [path prefix]
 * Exits with 1 and lists the problems when a check fails.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { URL } from "node:url";
import { JSDOM } from "jsdom";
import { contrastProblems, parseTokens } from "./contrast.mjs";

const REQUIRED_META = [
  'meta[name="description"]',
  'link[rel="canonical"]',
  'meta[name="viewport"]',
  'meta[name="theme-color"]',
  'meta[property="og:title"]',
  'meta[property="og:description"]',
  'meta[property="og:url"]',
  'meta[property="og:image"]',
  'meta[property="og:type"]',
  'meta[name="twitter:card"]',
  'meta[name="twitter:title"]',
  'meta[name="twitter:description"]',
];

/**
 * All HTML files below a directory.
 *
 * @param {string} dir - Directory
 * @returns {string[]} File paths
 */
function htmlFiles(dir) {
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
 * Check one page's head, landmarks and headings.
 *
 * @param {Document} doc - Parsed page
 * @returns {string[]} Problems
 */
export function pageProblems(doc) {
  const problems = [];
  if (!doc.documentElement.getAttribute("lang")) {
    problems.push("missing <html lang>");
  }
  if (!doc.title.trim()) problems.push("empty <title>");
  for (const selector of REQUIRED_META) {
    const el = doc.querySelector(selector);
    const value = el && (el.getAttribute("content") ?? el.getAttribute("href"));
    if (!value || !value.trim()) problems.push(`missing ${selector}`);
  }
  const scripts = [...doc.querySelectorAll("head script")].map(
    (s) => s.textContent,
  );
  if (!scripts.some((s) => s.includes("googletagmanager.com/gtm.js"))) {
    problems.push("missing Google Tag Manager <script> in <head>");
  }
  const noscript = doc.body.querySelector("noscript");
  if (
    !noscript ||
    !noscript.innerHTML.includes("googletagmanager.com/ns.html")
  ) {
    problems.push("missing Google Tag Manager <noscript> in <body>");
  }
  if (doc.querySelectorAll("main").length !== 1) {
    problems.push("expected exactly one <main>");
  }
  if (doc.querySelectorAll("h1").length !== 1) {
    problems.push("expected exactly one <h1>");
  }
  let previous = 1;
  for (const heading of doc.querySelectorAll(
    "main h1, main h2, main h3, main h4, main h5, main h6",
  )) {
    const level = Number(heading.tagName[1]);
    if (level > previous + 1) {
      problems.push(
        `heading level skipped: <${heading.tagName.toLowerCase()}> "${heading.textContent.trim()}"`,
      );
    }
    previous = level;
  }
  for (const img of doc.querySelectorAll("img:not([alt])")) {
    problems.push(`image without alt: ${img.getAttribute("src")}`);
  }
  for (const frame of doc.querySelectorAll("iframe:not([title])")) {
    problems.push(`iframe without title: ${frame.id}`);
  }
  return problems;
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

/**
 * Run all checks on a built site.
 *
 * @param {string} root - Output directory
 * @param {string} [prefix=""] - Path prefix the site is served under
 * @param {string} tokensCss - Contents of css/tokens.css (fingerprinted or not)
 * @returns {string[]} Problems
 */
/**
 * Path of a built asset by its source name: the file itself, or the
 * fingerprinted copy ssg writes with `fingerprint: true` (name.<hash8>.ext).
 *
 * @param {string} root - Output directory of the site
 * @param {string} asset - Asset path relative to the root, e.g. "css/tokens.css"
 * @returns {string} Absolute path of the built file
 * @throws {Error} When neither form exists
 */
export function assetPath(root, asset) {
  const plain = join(root, asset);
  if (existsSync(plain)) return plain;
  const dir = dirname(plain);
  const ext = extname(asset);
  const stem = basename(asset, ext);
  const found =
    existsSync(dir) &&
    readdirSync(dir).find(
      (name) =>
        name.startsWith(`${stem}.`) &&
        name.endsWith(ext) &&
        /^[0-9a-f]{8}$/.test(name.slice(stem.length + 1, -ext.length)),
    );
  if (!found) throw new Error(`${asset} not found in ${root}`);
  return join(dir, found);
}

export function checkSite(
  root,
  prefix = "",
  tokensCss = readFileSync(assetPath(root, "css/tokens.css"), "utf8"),
) {
  const docs = new Map(
    htmlFiles(root).map((file) => [
      file,
      new JSDOM(readFileSync(file, "utf8")).window.document,
    ]),
  );
  const problems = [];
  for (const [file, doc] of docs) {
    for (const problem of pageProblems(doc)) {
      problems.push(`${relative(root, file)}: ${problem}`);
    }
  }
  problems.push(...linkProblems(root, prefix, docs));
  problems.push(...contrastProblems(parseTokens(tokensCss)));
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [root, prefix = ""] = process.argv.slice(2);
  if (!root) {
    console.error(
      "Usage: node site/scripts/check-site.mjs <output dir> [path prefix]",
    );
    process.exit(2);
  }
  const problems = checkSite(root, prefix.replace(/\/$/, ""));
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    console.error(`\n${problems.length} problem(s) in ${root}`);
    process.exit(1);
  }
  console.log(
    `Site checks passed: ${htmlFiles(root).length} pages in ${root}.`,
  );
}
