/**
 * Which directories a scan skips: the defaults and `--ignore` patterns. Pure
 * (no Node.js built-ins), so the website's online check uses the same list.
 *
 * @module ignore
 */

/** Directory names that are never scanned. */
export const DEFAULT_IGNORED_DIRS = Object.freeze([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "target",
]);

/**
 * Turn a directory-name pattern into a regular expression. `*` matches any
 * run of characters; everything else is literal.
 *
 * @param {string} pattern - Pattern such as `generated-*`
 * @returns {RegExp} Anchored expression for a directory basename
 */
function patternToRegExp(pattern) {
  const escaped = pattern
    .replaceAll(/[.+?^${}()|[\]\\]/g, String.raw`\$&`)
    .replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`);
}

/**
 * Build a predicate that tells whether a directory basename is skipped.
 *
 * @param {string[]} [extra] - Patterns given with `--ignore`
 * @returns {(name: string) => boolean} Predicate on a directory basename
 */
export function createIgnoreMatcher(extra = []) {
  const patterns = [...DEFAULT_IGNORED_DIRS, ...extra].map(patternToRegExp);
  return (name) => patterns.some((expression) => expression.test(name));
}
