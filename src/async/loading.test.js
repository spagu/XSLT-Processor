/**
 * Asynchronous loading building blocks: AbortSignal helpers, loaders,
 * static document() URI discovery and preloading of stylesheet modules.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { abortable, throwIfAborted } from "./abort.js";
import { createDocumentFetcher, resolveAsyncLoader } from "./loaders.js";
import {
  literalDocumentArguments,
  staticDocumentUris,
} from "./documentUris.js";
import {
  moduleReferences,
  preloadDocuments,
  preloadModules,
  preloadedDocumentLoader,
  preloadedStylesheetLoader,
} from "./preload.js";

const { AbortController, AbortSignal, Response, TextEncoder } = globalThis;

const { window } = new JSDOM("");
const parseXML = (markup) =>
  new window.DOMParser().parseFromString(markup, "application/xml");
const XSL = 'xmlns:xsl="http://www.w3.org/1999/XSL/Transform"';

describe("abort helpers", () => {
  it("throws the reason of an aborted signal", () => {
    throwIfAborted(undefined);
    throwIfAborted(new AbortController().signal);
    assert.throws(() => throwIfAborted(AbortSignal.abort(new Error("x"))), /x/);
    assert.throws(
      () => throwIfAborted({ aborted: true }),
      (error) => error.name === "AbortError",
    );
  });

  it("races work against the signal", async () => {
    assert.strictEqual(await abortable(1), 1);
    const controller = new AbortController();
    assert.strictEqual(
      await abortable(Promise.resolve(2), controller.signal),
      2,
    );
    await assert.rejects(
      abortable(Promise.reject(new Error("no")), controller.signal),
      /no/,
    );
    const pending = abortable(new Promise(() => {}), controller.signal);
    controller.abort(new Error("late"));
    await assert.rejects(pending, /late/);
    await assert.rejects(abortable(3, controller.signal), /late/);
  });
});

describe("resolveAsyncLoader", () => {
  it("returns a given loader and rejects non-functions", () => {
    const loader = async () => null;
    assert.strictEqual(resolveAsyncLoader(loader), loader);
    assert.throws(() => resolveAsyncLoader("x"), TypeError);
  });

  it("falls back to fetch, when there is one", async () => {
    const saved = globalThis.fetch;
    try {
      const seen = [];
      globalThis.fetch = async (uri, init) => {
        seen.push([uri, init.signal]);
        return new Response("<a/>");
      };
      const loader = resolveAsyncLoader(undefined);
      const response = await loader("http://x/a.xml", undefined);
      assert.strictEqual(await response.text(), "<a/>");
      assert.deepStrictEqual(seen, [["http://x/a.xml", undefined]]);
      delete globalThis.fetch;
      assert.throws(() => resolveAsyncLoader(null), /no global fetch/);
    } finally {
      globalThis.fetch = saved;
    }
  });
});

describe("createDocumentFetcher", () => {
  before(() => {
    globalThis.DOMParser = window.DOMParser;
  });
  after(() => {
    delete globalThis.DOMParser;
  });

  it("turns every supported loader result into a document", async () => {
    const doc = parseXML("<n/>");
    const results = {
      doc,
      text: "<t/>",
      bytes: new TextEncoder().encode("<b/>"),
      buffer: new TextEncoder().encode("<ab/>").buffer,
      response: new Response("<r/>"),
    };
    const fetchDocument = createDocumentFetcher(async (uri) => results[uri]);
    assert.strictEqual(await fetchDocument("doc"), doc);
    for (const [uri, name] of [
      ["text", "t"],
      ["bytes", "b"],
      ["buffer", "ab"],
      ["response", "r"],
    ]) {
      assert.strictEqual(
        (await fetchDocument(uri)).documentElement.nodeName,
        name,
      );
    }
    assert.strictEqual(await fetchDocument("missing"), null);
  });

  it("rejects failed responses and unsupported values", async () => {
    const fetchDocument = createDocumentFetcher(async (uri) =>
      uri === "404" ? new Response("", { status: 404 }) : 42,
    );
    await assert.rejects(fetchDocument("404"), /HTTP 404/);
    await assert.rejects(fetchDocument("n"), /unsupported value/);
  });

  it("loads each URI once and passes base URI and signal", async () => {
    const calls = [];
    const { signal } = new AbortController();
    const fetchDocument = createDocumentFetcher(
      async (uri, baseUri, init) => {
        calls.push([uri, baseUri, init.signal === signal]);
        return "<a/>";
      },
      { signal },
    );
    const [first, second] = await Promise.all([
      fetchDocument("a.xml", "main.xsl"),
      fetchDocument("a.xml", "other.xsl"),
    ]);
    assert.strictEqual(first, second);
    assert.deepStrictEqual(calls, [["a.xml", "main.xsl", true]]);
  });

  it("turns a throwing loader into a rejection", async () => {
    const fetchDocument = createDocumentFetcher(() => {
      throw new Error("sync failure");
    });
    await assert.rejects(fetchDocument("a"), /sync failure/);
  });
});

describe("static document() URIs", () => {
  it("finds literal document() calls in expressions", () => {
    assert.deepStrictEqual(
      literalDocumentArguments(
        "concat(document('a.xml')/x[document(\"b.xml\")], document(@c), document('d', /), f:document('e'))",
      ).sort(),
      ["a.xml", "b.xml"],
    );
    assert.deepStrictEqual(
      literalDocumentArguments("document('a.xml') | document(@c)"),
      ["a.xml"],
    );
    assert.deepStrictEqual(literalDocumentArguments("document("), []);
  });

  it("scans expression attributes and attribute value templates", () => {
    const style = parseXML(`<xsl:stylesheet version="1.0" ${XSL}>
      <xsl:variable name="v" select="document('v.xml#frag')"/>
      <xsl:template match="/">
        <xsl:if test="document('if.xml')"/>
        <out href="{document('avt.xml')/a}" plain="document('no.xml')" bad="{"/>
        <xsl:element name="{name(document('name.xml')/*)}"/>
        <xsl:value-of select="document('')"/>
        <xsl:copy-of select="document(@computed)"/>
      </xsl:template>
    </xsl:stylesheet>`);
    assert.deepStrictEqual(staticDocumentUris(style, "/xsl/main.xsl"), [
      "/xsl/v.xml",
      "/xsl/if.xml",
      "/xsl/avt.xml",
      "/xsl/name.xml",
    ]);
    assert.deepStrictEqual(
      staticDocumentUris(style.documentElement, undefined).length,
      4,
    );
  });
});

describe("preloading", () => {
  const module = (body) =>
    parseXML(`<xsl:stylesheet version="1.0" ${XSL}>${body}</xsl:stylesheet>`);

  it("lists the resolved import and include hrefs", () => {
    const style = module(
      '<xsl:import href="a.xsl"/><xsl:include href="sub/b.xsl"/><xsl:include/><xsl:template match="x"/>',
    );
    assert.deepStrictEqual(
      moduleReferences(style.documentElement, "/x/main.xsl"),
      ["/x/a.xsl", "/x/sub/b.xsl"],
    );
  });

  it("loads a tree in parallel, each module once", async () => {
    const files = {
      "/a.xsl": module('<xsl:import href="c.xsl"/>'),
      "/b.xsl": module('<xsl:include href="c.xsl"/>'),
      "/c.xsl": module('<xsl:include href="main.xsl"/>'),
    };
    const calls = [];
    const modules = await preloadModules(
      module('<xsl:import href="a.xsl"/><xsl:include href="b.xsl"/>'),
      "/main.xsl",
      async (uri, baseUri) => {
        calls.push([uri, baseUri]);
        return files[uri];
      },
    );
    assert.deepStrictEqual([...modules.keys()], ["/a.xsl", "/b.xsl", "/c.xsl"]);
    assert.deepStrictEqual(calls, [
      ["/a.xsl", "/main.xsl"],
      ["/b.xsl", "/main.xsl"],
      ["/c.xsl", "/a.xsl"],
    ]);
    assert.strictEqual(
      preloadedStylesheetLoader(modules)("/c.xsl"),
      files["/c.xsl"],
    );
  });

  it("fails when a module cannot be loaded", async () => {
    await assert.rejects(
      preloadModules(
        module('<xsl:import href="gone.xsl"/>'),
        undefined,
        async () => null,
      ),
      /Cannot load stylesheet "gone.xsl"/,
    );
  });

  it("keeps document load failures until they are used", async () => {
    const found = parseXML("<found/>");
    const documents = await preloadDocuments(
      [
        module(
          "<xsl:variable name='a' select=\"document('ok.xml') | document('bad.xml')\"/>",
        ),
      ],
      "/main.xsl",
      async (uri) => {
        if (uri === "/bad.xml") throw new Error("404");
        return found;
      },
    );
    const load = preloadedDocumentLoader(documents, (uri) => `fallback ${uri}`);
    assert.strictEqual(load("/ok.xml"), found);
    assert.throws(() => load("/bad.xml"), /404/);
    assert.strictEqual(load("/other.xml", "/main.xsl"), "fallback /other.xml");
    assert.strictEqual(
      preloadedDocumentLoader(documents, null)("/other.xml"),
      null,
    );
  });

  it("rejects at once when aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await assert.rejects(
      preloadDocuments(
        [module("<xsl:variable name='a' select=\"document('x.xml')\"/>")],
        undefined,
        async () => {
          throw new Error("cancelled");
        },
        controller.signal,
      ),
      /cancelled/,
    );
  });
});
