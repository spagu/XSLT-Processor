import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeSettings } from "../params/settings.js";
import { OutputBuffer } from "./buffer.js";
import { encodeText, resolveEncoding } from "./encoding.js";
import { characterReference, Expander } from "./expander.js";

const expander = (params) => new Expander(normalizeSettings(params));
const code = (fn) => {
  try {
    fn();
    return null;
  } catch (error) {
    return error.code;
  }
};

describe("the output buffer", () => {
  it("collects markup and hands it out in chunks", () => {
    const buffer = new OutputBuffer(4);
    buffer.write("ab");
    buffer.write("");
    assert.equal(buffer.full, false);
    buffer.write("cd");
    assert.equal(buffer.full, true);
    assert.equal(buffer.take(), "abcd");
    assert.equal(buffer.take(), "");
    assert.equal(new OutputBuffer().chunkSize, 16384);
  });
});

describe("encodings", () => {
  it("resolves names and what they can represent", () => {
    assert.equal(resolveEncoding("utf8").encodable, null);
    assert.equal(resolveEncoding("UTF-16LE").kind, "utf-16le");
    assert.equal(resolveEncoding("ISO-8859-1").encodable(0xff), true);
    assert.equal(resolveEncoding("latin1").encodable(0x100), false);
    assert.equal(resolveEncoding("US-ASCII").encodable(0x80), false);
    const cyrillic = resolveEncoding("windows-1251");
    assert.equal(cyrillic.encodable(0x0416), true);
    assert.equal(cyrillic.encodable(0x00e9), false);
    assert.equal(resolveEncoding("ISO-8859-2").encodable(0x0141), true);
    assert.equal(
      code(() => resolveEncoding("no-such")),
      "SESU0007",
    );
  });

  it("encodes text", () => {
    const bytes = (text, name, bom = false) => [
      ...encodeText(text, resolveEncoding(name), bom),
    ];
    assert.deepEqual(bytes("é", "UTF-8"), [0xc3, 0xa9]);
    assert.deepEqual(bytes("a", "UTF-8", true), [0xef, 0xbb, 0xbf, 0x61]);
    assert.deepEqual(bytes("a", "UTF-16", true), [0xfe, 0xff, 0, 0x61]);
    assert.deepEqual(bytes("a", "UTF-16LE"), [0x61, 0]);
    assert.deepEqual(bytes("é", "ISO-8859-1", true), [0xe9]);
    assert.deepEqual(bytes("Ж", "windows-1251"), [0xc6]);
  });
});

describe("character expansion", () => {
  it("escapes text and attributes for XML", () => {
    const x = expander();
    assert.equal(
      x.text('a<&>"\r\u0085 \t\n'),
      'a&lt;&amp;&gt;"&#xD;&#x85;&#x2028;\t\n',
    );
    assert.equal(
      x.attribute('<&>"\t\n\r'),
      "&lt;&amp;&gt;&quot;&#x9;&#xA;&#xD;",
    );
    assert.equal(
      code(() => x.text("\u0001")),
      "SERE0006",
    );
    assert.equal(expander({ version: "1.1" }).text("\u0001"), "&#x1;");
    assert.equal(characterReference(0x1d11e), "&#x1D11E;");
  });

  it("escapes for HTML", () => {
    const h = expander({ method: "html" });
    assert.equal(h.text("<&>\r"), "&lt;&amp;&gt;\r");
    assert.equal(h.attribute('a&b&{c}<"'), "a&amp;b&{c}<&quot;");
    assert.equal(
      code(() => h.text("\u0085")),
      "SERE0014",
    );
    assert.equal(
      code(() => h.attribute("\u009F")),
      "SERE0014",
    );
    assert.equal(
      code(() => h.raw("\u0080")),
      "SERE0014",
    );
  });

  it("writes references for unencodable characters", () => {
    const ascii = expander({ encoding: "US-ASCII" });
    assert.equal(ascii.text("é<"), "&#xE9;&lt;");
    assert.equal(ascii.attribute("𝄞"), "&#x1D11E;");
    const latin = expander({ encoding: "ISO-8859-1" });
    assert.equal(latin.text("é€"), "é&#x20AC;");
    assert.equal(
      expander({ encoding: "ISO-8859-1", method: "html" }).text("é€"),
      "é&#x20AC;",
    );
    assert.equal(
      code(() => ascii.unescaped("é")),
      "SERE0008",
    );
    assert.equal(ascii.unescaped("e"), "e");
  });

  it("applies character maps and normalization", () => {
    const mapped = expander({ useCharacterMaps: { $: "£", "<": "<!" } });
    assert.equal(mapped.text("a$b<c"), "a£b<!c");
    assert.equal(mapped.text("$"), "£");
    const nfc = expander({ normalizationForm: "NFC" });
    assert.equal(nfc.text("é"), "é");
    assert.equal(nfc.raw("é"), "é");
  });

  it("writes CDATA sections", () => {
    assert.equal(expander().cdata("a]]>b"), "<![CDATA[a]]]]><![CDATA[>b]]>");
    assert.equal(
      expander({ encoding: "US-ASCII" }).cdata("aéb"),
      "<![CDATA[a]]>&#xE9;<![CDATA[b]]>",
    );
    assert.equal(expander({ encoding: "US-ASCII" }).cdata("é"), "&#xE9;");
    const mapped = expander({ useCharacterMaps: { $: "£" } });
    assert.equal(mapped.cdata("a$b"), "<![CDATA[a]]>£<![CDATA[b]]>");
  });
});
