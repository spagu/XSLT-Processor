/**
 * Package entry point tests.
 *
 * Covers the public ESM surface and the CommonJS bundle a Node.js consumer
 * loads through `require('@tradik/xslt-processor')`.
 */

import { describe, it, before } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VERSION,
  XPathContext,
  XPathEvaluator,
  XPathResultType,
  XSLTProcessor,
  XsltContext,
  XsltEngine,
  evaluateXPath,
  installGlobal,
  isBrowser,
  isNativeXSLTSupported,
  isNode,
  parseXPath,
  selectFirstXPath,
  selectXPath,
} from "./index.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Environment for child processes, isolated from this run's coverage report.
 *
 * Node.js propagates `NODE_V8_COVERAGE` to child processes, which would add the
 * bundled `dist/` output and the build script to this suite's coverage report.
 * Pointing children at a throwaway directory keeps the report to `src/`.
 *
 * @returns {Object} The child process environment
 */
function childEnv() {
  return {
    ...process.env,
    NODE_V8_COVERAGE: mkdtempSync(join(tmpdir(), "xslt-processor-cjs-")),
  };
}

describe("package entry point", () => {
  it("should export the public API", () => {
    for (const exported of [
      XSLTProcessor,
      XsltEngine,
      XsltContext,
      XPathEvaluator,
      XPathContext,
      evaluateXPath,
      selectXPath,
      selectFirstXPath,
      parseXPath,
      installGlobal,
      isNativeXSLTSupported,
    ]) {
      assert.strictEqual(typeof exported, "function");
    }

    assert.strictEqual(XPathResultType.STRING_TYPE, 2);
  });

  it("should report the version and the runtime", () => {
    assert.match(VERSION, /^\d+\.\d+\.\d+$/);
    assert.strictEqual(isNode, true);
    assert.strictEqual(isBrowser, false);
  });
});

describe("CommonJS consumer flow", () => {
  before(() => {
    execFileSync(process.execPath, [join(rootDir, "scripts", "build.js")], {
      cwd: rootDir,
      stdio: "ignore",
      env: childEnv(),
    });
  });

  it("should transform through the CommonJS bundle", () => {
    const output = execFileSync(
      process.execPath,
      [join(rootDir, "tests", "cjs-smoke.cjs")],
      { cwd: rootDir, encoding: "utf8", env: childEnv() },
    );

    const [version, markup] = output.split("|");

    assert.strictEqual(version, VERSION);
    assert.strictEqual(
      markup,
      "<report><total>1,235.00</total><grouped>2</grouped><external>1.09</external></report>",
    );
  });
});
