/**
 * Output encoding tests: representable characters per encoding, character
 * references in serialized output (XSLT 1.0 sections 16.1 and 16.2) and the
 * bytes written for each encoding.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { Buffer } from "node:buffer";
import { JSDOM } from "jsdom";
import {
  encodeOutput,
  getOutputEncoding,
  replaceUnencodable,
  splitUnencodable,
} from "./serializer/encoding.js";
import { htmlCharacterReference } from "./serializer/htmlEntities.js";
import { serializeResult } from "./serializer.js";
import { decodeXml } from "../../bin/lib/decode.js";

const { window } = new JSDOM("");

/**
 * Parse an XML string.
 *
 * @param {string} xml - Markup
 * @returns {Document} The document
 */
function parseXml(xml) {
  return new window.DOMParser().parseFromString(xml, "application/xml");
}

/**
 * Whether an encoding can represent a character.
 *
 * @param {string} label - Encoding label
 * @param {string} character - One character
 * @returns {boolean} True when no reference is needed
 */
function canEncode(label, character) {
  return replaceUnencodable(character, getOutputEncoding(label)) === character;
}

const hex = (bytes) => Buffer.from(bytes).toString("hex");

describe("getOutputEncoding()", () => {
  it("represents every character in UTF-8 and UTF-16", () => {
    for (const label of ["UTF-8", "utf8", "UTF-16", "utf-16be", "UCS-2"]) {
      assert.strictEqual(getOutputEncoding(label).isUnicode, true, label);
      assert.strictEqual(canEncode(label, "😀"), true, label);
    }
    assert.strictEqual(getOutputEncoding().name, "utf-8");
  });

  it("limits ISO-8859-1 to U+00FF", () => {
    for (const label of ["ISO-8859-1", "latin1", " L1 ", "iso_8859-1"]) {
      assert.strictEqual(getOutputEncoding(label).name, "iso-8859-1");
      assert.strictEqual(canEncode(label, "ÿ"), true);
      assert.strictEqual(canEncode(label, "€"), false);
    }
  });

  it("limits US-ASCII to U+007F", () => {
    for (const label of ["US-ASCII", "ascii", "ANSI_X3.4-1968"]) {
      assert.strictEqual(getOutputEncoding(label).name, "us-ascii");
      assert.strictEqual(canEncode(label, "~"), true);
      assert.strictEqual(canEncode(label, "é"), false);
    }
  });

  it("reads the repertoire of other single-byte encodings", () => {
    assert.strictEqual(canEncode("windows-1252", "€"), true);
    assert.strictEqual(canEncode("windows-1252", "Œ"), true);
    assert.strictEqual(canEncode("windows-1252", "Ā"), false);
    assert.strictEqual(canEncode("ISO-8859-2", "Ł"), true);
    assert.strictEqual(canEncode("ISO-8859-2", "é"), true);
    assert.strictEqual(canEncode("ISO-8859-2", "€"), false);
    assert.strictEqual(canEncode("koi8-r", "ж"), true);
  });

  it("treats multi-byte and unknown encodings as representing everything", () => {
    for (const label of ["Shift_JIS", "EUC-KR", "x-no-such-encoding"]) {
      const encoding = getOutputEncoding(label);
      assert.strictEqual(encoding.isUnicode, true, label);
      assert.strictEqual(encoding.isExact, false, label);
    }
    assert.strictEqual(getOutputEncoding("UTF-16").isExact, true);
  });

  it("caches encodings by label", () => {
    assert.strictEqual(
      getOutputEncoding("Windows-1250"),
      getOutputEncoding("windows-1250"),
    );
  });
});

describe("splitUnencodable()", () => {
  const latin1 = getOutputEncoding("latin1");

  it("returns one run for representable text", () => {
    assert.deepStrictEqual(splitUnencodable("aé", latin1), [
      { text: "aé", representable: true },
    ]);
    assert.deepStrictEqual(splitUnencodable("", latin1), [
      { text: "", representable: true },
    ]);
    assert.deepStrictEqual(splitUnencodable("€", getOutputEncoding()), [
      { text: "€", representable: true },
    ]);
  });

  it("isolates every unrepresentable code point", () => {
    assert.deepStrictEqual(splitUnencodable("€a😀€", latin1), [
      { text: "€", representable: false },
      { text: "a", representable: true },
      { text: "😀", representable: false },
      { text: "€", representable: false },
    ]);
  });
});

describe("htmlCharacterReference()", () => {
  it("prefers HTML 4.01 entity names", () => {
    assert.strictEqual(htmlCharacterReference(0x20ac), "&euro;");
    assert.strictEqual(htmlCharacterReference(0xa0), "&nbsp;");
    assert.strictEqual(htmlCharacterReference(0xff), "&yuml;");
    assert.strictEqual(htmlCharacterReference(0x3c9), "&omega;");
    assert.strictEqual(htmlCharacterReference(0x2666), "&diams;");
    assert.strictEqual(htmlCharacterReference(0x1f600), "&#128512;");
  });
});

describe("encodeOutput()", () => {
  it("writes UTF-8 without a byte order mark", () => {
    assert.strictEqual(hex(encodeOutput("é")), "c3a9");
    assert.strictEqual(hex(encodeOutput("é", "UTF-8")), "c3a9");
  });

  it("writes UTF-16 with a byte order mark", () => {
    assert.strictEqual(hex(encodeOutput("a", "UTF-16")), "fffe6100");
    assert.strictEqual(hex(encodeOutput("a", "UTF-16BE")), "feff0061");
    assert.strictEqual(hex(encodeOutput("😀", "utf-16le")), "fffe3dd800de");
  });

  it("writes single-byte encodings", () => {
    assert.strictEqual(hex(encodeOutput("é", "ISO-8859-1")), "e9");
    assert.strictEqual(hex(encodeOutput("€", "windows-1252")), "80");
    assert.strictEqual(hex(encodeOutput("Ł", "ISO-8859-2")), "a3");
    assert.strictEqual(hex(encodeOutput("a", "US-ASCII")), "61");
  });

  it("writes a character reference for a character without a byte", () => {
    assert.strictEqual(
      Buffer.from(encodeOutput("<!--€-->", "latin1")).toString("latin1"),
      "<!--&#8364;-->",
    );
  });

  it("falls back to UTF-8 for encodings without an encoder", () => {
    assert.strictEqual(hex(encodeOutput("é", "Shift_JIS")), "c3a9");
  });

  it("round trips through the CLI decoder", () => {
    const text = '<?xml version="1.0" encoding="ISO-8859-1"?>\n<r a="é">ÿ</r>';
    assert.strictEqual(decodeXml(encodeOutput(text, "ISO-8859-1")), text);
    const utf16 = '<?xml version="1.0" encoding="UTF-16"?><r>€😀</r>';
    assert.strictEqual(decodeXml(encodeOutput(utf16, "UTF-16")), utf16);
  });
});

describe("serialized output uses character references", () => {
  const serialize = (xml, settings) =>
    serializeResult(parseXml(xml), {
      omitXmlDeclaration: "yes",
      ...settings,
    });

  it("in text and attributes of ISO-8859-1 output", () => {
    assert.strictEqual(
      serialize('<r a="€é">€é😀</r>', { encoding: "ISO-8859-1" }),
      '<r a="&#8364;é">&#8364;é&#128512;</r>',
    );
  });

  it("keeps the XML declaration naming the encoding", () => {
    assert.strictEqual(
      serializeResult(parseXml("<r>€</r>"), { encoding: "ISO-8859-1" }),
      '<?xml version="1.0" encoding="ISO-8859-1"?>\n<r>&#8364;</r>',
    );
  });

  it("in US-ASCII output, including namespace URIs", () => {
    assert.strictEqual(
      serialize('<r xmlns:p="urn:é" p:a="é">é</r>', { encoding: "US-ASCII" }),
      '<r xmlns:p="urn:&#233;" p:a="&#233;">&#233;</r>',
    );
  });

  it("not in UTF-8 output", () => {
    assert.strictEqual(serialize("<r>€😀</r>", {}), "<r>€😀</r>");
  });

  it("between split CDATA sections", () => {
    const settings = { encoding: "ISO-8859-1", cdataSectionElements: "r" };
    assert.strictEqual(
      serialize("<r>a€b</r>", settings),
      "<r><![CDATA[a]]>&#8364;<![CDATA[b]]></r>",
    );
    assert.strictEqual(
      serialize("<r>€]]&gt;é€</r>", settings),
      "<r>&#8364;<![CDATA[]]]]><![CDATA[>é]]>&#8364;</r>",
    );
    assert.strictEqual(
      serialize("<r><![CDATA[x€]]></r>", { encoding: "latin1" }),
      "<r><![CDATA[x]]>&#8364;</r>",
    );
  });

  it("leaves comments and processing instructions unchanged", () => {
    assert.strictEqual(
      serialize("<r><!--€--><?pi €?></r>", { encoding: "US-ASCII" }),
      "<r><!--€--><?pi €?></r>",
    );
  });

  it("with HTML entity names in html output", () => {
    assert.strictEqual(
      serialize(
        '<html><p title="€">€é😀</p><script>var a="€";</script></html>',
        { method: "html", encoding: "ISO-8859-1" },
      ),
      '<html><p title="&euro;">&euro;é&#128512;</p><script>var a="€";</script></html>',
    );
  });
});
