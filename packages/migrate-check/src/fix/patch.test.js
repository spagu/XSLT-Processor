import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileDiff, hunk, renderPatch, unifiedDiff } from "./patch.js";
import { createFixture, removeFixture } from "../../test/fixtures.js";
import { commitAll, git } from "../../test/git.js";

const NO_NEWLINE = String.raw`\ No newline at end of file`;

const lines = (count) =>
  Array.from({ length: count }, (_, index) => `line ${index + 1}\n`).join("");

describe("hunk", () => {
  it("writes an insertion with three lines of context", () => {
    const before = lines(10);
    const after = before.replace("line 5\n", "line 5\nnew\n");
    assert.equal(
      hunk(before, after),
      "@@ -3,6 +3,7 @@\n line 3\n line 4\n line 5\n+new\n line 6\n line 7\n line 8\n",
    );
  });

  it("marks lines without a newline at the end, and empty texts", () => {
    assert.equal(
      hunk("a", "a\nb"),
      `@@ -1,1 +1,2 @@\n-a\n${NO_NEWLINE}\n+a\n+b\n${NO_NEWLINE}\n`,
    );
    assert.equal(hunk("", "x\n"), "@@ -0,0 +1,1 @@\n+x\n");
    assert.equal(hunk("same", "same"), "");
  });

  it("labels unified and git diffs", () => {
    assert.equal(
      unifiedDiff("a\n", "b\n", {
        oldLabel: "expected",
        newLabel: "tradik",
        context: 0,
      }),
      "--- expected\n+++ tradik\n@@ -1,1 +1,1 @@\n-a\n+b\n",
    );
    assert.equal(fileDiff("x.js", "a\n", "a\n"), "");
    assert.ok(
      fileDiff("x.js", "a\n", "b\n").startsWith(
        "diff --git a/x.js b/x.js\n--- a/x.js\n+++ b/x.js\n",
      ),
    );
  });
});

describe("renderPatch and git apply", () => {
  it("is sorted, has a header and applies with git apply --check", async () => {
    const files = {
      "b.js": "// head\r\nrun();\r\n",
      "a/page.html": lines(8),
      "tail.txt": "no newline",
    };
    const edits = [
      {
        path: "b.js",
        before: files["b.js"],
        after: files["b.js"].replace("run", "first();\r\nrun"),
      },
      {
        path: "a/page.html",
        before: files["a/page.html"],
        after: files["a/page.html"].replace("line 8\n", "line 8\nline 9\n"),
      },
      { path: "tail.txt", before: files["tail.txt"], after: "no newline\nnow" },
    ];
    const patch = renderPatch(["tool 1.0", ""], edits);
    assert.ok(patch.startsWith("# tool 1.0\n#\n\ndiff --git a/a/page.html"));
    assert.ok(patch.indexOf("a/b.js") < patch.indexOf("a/tail.txt"));
    const dir = await createFixture(files);
    try {
      await commitAll(dir);
      await writeFile(join(dir, "migration.patch"), patch);
      const check = await git(dir, "apply", "--check", "migration.patch");
      assert.equal(check.code, 0, check.stderr);
      assert.notEqual((await git(dir, "no-such-command")).code, 0);
    } finally {
      await removeFixture(dir);
    }
  });
});
