/**
 * CLI streaming output: the result is serialized in chunks and written chunk
 * by chunk (waiting for stdout to drain), with bytes identical to the whole
 * string encoded at once.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDomEnvironment,
  runTransformation,
  streamTransformation,
} from "../bin/lib/transform.js";
import { writeResult } from "../bin/lib/output.js";
import { encodeOutput } from "./xslt/serializer/encoding.js";

const { setImmediate } = globalThis;

const CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "bin",
  "xslt.js",
);

/**
 * A writable stub recording chunks; `write` reports a full buffer every
 * other call and emits `drain` shortly after.
 *
 * @param {boolean} [isTTY] - Whether it poses as a terminal
 * @returns {EventEmitter & {chunks: Uint8Array[], isTTY: boolean, write: Function}} The stub
 */
function slowStream(isTTY = false) {
  const stream = new EventEmitter();
  stream.isTTY = isTTY;
  stream.chunks = [];
  stream.write = (chunk) => {
    stream.chunks.push(chunk);
    if (stream.chunks.length % 2 === 0) return true;
    setImmediate(() => stream.emit("drain"));
    return false;
  };
  return stream;
}

const quiet = { write() {} };

describe("CLI chunked output", () => {
  it("writes chunks with one UTF-16 byte order mark and waits for drain", async () => {
    const stdout = slowStream();
    await writeResult(["<a>", "é\u{1F600}", "</a>"], undefined, {
      encoding: "UTF-16",
      stdout,
      stderr: quiet,
    });
    assert.deepStrictEqual(
      Buffer.concat(stdout.chunks),
      Buffer.from(encodeOutput("<a>é\u{1F600}</a>", "UTF-16")),
    );
  });

  it("writes the byte order mark of an empty UTF-16 result", async () => {
    const stdout = slowStream();
    await writeResult([], undefined, {
      encoding: "UTF-16BE",
      stdout,
      stderr: quiet,
    });
    assert.strictEqual(Buffer.concat(stdout.chunks).toString("hex"), "feff");
  });

  it("ends terminal output with one newline", async () => {
    const tty = slowStream(true);
    await writeResult(["<a/>"], undefined, { stdout: tty, stderr: quiet });
    assert.strictEqual(Buffer.concat(tty.chunks).toString(), "<a/>\n");
    const done = slowStream(true);
    await writeResult(["<a/>", "\n"], undefined, {
      stdout: done,
      stderr: quiet,
    });
    assert.strictEqual(Buffer.concat(done.chunks).toString(), "<a/>\n");
  });

  it("writes chunks to a file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "xslt-cli-stream-"));
    try {
      const target = join(dir, "out.xml");
      await writeResult(["<a>", "é</a>"], target, {
        encoding: "ISO-8859-1",
        stderr: quiet,
      });
      assert.strictEqual(
        readFileSync(target).toString("hex"),
        "3c613ee93c2f613e",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serializes a large result in bounded chunks", async () => {
    const dom = await createDomEnvironment();
    const inputs = {
      dom,
      xmlContent: `<r>${"<i>x</i>".repeat(20000)}</r>`,
      xsltContent: `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:template match="/"><out><xsl:for-each select="//i"><v><xsl:value-of select="."/></v></xsl:for-each></out></xsl:template>
      </xsl:stylesheet>`,
      params: {},
      values: {},
    };
    const { chunks, encoding } = streamTransformation(inputs);
    const all = [...chunks];
    assert.strictEqual(encoding, "UTF-8");
    assert.ok(all.length > 5);
    assert.ok(all.every((chunk) => chunk.length <= 16384));
    assert.strictEqual(all.join(""), runTransformation(inputs).output);
  });

  it("writes byte-identical output through the command", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "xslt-cli-big-")));
    try {
      writeFileSync(join(dir, "in.xml"), `<r>${"<i>ż</i>".repeat(30000)}</r>`);
      writeFileSync(
        join(dir, "s.xsl"),
        `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:output encoding="UTF-16" indent="yes"/>
          <xsl:template match="/"><out><xsl:copy-of select="//i"/></out></xsl:template>
        </xsl:stylesheet>`,
      );
      const options = {
        cwd: dir,
        env: { ...process.env, NODE_V8_COVERAGE: join(dir, "coverage") },
        maxBuffer: 64 * 1024 * 1024,
      };
      const stdout = execFileSync(
        process.execPath,
        [CLI, "in.xml", "s.xsl"],
        options,
      );
      execFileSync(
        process.execPath,
        [CLI, "in.xml", "s.xsl", "-o", "o.xml"],
        options,
      );
      const file = readFileSync(join(dir, "o.xml"));
      assert.deepStrictEqual(stdout, file);
      assert.strictEqual(file.subarray(0, 2).toString("hex"), "fffe");
      assert.strictEqual(file.indexOf(Buffer.from([0xff, 0xfe]), 2), -1);
      assert.match(file.toString("utf16le"), /<i>ż<\/i>\n<\/out>$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
