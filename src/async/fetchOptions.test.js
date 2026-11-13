/**
 * fetchOptions (issue #34): the RequestInit of the requests the processor
 * makes itself with fetch, from the constructor or per call, e.g.
 * `{ credentials: "include" }` for a cross-origin server that needs cookies.
 *
 * Run: node --test src/async/fetchOptions.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { domEnvironment } from "../domEnvironment.test.js";
import { XSLTProcessor } from "../XSLTProcessor.js";
import { checkFetchOptions, resolveAsyncLoader } from "./loaders.js";

const { AbortController, Response } = globalThis;
const XSL = 'xmlns:xsl="http://www.w3.org/1999/XSL/Transform"';
const MAIN = `<xsl:stylesheet version="1.0" ${XSL}><xsl:import href="https://cdn.test/common.xsl"/><xsl:template match="/"><o><xsl:value-of select="document('https://cdn.test/data.xml')/d"/><xsl:call-template name="c"/></o></xsl:template></xsl:stylesheet>`;
const FILES = {
  "https://cdn.test/common.xsl": `<xsl:stylesheet version="1.0" ${XSL}><xsl:template name="c">!</xsl:template></xsl:stylesheet>`,
  "https://cdn.test/data.xml": "<d>data</d>",
};

/** Requests made through the stubbed global fetch: [uri, init]. */
let requests = [];
let savedFetch;
let savedParser;

before(() => {
  savedFetch = globalThis.fetch;
  savedParser = globalThis.DOMParser;
  globalThis.DOMParser = domEnvironment.window.DOMParser;
  globalThis.fetch = async (uri, init) => {
    requests.push([uri, init]);
    return new Response(FILES[uri]);
  };
});

after(() => {
  globalThis.fetch = savedFetch;
  globalThis.DOMParser = savedParser;
});

/**
 * Import MAIN asynchronously and transform, returning the inits of the
 * requests.
 *
 * @param {object} [processorOptions] - XSLTProcessor options
 * @param {object} [callOptions] - importStylesheetAsync options
 * @returns {Promise<{inits: object[], output: string}>} What fetch received
 */
async function run(processorOptions, callOptions) {
  requests = [];
  const processor = new XSLTProcessor(processorOptions);
  await processor.importStylesheetAsync(
    MAIN,
    "https://site.test/main.xsl",
    callOptions,
  );
  const output = await processor.transformAsync("<r/>");
  return { inits: requests.map(([, init]) => init), output };
}

describe("checkFetchOptions", () => {
  it("accepts an object or nothing, and rejects anything else", () => {
    const init = { credentials: "include" };
    assert.strictEqual(checkFetchOptions(init), init);
    assert.strictEqual(checkFetchOptions(undefined), undefined);
    assert.strictEqual(checkFetchOptions(null), undefined);
    for (const bad of ["include", [], 1]) {
      assert.throws(
        () => checkFetchOptions(bad),
        /fetchOptions must be an object/,
      );
    }
    assert.throws(
      () => new XSLTProcessor({ fetchOptions: "include" }),
      TypeError,
    );
  });
});

describe("the default fetch loader", () => {
  it("sends the processor's fetchOptions with xsl:import and document()", async () => {
    const { inits, output } = await run({
      fetchOptions: { credentials: "include", mode: "cors" },
    });
    assert.match(output, /data!/);
    assert.strictEqual(inits.length, 2);
    for (const init of inits) {
      assert.strictEqual(init.credentials, "include");
      assert.strictEqual(init.mode, "cors");
    }
  });

  it("takes the call's fetchOptions over the processor's", async () => {
    const { inits } = await run(
      { fetchOptions: { credentials: "include" } },
      { fetchOptions: { credentials: "omit" } },
    );
    assert.deepStrictEqual(
      inits.map((init) => init.credentials),
      ["omit", "omit"],
    );
  });

  it("sends no extra options by default, and the call's signal wins", async () => {
    const { inits } = await run();
    assert.strictEqual(inits[0].credentials, undefined);
    const own = new AbortController().signal;
    const call = new AbortController().signal;
    const loader = resolveAsyncLoader(undefined, { signal: own });
    requests = [];
    await loader("https://cdn.test/data.xml", undefined, {});
    await loader("https://cdn.test/data.xml", undefined, { signal: call });
    assert.strictEqual(requests[0][1].signal, own);
    assert.strictEqual(requests[1][1].signal, call);
  });

  it("passes fetchOptions through transformAsync's stylesheet import", async () => {
    requests = [];
    const processor = new XSLTProcessor();
    await processor.transformAsync("<r/>", {
      stylesheet: MAIN,
      stylesheetUri: "https://site.test/main.xsl",
      fetchOptions: { credentials: "include" },
    });
    assert.ok(requests.every(([, init]) => init.credentials === "include"));
    assert.strictEqual(requests.length, 2);
  });

  it("does not apply to a loader of the caller's, which makes its own requests", async () => {
    const seen = [];
    const loader = async (uri, base, init) => {
      seen.push(init);
      return FILES[uri];
    };
    requests = [];
    const processor = new XSLTProcessor({
      fetchOptions: { credentials: "include" },
    });
    await processor.importStylesheetAsync(MAIN, "https://site.test/main.xsl", {
      loader,
    });
    assert.strictEqual(requests.length, 0);
    assert.ok(seen.every((init) => init.credentials === undefined));
  });
});
