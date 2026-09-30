/**
 * The asynchronous XSLTProcessor API: importStylesheetAsync, transformAsync
 * and transformToStream.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import {
  domEnvironment,
  parseXmlDocument as parseXML,
} from "../domEnvironment.test.js";
import { XSLTProcessor } from "../XSLTProcessor.js";
import { XmlWriter } from "../xslt/serializer.js";
import { chunkStream, transformToStream } from "./stream.js";

const { AbortController, AbortSignal, Blob, Response, setTimeout } = globalThis;

const { window } = domEnvironment;
const XSL = 'xmlns:xsl="http://www.w3.org/1999/XSL/Transform"';
const stylesheet = (body, extra = "") =>
  `<xsl:stylesheet version="1.0" ${XSL}>${extra}${body}</xsl:stylesheet>`;
const itemsStylesheet = stylesheet(
  '<xsl:output omit-xml-declaration="yes"/><xsl:template match="/"><list><xsl:for-each select="//i"><item><xsl:value-of select="."/></item></xsl:for-each></list></xsl:template>',
);

/**
 * A source document with `count` items.
 *
 * @param {number} count - Number of items
 * @returns {string} The markup
 */
const itemsXml = (count) =>
  `<r>${Array.from({ length: count }, (_, i) => `<i>${i}</i>`).join("")}</r>`;

/**
 * Read a stream to its end.
 *
 * @param {ReadableStream<string>} stream - The stream
 * @returns {Promise<string[]>} Its chunks
 */
async function readAll(stream) {
  const chunks = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
}

before(() => {
  globalThis.DOMParser = window.DOMParser;
});

after(() => {
  delete globalThis.DOMParser;
});

describe("importStylesheetAsync", () => {
  const files = {
    "/xsl/common.xsl": stylesheet(
      '<xsl:template name="common">common</xsl:template>',
      '<xsl:include href="parts/leaf.xsl"/>',
    ),
    "/xsl/parts/leaf.xsl": stylesheet(
      '<xsl:template name="leaf">leaf</xsl:template>',
    ),
    "/xsl/base.xsl": stylesheet(
      '<xsl:template match="/">base</xsl:template>',
      '<xsl:import href="common.xsl"/>',
    ),
    "/xsl/data.xml": "<data><v>preloaded</v></data>",
  };
  const loader = async (uri) => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return files[uri] ?? null;
  };

  it("loads an import/include tree before compiling", async () => {
    const processor = new XSLTProcessor();
    await processor.importStylesheetAsync(
      stylesheet(
        '<xsl:template match="/"><r><xsl:call-template name="common"/>|<xsl:call-template name="leaf"/>|<xsl:value-of select="document(\'data.xml\')/data/v"/></r></xsl:template>',
        '<xsl:import href="base.xsl"/><xsl:include href="common.xsl"/>',
      ),
      "/xsl/main.xsl",
      { loader },
    );
    assert.strictEqual(
      processor.transformToString(parseXML("<x/>")),
      '<?xml version="1.0" encoding="UTF-8"?>\n<r>common|leaf|preloaded</r>',
    );
  });

  it("accepts a stylesheet element", async () => {
    const processor = new XSLTProcessor();
    const doc = parseXML(
      stylesheet(
        '<xsl:output method="text"/><xsl:template match="/">el</xsl:template>',
      ),
    );
    await processor.importStylesheetAsync(doc.documentElement);
    assert.strictEqual(await processor.transformAsync("<a/>"), "el");
  });

  it("rejects a cycle in the import tree", async () => {
    const processor = new XSLTProcessor();
    const cyclic = {
      "/a.xsl": stylesheet("", '<xsl:include href="b.xsl"/>'),
      "/b.xsl": stylesheet("", '<xsl:import href="a.xsl"/>'),
    };
    await assert.rejects(
      processor.importStylesheetAsync(
        stylesheet("", '<xsl:include href="a.xsl"/>'),
        "/main.xsl",
        { loader: async (uri) => cyclic[uri] },
      ),
      /Circular stylesheet reference detected: \/a\.xsl/,
    );
    assert.strictEqual(processor.engine, null);
  });

  it("reports a document() load failure only when it is evaluated", async () => {
    const processor = new XSLTProcessor();
    const documentLoader = async (uri) => {
      throw new Error(`cannot read ${uri}`);
    };
    await processor.importStylesheetAsync(
      stylesheet(
        '<xsl:param name="use" select="0"/><xsl:output method="text"/><xsl:template match="/"><xsl:if test="$use = 1"><xsl:value-of select="document(\'x.xml\')"/></xsl:if>ok</xsl:template>',
      ),
      "/main.xsl",
      { documentLoader },
    );
    assert.strictEqual(await processor.transformAsync("<a/>"), "ok");
    processor.setParameter(null, "use", 1);
    await assert.rejects(
      processor.transformAsync("<a/>"),
      /cannot read \/x\.xml/,
    );
  });

  it("keeps the synchronous document loader for computed URIs", async () => {
    const processor = new XSLTProcessor();
    processor.setDocumentLoader((uri) => `<d>${uri}</d>`);
    await processor.importStylesheetAsync(
      stylesheet(
        '<xsl:output method="text"/><xsl:template match="/"><xsl:value-of select="document(concat(\'dyn\', \'.xml\'))"/>|<xsl:value-of select="document(\'data.xml\')"/></xsl:template>',
      ),
      "/xsl/main.xsl",
      { loader },
    );
    assert.strictEqual(
      await processor.transformAsync("<a/>"),
      "/xsl/dyn.xml|preloaded",
    );
    // Replacing the synchronous loader keeps the preloaded documents
    processor.setDocumentLoader((uri) => `<d>new ${uri}</d>`);
    assert.strictEqual(
      await processor.transformAsync("<a/>"),
      "new /xsl/dyn.xml|preloaded",
    );
    processor.reset();
    assert.deepStrictEqual(processor._modules, []);
  });

  it("uses fetch when no loader is given, and needs none without references", async () => {
    const saved = globalThis.fetch;
    try {
      globalThis.fetch = async (uri) =>
        new Response(files[uri], { status: files[uri] ? 200 : 404 });
      const processor = new XSLTProcessor();
      await processor.importStylesheetAsync(
        stylesheet(
          '<xsl:template match="/"><xsl:call-template name="leaf"/></xsl:template>',
          '<xsl:include href="parts/leaf.xsl"/>',
        ),
        "/xsl/main.xsl",
      );
      assert.match(processor.transformToString(parseXML("<a/>")), /leaf$/);
      delete globalThis.fetch;
      await processor.importStylesheetAsync(
        stylesheet('<xsl:template match="/">plain</xsl:template>'),
      );
      assert.match(processor.transformToString(parseXML("<a/>")), /plain$/);
    } finally {
      globalThis.fetch = saved;
    }
  });

  it("validates loaders and honours an aborted signal", async () => {
    const processor = new XSLTProcessor();
    await assert.rejects(
      processor.importStylesheetAsync("<x/>", undefined, { loader: "no" }),
      TypeError,
    );
    await assert.rejects(
      processor.importStylesheetAsync(stylesheet(""), undefined, {
        signal: AbortSignal.abort(new Error("aborted")),
      }),
      /aborted/,
    );
    const controller = new AbortController();
    const pending = processor.importStylesheetAsync(
      stylesheet("", '<xsl:import href="slow.xsl"/>'),
      "/main.xsl",
      { loader: () => new Promise(() => {}), signal: controller.signal },
    );
    controller.abort(new Error("too slow"));
    await assert.rejects(pending, /too slow/);
    assert.strictEqual(processor.engine, null);
  });
});

describe("transformAsync", () => {
  it("reads string, byte and stream sources", async () => {
    const processor = new XSLTProcessor();
    processor.importStylesheet(
      parseXML(
        stylesheet(
          '<xsl:output method="text"/><xsl:template match="/"><xsl:value-of select="/a"/></xsl:template>',
        ),
      ),
    );
    const latin1 = Buffer.concat([
      Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><a>caf'),
      Buffer.from([0xe9]),
      Buffer.from("</a>"),
    ]);
    const utf8 = Buffer.from("<a>zażółć</a>");
    assert.strictEqual(await processor.transformAsync("<a>text</a>"), "text");
    assert.strictEqual(
      await processor.transformAsync(parseXML("<a>node</a>")),
      "node",
    );
    assert.strictEqual(
      await processor.transformAsync(
        Readable.from([latin1.subarray(0, 48), latin1.subarray(48)]),
      ),
      "café",
    );
    assert.strictEqual(
      await processor.transformAsync(
        Readable.from([utf8.subarray(0, 6), utf8.subarray(6)]),
      ),
      "zażółć",
    );
    assert.strictEqual(
      await processor.transformAsync(new Blob(["<a>blob</a>"]).stream()),
      "blob",
    );
  });

  it("imports a stylesheet given as an option", async () => {
    const processor = new XSLTProcessor();
    const result = await processor.transformAsync("<a>1</a>", {
      stylesheet: stylesheet(
        '<xsl:output method="text"/><xsl:template match="/"><xsl:call-template name="t"/>:<xsl:value-of select="document(\'d.xml\')"/></xsl:template>',
        '<xsl:include href="t.xsl"/>',
      ),
      stylesheetUri: "/main.xsl",
      fetchStylesheet: async () =>
        stylesheet('<xsl:template name="t">T</xsl:template>'),
      fetchDocument: async () => "<d>D</d>",
    });
    assert.strictEqual(result, "T:D");
  });

  it("preloads document() documents of an imported stylesheet", async () => {
    const processor = new XSLTProcessor();
    processor.importStylesheet(
      parseXML(
        stylesheet(
          '<xsl:output method="text"/><xsl:template match="/"><xsl:value-of select="document(\'d.xml\')"/></xsl:template>',
        ),
      ),
      "/x/main.xsl",
    );
    const seen = [];
    const result = await processor.transformAsync("<a/>", {
      fetchDocument: async (uri) => {
        seen.push(uri);
        return "<d>fetched</d>";
      },
    });
    assert.strictEqual(result, "fetched");
    assert.deepStrictEqual(seen, ["/x/d.xml"]);
  });

  it("rejects without stylesheet, for bad sources and on errors", async () => {
    const processor = new XSLTProcessor();
    await assert.rejects(
      processor.transformAsync("<a/>"),
      /No stylesheet has been imported/,
    );
    processor.importStylesheet(
      parseXML(
        stylesheet(
          '<xsl:template match="/"><xsl:message terminate="yes">stop</xsl:message></xsl:template>',
        ),
      ),
    );
    await assert.rejects(processor.transformAsync("<a/>"), /stop/);
    await assert.rejects(
      processor.transformAsync(parseXML("<a/>").createTextNode("t")),
      /not a valid node type/,
    );
    await assert.rejects(
      processor.transformAsync("<a/>", { fetchDocument: 1 }),
      TypeError,
    );
    await assert.rejects(
      processor.transformAsync("<a/>", {
        signal: AbortSignal.abort(new Error("stop now")),
      }),
      /stop now/,
    );
  });
});

describe("transformToStream", () => {
  it("streams the same output as transformToString, in bounded chunks", async () => {
    const processor = new XSLTProcessor();
    processor.importStylesheet(parseXML(itemsStylesheet));
    const source = parseXML(itemsXml(5000));
    const chunks = await readAll(
      processor.transformToStream(source, { chunkSize: 1000 }),
    );
    assert.ok(chunks.length > 10);
    assert.ok(chunks.every((chunk) => chunk.length <= 1000));
    assert.strictEqual(chunks.join(""), processor.transformToString(source));
  });

  it("delivers the first chunk before the output is serialized", async () => {
    const processor = new XSLTProcessor();
    processor.importStylesheet(parseXML(itemsStylesheet));
    const original = XmlWriter.prototype.escapeText;
    let escaped = 0;
    XmlWriter.prototype.escapeText = function (value) {
      escaped++;
      return original.call(this, value);
    };
    try {
      const reader = processor
        .transformToStream(itemsXml(20000), { chunkSize: 512 })
        .getReader();
      const { value } = await reader.read();
      assert.strictEqual(value.length, 512);
      assert.ok(escaped < 1000, `${escaped} text nodes written for one chunk`);
      await reader.cancel();
      assert.ok(escaped < 1000, "cancelling stops the serialization");
    } finally {
      XmlWriter.prototype.escapeText = original;
    }
  });

  it("errors the stream when aborted mid-stream", async () => {
    const processor = new XSLTProcessor();
    processor.importStylesheet(parseXML(itemsStylesheet));
    const controller = new AbortController();
    const reader = processor
      .transformToStream(parseXML(itemsXml(2000)), {
        chunkSize: 256,
        signal: controller.signal,
      })
      .getReader();
    await reader.read();
    controller.abort(new Error("client went away"));
    await assert.rejects(reader.read(), /client went away/);
  });

  it("rejects bad arguments at once and errors the stream on failures", async () => {
    const processor = new XSLTProcessor();
    assert.throws(
      () => processor.transformToStream("<a/>"),
      /No stylesheet has been imported/,
    );
    processor.importStylesheet(
      parseXML(
        stylesheet(
          '<xsl:template match="/"><xsl:message terminate="yes">halt</xsl:message></xsl:template>',
        ),
      ),
    );
    assert.throws(
      () => processor.transformToStream(parseXML("<a/>").createComment("c")),
      TypeError,
    );
    assert.throws(
      () => processor.transformToStream("<a/>", { chunkSize: 0 }),
      RangeError,
    );
    await assert.rejects(readAll(processor.transformToStream("<a/>")), /halt/);
    await assert.rejects(
      readAll(processor.transformToStream("<a>")),
      /XML parse error/,
    );
    await assert.rejects(
      readAll(
        processor.transformToStream("<a/>", {
          signal: AbortSignal.abort(new Error("early")),
        }),
      ),
      /early/,
    );
  });

  it("removes its abort listener when done, failed or cancelled", async () => {
    const processor = new XSLTProcessor();
    processor.importStylesheet(parseXML(itemsStylesheet));
    const { signal } = new AbortController();
    const chunks = await readAll(
      processor.transformToStream("<r><i>1</i></r>", { signal }),
    );
    assert.strictEqual(chunks.join(""), "<list><item>1</item></list>");
    await assert.rejects(
      readAll(processor.transformToStream("<r>", { signal })),
      /XML parse error/,
    );
    const stream = processor.transformToStream(itemsXml(3000), {
      signal,
      chunkSize: 64,
    });
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();
    assert.strictEqual(signal.aborted, false);
  });

  it("is available on the engine side", async () => {
    const processor = new XSLTProcessor();
    processor.importStylesheet(
      parseXML(
        stylesheet(
          '<xsl:output method="text"/><xsl:template match="/">engine</xsl:template>',
        ),
      ),
    );
    const chunks = await readAll(
      transformToStream(processor.engine, parseXML("<a/>")),
    );
    assert.deepStrictEqual(chunks, ["engine"]);
  });

  it("needs a ReadableStream implementation", () => {
    const saved = globalThis.ReadableStream;
    try {
      delete globalThis.ReadableStream;
      assert.throws(
        () => chunkStream(() => [][Symbol.iterator]()),
        /ReadableStream is not available/,
      );
    } finally {
      globalThis.ReadableStream = saved;
    }
  });
});
