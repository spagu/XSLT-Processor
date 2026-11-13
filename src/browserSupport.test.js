/**
 * The library must load in the browsers docs/BROWSER-SUPPORT.md promises
 * (Chrome/Edge 93, Firefox 92, Safari 15.4). esbuild lowers syntax for those
 * targets (scripts/build.js), but it cannot lower regular expression features
 * or add missing built-in methods, so this test keeps them out of the
 * sources: a regex lookbehind made the whole bundle a SyntaxError in Safari
 * 15.4 to 16.3 (issue #35). The scan covers the library and @tradik/xslt3;
 * a line marked "browser-probed" uses the feature only after a runtime
 * check that the engine has it.
 *
 * Run: node --test src/browserSupport.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = dirname(fileURLToPath(import.meta.url));
const repoDir = join(srcDir, "..");
const sourceDirs = [srcDir, join(repoDir, "packages/xslt3/src")];

/** Constructs newer than Safari 15.4, with the Safari version that added them. */
const NEWER_THAN_TARGETS = [
  [/\(\?<[=!]/, "regex lookbehind (Safari 16.4)"],
  [/\.(?:toSorted|toReversed|toSpliced)\(/, "change-array-by-copy (Safari 16)"],
  [/\.(?:isWellFormed|toWellFormed)\(/, "well-formed strings (Safari 16.4)"],
  [/\b(?:Object|Map)\.groupBy\(/, "groupBy (Safari 17.4)"],
  [/\bPromise\.withResolvers\(/, "Promise.withResolvers (Safari 17.4)"],
  [/\bArray\.fromAsync\(/, "Array.fromAsync (Safari 16.4)"],
  [
    /\.(?:union|intersection|difference|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(/,
    "Set methods (Safari 17)",
  ],
  [/\bstatic\s*\{/, "class static blocks (Safari 16.4)"],
  [
    /\/[a-z]*v[a-z]*\.(?:test|exec)\(|new RegExp\([^)]*,\s*["'][a-z]*v/,
    "regex v flag (Safari 17)",
  ],
];

/**
 * Library source files (tests excluded).
 *
 * @param {string} dir - Directory
 * @returns {string[]} Paths
 */
function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".js") && !entry.name.endsWith(".test.js")
      ? [path]
      : [];
  });
}

describe("browser support of the sources", () => {
  it("uses no syntax or built-in newer than Safari 15.4", () => {
    const found = [];
    for (const file of sourceDirs.flatMap(sources)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (line.includes("browser-probed")) return;
        const code = line.replace(/^\s*(?:\*|\/\/).*$/, "");
        for (const [pattern, what] of NEWER_THAN_TARGETS) {
          if (pattern.test(code)) {
            found.push(`${relative(repoDir, file)}:${index + 1} ${what}`);
          }
        }
      });
    }
    assert.deepStrictEqual(found, []);
  });

  it("would catch a lookbehind", () => {
    const [lookbehind] = NEWER_THAN_TARGETS[0];
    assert.ok(lookbehind.test("/(?<![a])b/"));
    assert.ok(!lookbehind.test("/(?<name>a)/"));
  });
});
