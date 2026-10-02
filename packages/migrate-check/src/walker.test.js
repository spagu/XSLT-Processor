import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { chmod, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { createFixture, removeFixture } from "../test/fixtures.js";
import {
  DEFAULT_IGNORED_DIRS,
  MAX_FILE_BYTES,
  createIgnoreMatcher,
  toPosix,
  walkFiles,
} from "./walker.js";

/** Collect every relative path a walk yields. */
async function collect(dir, options) {
  const paths = [];
  for await (const file of walkFiles(dir, options)) {
    paths.push(file.relativePath);
  }
  return paths;
}

describe("createIgnoreMatcher", () => {
  it("skips the default directories and matches names exactly", () => {
    const isIgnored = createIgnoreMatcher();
    for (const name of DEFAULT_IGNORED_DIRS) {
      assert.equal(isIgnored(name), true);
    }
    assert.equal(isIgnored("xgit"), false);
    assert.equal(isIgnored("src"), false);
    assert.equal(isIgnored("node_modules_backup"), false);
  });

  it("accepts extra patterns with * wildcards and escapes the rest", () => {
    const isIgnored = createIgnoreMatcher(["generated-*", "a.b"]);
    assert.equal(isIgnored("generated-old"), true);
    assert.equal(isIgnored("a.b"), true);
    assert.equal(isIgnored("aXb"), false);
  });
});

describe("toPosix", () => {
  it("uses forward slashes", () => {
    assert.equal(toPosix(join("a", "b", "c.js")), "a/b/c.js");
  });
});

describe("walkFiles", () => {
  let dir;

  before(async () => {
    dir = await createFixture({
      "src/b.js": "b",
      "src/a.js": "a",
      "node_modules/pkg/index.js": "ignored",
      "dist/bundle.js": "ignored",
      "skipme/x.js": "ignored by --ignore",
      "gen-1/x.js": "ignored by --ignore wildcard",
      "root.txt": "root",
    });
    await writeFile(join(dir, "big.bin"), Buffer.alloc(MAX_FILE_BYTES + 1));
    await writeFile(join(dir, "edge.bin"), Buffer.alloc(MAX_FILE_BYTES));
    await symlink(join(dir, "root.txt"), join(dir, "link.txt"));
    await symlink(join(dir, "src"), join(dir, "linked-src"));
  });

  after(() => removeFixture(dir));

  it("lists regular files in sorted order with relative posix paths", async () => {
    const paths = await collect(dir, { ignore: ["skipme", "gen-*"] });
    assert.deepEqual(paths, ["edge.bin", "root.txt", "src/a.js", "src/b.js"]);
  });

  it("honours --ignore only when given", async () => {
    const paths = await collect(dir);
    assert.ok(paths.includes("skipme/x.js"));
    assert.ok(paths.includes("gen-1/x.js"));
    assert.ok(!paths.includes("node_modules/pkg/index.js"));
    assert.ok(!paths.includes("dist/bundle.js"));
  });

  it("reports the size and the joined path", async () => {
    const files = [];
    for await (const file of walkFiles(dir, { ignore: ["skipme", "gen-*"] })) {
      files.push(file);
    }
    const root = files.find((file) => file.relativePath === "root.txt");
    assert.equal(root.size, 4);
    assert.equal(root.path, join(dir, "root.txt"));
  });

  it("skips directories it cannot read", async (t) => {
    if (process.getuid?.() === 0) {
      t.skip("root reads everything");
      return;
    }
    const locked = await createFixture({
      "locked/secret.js": "x",
      "open.js": "y",
    });
    await chmod(join(locked, "locked"), 0o000);
    try {
      assert.deepEqual(await collect(locked), ["open.js"]);
    } finally {
      await chmod(join(locked, "locked"), 0o755);
      await removeFixture(locked);
    }
  });

  it("yields nothing for a missing directory", async () => {
    assert.deepEqual(await collect(join(dir, "missing")), []);
  });
});
