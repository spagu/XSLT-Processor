/**
 * Asynchronous XML input: nodes, strings, bytes, ReadableStreams and async
 * iterables, decoded like files (UTF-8, byte order mark, XML declaration).
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import { JSDOM } from "jsdom";
import { isStreamSource, readSource, readText } from "./readSource.js";
import { decodeXml } from "./decode.js";

const { AbortController, AbortSignal, ReadableStream, TextEncoder } =
  globalThis;

const { window } = new JSDOM("");
const latin1Xml = Buffer.concat([
  Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><a>caf'),
  Buffer.from([0xe9]),
  Buffer.from("</a>"),
]);

/**
 * A ReadableStream of the given chunks.
 *
 * @param {Array<string|Uint8Array>} chunks - Chunks to enqueue
 * @returns {ReadableStream} The stream
 */
function streamOf(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

/**
 * An async generator of the given chunks.
 *
 * @param {Array<unknown>} chunks - Chunks to yield
 * @yields {unknown} The chunks
 */
async function* iterableOf(chunks) {
  yield* chunks;
}

describe("readText", () => {
  it("joins string chunks of a ReadableStream", async () => {
    assert.strictEqual(
      await readText(streamOf(["<a>", "b", "</a>"])),
      "<a>b</a>",
    );
  });

  it("decodes UTF-8 bytes split inside a character", async () => {
    const bytes = Buffer.from("<a>zażółć</a>");
    const chunks = [...bytes].map((byte) => Uint8Array.of(byte));
    assert.strictEqual(await readText(iterableOf(chunks)), "<a>zażółć</a>");
  });

  it("decodes ISO-8859-1 bytes from the XML declaration", async () => {
    const text = await readText(
      Readable.from([latin1Xml.subarray(0, 50), latin1Xml.subarray(50)]),
    );
    assert.match(text, /<a>café<\/a>$/);
  });

  it("accepts ArrayBuffer chunks and an empty stream", async () => {
    const buffer = new TextEncoder().encode("<a/>").buffer;
    assert.strictEqual(await readText(iterableOf([buffer])), "<a/>");
    assert.strictEqual(await readText(iterableOf([])), "");
  });

  it("rejects mixed and unsupported chunks", async () => {
    await assert.rejects(
      readText(iterableOf(["<a>", Uint8Array.of(0x62)])),
      /cannot mix strings and bytes/,
    );
    await assert.rejects(readText(iterableOf([42])), TypeError);
  });

  it("stops when the signal aborts", async () => {
    const controller = new AbortController();
    async function* slow() {
      yield "<a>";
      controller.abort(new Error("stop"));
      yield "</a>";
    }
    await assert.rejects(readText(slow(), controller.signal), /stop/);
    await assert.rejects(readText(iterableOf([]), controller.signal), /stop/);
  });

  it("releases the reader of a ReadableStream", async () => {
    const stream = streamOf(["<a/>"]);
    await readText(stream);
    assert.strictEqual(stream.locked, false);
  });
});

describe("isStreamSource", () => {
  it("recognizes streams and async iterables only", () => {
    assert.strictEqual(isStreamSource(streamOf([])), true);
    assert.strictEqual(isStreamSource(iterableOf([])), true);
    assert.strictEqual(isStreamSource("<a/>"), false);
    assert.strictEqual(isStreamSource(null), false);
  });
});

describe("readSource", () => {
  before(() => {
    globalThis.DOMParser = window.DOMParser;
  });

  after(() => {
    delete globalThis.DOMParser;
  });

  it("returns nodes unchanged", async () => {
    const doc = new window.DOMParser().parseFromString(
      "<a/>",
      "application/xml",
    );
    assert.strictEqual(await readSource(doc), doc);
  });

  it("parses strings, bytes and streams", async () => {
    for (const source of [
      "<a>café</a>",
      new TextEncoder().encode("<a>café</a>"),
      new TextEncoder().encode("<a>café</a>").buffer,
      streamOf(["<a>caf", "é</a>"]),
      Readable.from([latin1Xml]),
    ]) {
      const doc = await readSource(source);
      assert.strictEqual(doc.documentElement.textContent, "café");
    }
  });

  it("uses a given DOMParser", async () => {
    const calls = [];
    const domParser = {
      parseFromString(text, type) {
        calls.push(type);
        return new window.DOMParser().parseFromString(text, type);
      },
    };
    await readSource("<a/>", { domParser });
    assert.deepStrictEqual(calls, ["application/xml"]);
  });

  it("rejects malformed markup, unsupported sources and aborted signals", async () => {
    await assert.rejects(readSource("<a>"), /XML parse error/);
    await assert.rejects(readSource(42), TypeError);
    await assert.rejects(readSource({}), TypeError);
    await assert.rejects(
      readSource("<a/>", { signal: AbortSignal.abort(new Error("gone")) }),
      /gone/,
    );
  });
});

describe("decodeXml (shared with the CLI)", () => {
  it("honours byte order marks", () => {
    const utf16 = Buffer.from("﻿<a/>", "utf16le");
    assert.strictEqual(decodeXml(utf16), "<a/>");
  });
});
