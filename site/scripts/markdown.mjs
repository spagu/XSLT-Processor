/**
 * Markdown helpers for turning the repository's README.md, CHANGELOG.md and
 * docs/*.md into site content: headings, sections, descriptions, inline
 * rendering and link rewriting. Pure functions only, so they are unit tested
 * in markdown.test.mjs without touching the filesystem.
 *
 * @module site/scripts/markdown
 */

import { posix } from "node:path";

const FENCE = /^(```|~~~)/;

/**
 * Split Markdown into lines, marking which lines sit inside fenced code.
 *
 * @param {string} text - Markdown source
 * @returns {{ line: string, code: boolean }[]} Lines with a code flag
 */
export function classifyLines(text) {
  let fence = null;
  return text.split("\n").map((line) => {
    const match = FENCE.exec(line.trim());
    if (fence) {
      if (match && line.trim().startsWith(fence)) fence = null;
      return { line, code: true };
    }
    if (match) {
      fence = match[1];
      return { line, code: true };
    }
    return { line, code: false };
  });
}

/**
 * The text of the first level-one heading, or null.
 *
 * @param {string} text - Markdown source
 * @returns {string|null} The title
 */
export function firstHeading(text) {
  for (const { line, code } of classifyLines(text)) {
    const match = !code && /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) return match[1];
  }
  return null;
}

/**
 * Remove the first level-one heading; the site renders the title itself.
 *
 * @param {string} text - Markdown source
 * @returns {string} The Markdown without its title line
 */
export function stripTitle(text) {
  const lines = classifyLines(text);
  const index = lines.findIndex(
    ({ line, code }) => !code && /^#\s+/.test(line),
  );
  if (index === -1) return text;
  return lines
    .filter((_, i) => i !== index)
    .map(({ line }) => line)
    .join("\n")
    .replace(/^\s*\n/, "");
}

/**
 * Level-two sections of a document, keyed by heading text. Each body runs to
 * the next level-two heading and keeps its level-three subsections.
 *
 * @param {string} text - Markdown source
 * @returns {Map<string, string>} Heading text to section body
 */
export function sections(text) {
  const result = new Map();
  let current = null;
  let body = [];
  const flush = () => {
    if (current !== null) result.set(current, body.join("\n").trim());
  };
  for (const { line, code } of classifyLines(text)) {
    const match = !code && /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      flush();
      current = match[1];
      body = [];
    } else if (current !== null) {
      body.push(line);
    }
  }
  flush();
  return result;
}

/**
 * Level-three subsections of a section body, keyed by heading text.
 *
 * @param {string} text - Section body
 * @returns {Map<string, string>} Heading text to subsection body
 */
export function subsections(text) {
  return sections(
    classifyLines(text)
      .map(({ line, code }) => (!code ? line.replace(/^###\s/, "## ") : line))
      .join("\n"),
  );
}

/**
 * Strip inline Markdown so a sentence can be used as plain text (meta
 * descriptions, card titles).
 *
 * @param {string} text - Inline Markdown
 * @returns {string} Plain text
 */
export function plainText(text) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|\W)[*_](.+?)[*_](?=\W|$)/g, "$1$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Shorten text to at most `max` characters on a word boundary.
 *
 * @param {string} text - Plain text
 * @param {number} [max=160] - Maximum length, including the ellipsis
 * @returns {string} The text, shortened with an ellipsis when needed
 */
export function truncate(text, max = 160) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

/**
 * The first prose paragraph as plain text: headings, badges, block quotes,
 * tables, lists, HTML and code are skipped. With `minLength`, following
 * paragraphs are appended until the text is at least that long.
 *
 * @param {string} text - Markdown source
 * @param {number} [minLength=0] - Minimum length before stopping
 * @returns {string} The paragraph(s), or an empty string
 */
export function firstParagraph(text, minLength = 0) {
  const done = [];
  let paragraph = [];
  for (const { line, code } of classifyLines(text)) {
    const trimmed = line.trim();
    const prose =
      !code &&
      trimmed !== "" &&
      !/^(#|>|\||[-*+]\s|\d+\.\s|<|\[!\[|!\[)/.test(trimmed);
    if (prose) {
      paragraph.push(trimmed);
    } else if (paragraph.length > 0) {
      done.push(plainText(paragraph.join(" ")));
      paragraph = [];
      if (done.join(" ").length >= minLength) break;
    }
  }
  if (paragraph.length > 0) done.push(plainText(paragraph.join(" ")));
  return done.join(" ");
}

/**
 * A meta description for a document: its opening prose, at least 70
 * characters where the document has them (shorter descriptions are replaced
 * by search engines) and at most 160.
 *
 * @param {string} text - Markdown source
 * @returns {string} The description
 */
export function describe(text) {
  // A lead-in sentence ending with a colon reads as cut off out of context.
  return truncate(firstParagraph(text, 70), 160).replace(/:$/, ".");
}

/**
 * Escape text for HTML element content and attribute values.
 *
 * @param {string} text - Plain text
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render one line of inline Markdown (code spans, bold, links) to HTML. Used
 * for feature card text, which is placed inside the theme's own markup.
 *
 * @param {string} text - Inline Markdown
 * @returns {string} HTML
 */
export function inlineHtml(text) {
  const codes = [];
  const withoutCode = text.replace(/`([^`]*)`/g, (_, code) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `\uE000${codes.length - 1}\uE000`;
  });
  return escapeHtml(withoutCode)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_, label, href) => `<a href="${href}">${label}</a>`,
    )
    .replace(/\uE000(\d+)\uE000/g, (_, i) => codes[Number(i)]);
}

/**
 * Relative URL from one site page to another. Both are root-relative paths;
 * directory pages end with a slash. Relative links keep working whatever
 * path prefix the site is served under (GitHub project pages, local preview).
 *
 * @param {string} from - URL of the page that contains the link
 * @param {string} to - URL of the target page
 * @returns {string} Relative URL
 */
export function relativeUrl(from, to) {
  const fromDir = from.endsWith("/") ? from : posix.dirname(from) + "/";
  let rel = posix.relative(fromDir, to);
  if (rel === "") return "./";
  if (to.endsWith("/") && !rel.endsWith("/")) rel += "/";
  return rel;
}

/**
 * Rewrite the targets of inline Markdown links and images outside code.
 *
 * @param {string} text - Markdown source
 * @param {(target: string) => string} rewrite - Maps a link target
 * @returns {string} Markdown with rewritten targets
 */
export function mapLinks(text, rewrite) {
  return classifyLines(text)
    .map(({ line, code }) => {
      if (code) return line;
      // A code span on its own is kept as it is (`[a](b)` in backticks is
      // not a link); a link label may itself contain code spans.
      return line.replace(
        /`[^`]*`|(!?\[(?:[^\]`]|`[^`]*`)*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g,
        (match, open, target, close) =>
          open === undefined ? match : `${open}${rewrite(target)}${close}`,
      );
    })
    .join("\n");
}

/**
 * Build the link rewriter for one source file. Links to files that become
 * site pages are turned into relative site URLs (anchors kept: the site uses
 * GitHub-compatible heading ids); links to other repository files go to
 * GitHub; external links, mail links and same-page anchors are left alone.
 *
 * @param {object} options - Rewriter options
 * @param {string} options.sourcePath - Repository path of the file, e.g. "docs/API.md"
 * @param {string} options.pageUrl - Site URL of the page built from it
 * @param {Map<string, string>} options.pages - Repository path to site URL
 * @param {string} options.repoUrl - Repository web URL, e.g. "https://github.com/o/r"
 * @param {string} [options.branch="main"] - Branch for repository links
 * @param {string} [options.anchorPage] - Site URL that same-page anchors should point to
 * @returns {(target: string) => string} The rewriter
 */
export function linkRewriter({
  sourcePath,
  pageUrl,
  pages,
  repoUrl,
  branch = "main",
  anchorPage,
}) {
  const sourceDir = posix.dirname(sourcePath);
  return (target) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) {
      return target;
    }
    if (target.startsWith("#")) {
      return anchorPage ? relativeUrl(pageUrl, anchorPage) + target : target;
    }
    const hashAt = target.indexOf("#");
    const path = hashAt === -1 ? target : target.slice(0, hashAt);
    const hash = hashAt === -1 ? "" : target.slice(hashAt);
    const repoPath = posix.normalize(posix.join(sourceDir, path));
    if (repoPath.startsWith("..")) return target;
    const page = pages.get(repoPath);
    if (page) return relativeUrl(pageUrl, page) + hash;
    const kind = path.endsWith("/") ? "tree" : "blob";
    return `${repoUrl}/${kind}/${branch}/${repoPath.replace(/\/$/, "")}${hash}`;
  };
}

/**
 * Serialize a flat object as YAML frontmatter. Strings are written as JSON
 * strings, which YAML reads as double-quoted scalars, so no value can break
 * the block.
 *
 * @param {Record<string, string|number|boolean>} data - Frontmatter fields
 * @returns {string} The frontmatter block, ending with a newline
 */
export function frontmatter(data) {
  const lines = Object.entries(data)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

/**
 * Rows of the first Markdown table whose first cell is a link, as
 * `{ label, target, summary }`. Used to read the guide order and labels from
 * docs/README.md, so the site navigation follows the documentation index.
 *
 * @param {string} text - Markdown source
 * @returns {{ label: string, target: string, summary: string }[]} Rows
 */
export function linkTable(text) {
  const rows = [];
  for (const { line, code } of classifyLines(text)) {
    const match =
      !code &&
      /^\|\s*\[([^\]]+)\]\(([^)\s]+)\)\s*\|\s*(.*?)\s*\|\s*$/.exec(line);
    if (match) {
      rows.push({
        label: match[1],
        target: match[2],
        summary: plainText(match[3]),
      });
    }
  }
  return rows;
}

/**
 * Items of a Markdown bullet list whose entries start with a bold lead, as
 * in README "Features": `- **Lead**: text`.
 *
 * @param {string} text - Markdown source
 * @returns {{ title: string, text: string }[]} Items
 */
export function leadList(text) {
  const items = [];
  for (const { line, code } of classifyLines(text)) {
    const match =
      !code && /^[-*+]\s+\*\*(.+?)\*\*\s*[:—-]?\s*(.*)$/.exec(line.trim());
    if (match) items.push({ title: match[1], text: match[2] });
  }
  return items;
}
