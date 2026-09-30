/**
 * Integration tests: official node download (against a local HTTP server)
 * and a real single executable built from the running node, smoke-tested.
 *
 * The executable test needs a node with `--build-sea` (25.5+) and is
 * skipped on older versions.
 *
 * Run: node --test "scripts/binaries/*.test.mjs"
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { bundleCli } from "./bundle.mjs";
import { assertSeaVersion, officialNode, sha256 } from "./node-dist.mjs";
import { buildExecutable } from "./sea.mjs";
import { smokeTest } from "./smoke.mjs";
import { TARGETS, binaryName, hostTarget } from "./targets.mjs";

const VERSION = "v99.0.0";

/**
 * Whether the running node can build single executables.
 *
 * @returns {boolean} True for Node.js 25.5.0 and newer
 */
function canBuildSea() {
  try {
    assertSeaVersion(process.version);
    return true;
  } catch {
    return false;
  }
}

describe("officialNode", () => {
  const [linux, , , , windows] = TARGETS;
  let dir;
  let server;
  let distUrl;
  /** @type {Map<string, Buffer>} */
  const files = new Map();

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "xslt-dist-"));
    const stage = join(dir, "stage");
    const member = `node-${VERSION}-linux-x64/bin`;
    mkdirSync(join(stage, member), { recursive: true });
    writeFileSync(join(stage, member, "node"), "fake linux node");
    const archive = join(dir, "node.tar.gz");
    execFileSync("tar", [
      "-czf",
      archive,
      "-C",
      stage,
      `node-${VERSION}-linux-x64`,
    ]);

    files.set(`node-${VERSION}-linux-x64.tar.gz`, readFileSync(archive));
    files.set("win-x64/node.exe", Buffer.from("fake windows node"));
    const shasums = [...files]
      .map(([name, data]) => `${sha256(data)}  ${name}`)
      .concat(`${"0".repeat(64)}  node-${VERSION}-darwin-x64.tar.gz`)
      .join("\n");
    files.set("SHASUMS256.txt", Buffer.from(shasums));
    files.set(`node-${VERSION}-darwin-x64.tar.gz`, Buffer.from("tampered"));

    server = createServer((request, response) => {
      const data = files.get(request.url.slice(`/${VERSION}/`.length));
      response.writeHead(data ? 200 : 404).end(data);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    distUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("extracts a verified node from a tarball and caches it", async () => {
    const cache = join(dir, "cache");
    const binary = await officialNode(linux, VERSION, cache, distUrl);
    assert.equal(binary, join(cache, VERSION, "linux-x64", "node"));
    assert.equal(readFileSync(binary, "utf8"), "fake linux node");
    files.delete(`node-${VERSION}-linux-x64.tar.gz`);
    assert.equal(await officialNode(linux, VERSION, cache, distUrl), binary);
  });

  it("stores a verified node.exe as is", async () => {
    const binary = await officialNode(
      windows,
      VERSION,
      join(dir, "cache"),
      distUrl,
    );
    assert.equal(readFileSync(binary, "utf8"), "fake windows node");
  });

  it("refuses a download whose checksum does not match", async () => {
    await assert.rejects(
      officialNode(TARGETS[2], VERSION, join(dir, "cache"), distUrl),
      /Checksum mismatch for node-v99\.0\.0-darwin-x64\.tar\.gz/,
    );
  });

  it("reports HTTP errors", async () => {
    await assert.rejects(
      officialNode(TARGETS[3], VERSION, join(dir, "cache"), distUrl),
      /HTTP 404/,
    );
  });
});

describe("single executable", { skip: !canBuildSea() || !hostTarget() }, () => {
  it("builds a working xslt executable from the running node", async () => {
    const dir = mkdtempSync(join(tmpdir(), "xslt-sea-"));
    try {
      const bundle = join(dir, "xslt.cjs");
      const { bytes } = await bundleCli(bundle);
      assert.ok(bytes > 1024 * 1024, "the bundle includes jsdom");

      const target = hostTarget();
      const outfile = join(dir, binaryName(target));
      buildExecutable({
        bundle,
        outfile,
        builderNode: process.execPath,
        targetNode: process.execPath,
        target,
        native: true,
      });

      const { startupMs, transformMs } = smokeTest(outfile);
      assert.ok(startupMs > 0 && transformMs > 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
