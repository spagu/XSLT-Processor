/**
 * Chunked serialization: ChunkBuffer, serializeChunks and the chunked output
 * encoder. Joined chunks must equal serializeResult for every output method
 * and chunk size, chunks must stay bounded, and a surrogate pair must never
 * be split.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { Buffer } from "node:buffer";
import { JSDOM } from "jsdom";
import {
  ChunkBuffer,
  DEFAULT_CHUNK_SIZE,
  HtmlWriter,
  resolveOutputSettings,
  serializeChunks,
  serializeResult,
  serializeText,
  textChunks,
  toChunkSize,
} from "../serializer.js";
import { createOutputEncoder, encodeOutput } from "./encoding.js";

const { window } = new JSDOM("");
const parseXML = (markup) =>
  new window.DOMParser().parseFromString(markup, "application/xml");

/**
 * Build a document with `count` item elements.
 *
 * @param {number} count - Number of items
 * @returns {Document} The document
 */
function itemsDocument(count) {
  const items = Array.from(
    { length: count },
    (_, i) => `<item n="${i}">value ${i} &amp; more</item>`,
  );
  return parseXML(`<list>${items.join("")}</list>`);
}

describe("toChunkSize", () => {
  it("defaults to 16 KiB and accepts positive integers and Infinity", () => {
    assert.strictEqual(toChunkSize(undefined), DEFAULT_CHUNK_SIZE);
    assert.strictEqual(DEFAULT_CHUNK_SIZE, 16384);
    assert.strictEqual(toChunkSize(1), 1);
    assert.strictEqual(toChunkSize(Infinity), Infinity);
  });

  it("rejects other values", () => {
    for (const size of [0, -1, 1.5, NaN, "16", null]) {
      assert.throws(() => toChunkSize(size), RangeError);
    }
  });
});

describe("ChunkBuffer", () => {
  it("yields full chunks and keeps the rest until the final take", () => {
    const buffer = new ChunkBuffer(3);
    buffer.write("ab");
    assert.strictEqual(buffer.full, false);
    buffer.write("cdefg");
    assert.strictEqual(buffer.full, true);
    assert.deepStrictEqual([...buffer.take()], ["abc", "def"]);
    assert.strictEqual(buffer.length, 1);
    assert.deepStrictEqual([...buffer.take(true)], ["g"]);
    assert.deepStrictEqual([...buffer.take(true)], []);
  });

  it("keeps everything for one chunk by default", () => {
    const buffer = new ChunkBuffer();
    buffer.write("a".repeat(100000));
    assert.strictEqual(buffer.full, false);
    assert.deepStrictEqual(
      [...buffer.take(true)].map((chunk) => chunk.length),
      [100000],
    );
  });

  it("never splits a surrogate pair", () => {
    const buffer = new ChunkBuffer(2);
    buffer.write("a\u{1F600}b\u{1F600}");
    const chunks = [...buffer.take(true)];
    assert.deepStrictEqual(chunks, ["a", "\u{1F600}", "b", "\u{1F600}"]);
  });

  it("widens a one-unit chunk to hold a whole pair", () => {
    const buffer = new ChunkBuffer(1);
    buffer.write("\u{1F600}x");
    assert.deepStrictEqual([...buffer.take(true)], ["\u{1F600}", "x"]);
  });

  it("keeps a trailing high surrogate for the next write", () => {
    const buffer = new ChunkBuffer(2);
    buffer.write("ab\ud83d");
    assert.deepStrictEqual([...buffer.take()], ["ab"]);
    buffer.write("\ude00");
    assert.deepStrictEqual([...buffer.take(true)], ["\u{1F600}"]);
  });
});

describe("serializeChunks", () => {
  const cases = [
    ["xml", {}],
    ["xml indented", { indent: "yes" }],
    ["html", { method: "html" }],
    ["xhtml", { method: "xhtml" }],
    ["text", { method: "text" }],
    ["cdata", { cdataSectionElements: "item" }],
  ];

  for (const [name, settings] of cases) {
    it(`joins to serializeResult (${name})`, () => {
      const doc = itemsDocument(50);
      doc.documentElement.appendChild(doc.createComment("end"));
      const expected = serializeResult(doc, settings);
      for (const chunkSize of [1, 7, 64, undefined, Infinity]) {
        const chunks = [...serializeChunks(doc, settings, { chunkSize })];
        assert.strictEqual(chunks.join(""), expected);
        assert.ok(chunks.every((chunk) => chunk.length > 0));
      }
    });
  }

  it("keeps the string serialize() of the writers", () => {
    const doc = itemsDocument(3);
    const settings = resolveOutputSettings({ method: "html" }, doc);
    assert.strictEqual(
      new HtmlWriter(settings).serialize(doc),
      serializeResult(doc, { method: "html" }),
    );
  });

  it("yields nothing for a null node and validates the chunk size", () => {
    assert.deepStrictEqual([...serializeChunks(null)], []);
    assert.throws(
      () => serializeChunks(null, {}, { chunkSize: 0 }),
      RangeError,
    );
  });

  it("bounds the chunks of a 100k item output", () => {
    const doc = itemsDocument(100000);
    let total = 0;
    let count = 0;
    for (const chunk of serializeChunks(doc, { indent: "yes" })) {
      assert.ok(chunk.length <= DEFAULT_CHUNK_SIZE);
      total += chunk.length;
      count++;
    }
    assert.ok(count > 100, `${count} chunks`);
    assert.strictEqual(total, serializeResult(doc, { indent: "yes" }).length);
  });

  it("yields the first chunk before serializing the rest", () => {
    const doc = itemsDocument(2000);
    const chunks = serializeChunks(doc, {}, { chunkSize: 256 });
    const first = chunks.next().value;
    assert.strictEqual(first.length, 256);
    // Items appended now are still serialized: the tree is read lazily
    const late = doc.createElement("late");
    doc.documentElement.appendChild(late);
    assert.match([first, ...chunks].join(""), /<late\/><\/list>$/);
  });
});

describe("textChunks", () => {
  it("walks the tree without recursion and matches serializeText", () => {
    let doc = parseXML(`${"<a>x".repeat(5000)}${"</a>".repeat(5000)}`);
    assert.strictEqual(serializeText(doc), "x".repeat(5000));
    assert.strictEqual([...textChunks(doc, 1000)].length, 5);
    doc = parseXML("<a>one<![CDATA[two]]><!--c--><b/>three</a>");
    assert.strictEqual(serializeText(doc.documentElement), "onetwothree");
    assert.strictEqual(serializeText(doc.documentElement.firstChild), "one");
    const empty = doc.createTextNode("");
    assert.deepStrictEqual([...textChunks(empty, 4)], []);
  });
});

describe("createOutputEncoder", () => {
  it("writes the UTF-16 byte order mark once", () => {
    for (const label of ["UTF-16", "UTF-16BE"]) {
      const encode = createOutputEncoder(label);
      const bytes = Buffer.concat([encode("a"), encode("\u{1F600}")]);
      assert.deepStrictEqual(
        bytes,
        Buffer.from(encodeOutput("a\u{1F600}", label)),
      );
    }
  });

  it("encodes UTF-8 and single-byte chunks independently", () => {
    for (const label of ["UTF-8", "ISO-8859-1", "windows-1250"]) {
      const encode = createOutputEncoder(label);
      const bytes = Buffer.concat([encode("é"), encode("ł€")]);
      assert.deepStrictEqual(bytes, Buffer.from(encodeOutput("éł€", label)));
    }
  });
});
