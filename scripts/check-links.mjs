#!/usr/bin/env node
/**
 * Check relative links and #anchors in the repository's Markdown files.
 *
 * Anchors follow GitHub's heading slug rules: lower-case, punctuation other
 * than hyphens and underscores removed, spaces turned into hyphens, and
 * duplicate headings numbered `-1`, `-2`, ... Links inside code are ignored.
 *
 * Usage: node scripts/check-links.mjs [file.md ...]
 * Without arguments it checks README.md, SECURITY.md, CONTRIBUTORS.md,
 * CHANGELOG.md and docs/*.md. Exits with 1 when a link is broken.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Remove fenced code blocks and inline code spans from Markdown.
 *
 * @param {string} text - Markdown source
 * @returns {string} The text without code
 */
function stripCode(text) {
  return text.replace(/^(```|~~~)[\s\S]*?^\1/gm, "").replace(/`[^`\n]*`/g, "");
}

/**
 * GitHub-style anchors of every heading in a Markdown file.
 *
 * @param {string} text - Markdown source
 * @returns {Set<string>} The anchors
 */
export function headingAnchors(text) {
  const anchors = new Set();
  const seen = new Map();
  for (const line of stripCode(text).split("\n")) {
    const match = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const base = match[1]
      .replace(/<[^>]+>/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

/**
 * Broken relative links of one Markdown file.
 *
 * @param {string} file - Path of the Markdown file
 * @returns {string[]} Human readable problems
 */
export function brokenLinks(file) {
  const text = readFileSync(file, "utf8");
  const problems = [];
  for (const [, target] of stripCode(text).matchAll(
    /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
  )) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // http:, mailto:, ...
    const [path, anchor] = target.split("#");
    const targetFile = path
      ? resolve(dirname(file), decodeURIComponent(path))
      : resolve(file);
    if (!existsSync(targetFile)) {
      problems.push(`${file}: missing file ${target}`);
    } else if (anchor && targetFile.endsWith(".md")) {
      if (!headingAnchors(readFileSync(targetFile, "utf8")).has(anchor)) {
        problems.push(`${file}: missing anchor ${target}`);
      }
    }
  }
  return problems;
}

const defaults = ["README.md", "SECURITY.md", "CONTRIBUTORS.md", "CHANGELOG.md"]
  .filter((f) => existsSync(f))
  .concat(
    existsSync("docs")
      ? readdirSync("docs")
          .filter((f) => f.endsWith(".md"))
          .map((f) => join("docs", f))
      : [],
  );
const files = process.argv.slice(2).length ? process.argv.slice(2) : defaults;
const problems = files.flatMap(brokenLinks);
problems.forEach((p) => console.error(p));
console.log(`${files.length} files checked, ${problems.length} broken links`);
process.exit(problems.length ? 1 : 0);
