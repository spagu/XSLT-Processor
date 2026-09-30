import { describe, it } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPO_ROOT, confinePath, systemTool } from "./fsSafety.mjs";

describe("confinePath", () => {
  it("accepts paths inside the repository, existing or not", () => {
    assert.strictEqual(
      confinePath(join(REPO_ROOT, "package.json")),
      join(REPO_ROOT, "package.json"),
    );
    assert.strictEqual(
      confinePath(join(REPO_ROOT, "dist-bin", "new", "x")),
      join(REPO_ROOT, "dist-bin", "new", "x"),
    );
    assert.strictEqual(confinePath(REPO_ROOT), REPO_ROOT);
  });

  it("accepts the temporary directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "fs-safety-"));
    try {
      assert.ok(confinePath(join(dir, "out")).endsWith("out"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects paths outside, traversal and symlinks leaving the roots", () => {
    assert.throws(() => confinePath("/etc/passwd", [REPO_ROOT]), /outside/);
    assert.throws(
      () => confinePath(join(REPO_ROOT, "..", "elsewhere"), [REPO_ROOT]),
      /outside/,
    );
    const dir = mkdtempSync(join(tmpdir(), "fs-safety-"));
    try {
      symlinkSync("/", join(dir, "root-link"));
      assert.throws(
        () => confinePath(join(dir, "root-link", "etc"), [dir]),
        /outside/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects empty, non-string and NUL-containing input", () => {
    assert.throws(() => confinePath(""), /Invalid path/);
    assert.throws(() => confinePath(undefined), /Invalid path/);
    assert.throws(() => confinePath("a\0b"), /Invalid path/);
  });

  it("handles roots given with a trailing separator", () => {
    assert.strictEqual(
      confinePath(join(REPO_ROOT, "x"), [REPO_ROOT + "/"]),
      join(REPO_ROOT, "x"),
    );
  });
});

describe("systemTool", () => {
  it("finds tools in fixed system directories only", () => {
    assert.strictEqual(
      systemTool("tar", "linux", (p) => p === "/bin/tar"),
      "/bin/tar",
    );
    assert.match(
      systemTool("tar", "win32", () => true),
      /System32[\\/]tar\.exe$/,
    );
    assert.throws(
      () => systemTool("nope", "linux", () => false),
      /nope not found/,
    );
  });

  it("returns an existing tar on this machine", () => {
    assert.match(systemTool("tar"), /tar(\.exe)?$/);
  });
});
