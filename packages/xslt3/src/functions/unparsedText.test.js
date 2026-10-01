import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { code, xs } from "../xpath/testing.test.js";
import { decodeText, textDecoder } from "./textDecoding.js";
import { readFileUri } from "../xpath/eval/resources.js";
import { splitLines } from "./unparsedText.js";

const ch = (...cps) => String.fromCodePoint(...cps);
const utf8 = (text) => new globalThis.TextEncoder().encode(text);
const bytes = (...values) => new Uint8Array(values);
const throwsCode = (fn, expected) =>
  assert.throws(fn, (e) => e.code === expected, expected);

/** UTF-16 bytes of an ASCII text, with an optional byte order mark. */
function utf16(text, littleEndian, bom = true) {
  const result = bom ? (littleEndian ? [0xff, 0xfe] : [0xfe, 0xff]) : [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    result.push(...(littleEndian ? [code, 0] : [0, code]));
  }
  return new Uint8Array(result);
}

describe("decoding of text resources", () => {
  it("follows the byte order mark, then the external encoding", () => {
    assert.equal(
      decodeText(utf8(`${ch(0xfeff)}a${ch(0xa0)}b`)),
      `a${ch(0xa0)}b`,
    );
    assert.equal(decodeText(utf16("ab", true)), "ab");
    assert.equal(decodeText(utf16("ab", false), "iso-8859-1"), "ab");
    assert.equal(
      decodeText({ content: utf16("ab", false, false), encoding: "utf-16" }),
      "ab",
    );
    assert.equal(decodeText(bytes(0xe9).buffer, "iso-8859-1"), ch(0xe9));
    assert.equal(decodeText(`${ch(0xfeff)}text`), "text");
  });

  it("reads the encoding of XML media types", () => {
    const xml = (text) => ({ content: utf8(text), mediaType: "text/xml" });
    assert.equal(decodeText(xml("<a/>")), "<a/>");
    throwsCode(
      () => decodeText({ content: bytes(0x3c, 0xe9), mediaType: "text/xml" }),
      "FOUT1190",
    );
    throwsCode(
      () => decodeText(xml('<?xml version="1.0" encoding="foo"?><a/>')),
      "FOUT1190",
    );
    assert.equal(
      decodeText({
        content: utf16("<a/>", true, false),
        mediaType: "text/xml",
      }),
      "<a/>",
    );
    assert.equal(
      decodeText({
        content: utf16("<a/>", false, false),
        mediaType: "application/atom+xml",
      }),
      "<a/>",
    );
    assert.equal(
      decodeText({ content: utf8("<b/>"), mediaType: "text/plain" }),
      "<b/>",
    );
  });

  it("raises FOUT1190 and FOUT1200", () => {
    throwsCode(() => textDecoder("123"), "FOUT1190");
    throwsCode(() => decodeText(utf8("a"), "123"), "FOUT1190");
    throwsCode(() => decodeText(bytes(0xff, 0x41)), "FOUT1200");
    throwsCode(() => decodeText(bytes(0xc3), "utf-8"), "FOUT1190");
    throwsCode(() => decodeText(`a${ch(1)}`), "FOUT1190");
    assert.equal(textDecoder("UTF16").encoding, "utf-16be");
  });

  it("splits lines", () => {
    assert.deepEqual(splitLines("a\r\nb\rc\nd\n"), ["a", "b", "c", "d"]);
    assert.deepEqual(splitLines(""), []);
    assert.deepEqual(splitLines("\n\n"), ["", ""]);
  });
});

describe("fn:unparsed-text and its family", () => {
  const files = {
    "http://x/a.txt": "line 1\nline 2\n",
    "http://x/bytes.txt": { content: utf8("café"), encoding: "utf-8" },
  };
  const options = {
    baseUri: "http://x/",
    textLoader: (uri) => files[uri] ?? null,
  };
  const run = (expr) => xs(expr, null, options);

  it("loads, splits and probes text", () => {
    assert.equal(run("unparsed-text('a.txt')"), "line 1\nline 2\n");
    assert.equal(run("unparsed-text('bytes.txt', 'utf-8')"), "café");
    assert.equal(run("unparsed-text(()), unparsed-text((), 'utf-8')"), "");
    assert.equal(run("unparsed-text-lines('a.txt')"), "line 1 line 2");
    assert.equal(run("count(unparsed-text-lines(()))"), "0");
    assert.equal(
      run(
        "unparsed-text-available('a.txt'), unparsed-text-available('b.txt'), unparsed-text-available(())",
      ),
      "true false false",
    );
    assert.equal(run("unparsed-text-available('a.txt', '123')"), "false");
  });

  it("raises FOUT1170 for URIs that cannot be read", () => {
    const failing = (expr, opts = options) => code(expr, null, opts);
    assert.equal(failing("unparsed-text('a.txt#f')"), "FOUT1170");
    assert.equal(failing("unparsed-text('a%gg')"), "FOUT1170");
    assert.equal(failing("unparsed-text('a.txt')", {}), "FOUT1170");
    assert.equal(failing("unparsed-text('urn:x:none')"), "FOUT1170");
    const throwing = {
      textLoader: () => {
        throw new Error("no");
      },
    };
    assert.equal(failing("unparsed-text('http://x/a')", throwing), "FOUT1170");
  });

  it("reads no files unless a loader allows it", () => {
    const url = import.meta.url;
    assert.equal(code(`unparsed-text('${url}')`), "FOUT1170");
    assert.equal(xs(`unparsed-text-available('${url}')`), "false");
    assert.equal(xs("unparsed-text-available('http://example.com/')"), "false");
  });

  it("reads file: URIs with the readFileUri loader", () => {
    const url = import.meta.url;
    assert.equal(
      xs(`starts-with(unparsed-text('${url}'), 'import')`, null, {
        textLoader: readFileUri,
      }),
      "true",
    );
    assert.equal(readFileUri("http://example.com/"), null);
  });
});
