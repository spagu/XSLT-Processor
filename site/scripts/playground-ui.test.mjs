// Page helpers of the playground that need no engine: loading @tradik/xslt3
// once for two modes, and the stylesheet editor shared by XSLT 1.0 and 3.0
// (under jsdom).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  lazyImport,
  libraryRunner,
} from "../templates/xslt-site/js/playground-library.js";
import { createStylesheetEditor } from "../templates/xslt-site/js/playground-stylesheet.js";

describe("library loading", () => {
  it("imports once and shares the promise", async () => {
    let calls = 0;
    const library = lazyImport(async () => ({ n: ++calls }));
    assert.equal(library.started(), false);
    const [a, b] = await Promise.all([library(), library()]);
    assert.equal(a, b);
    assert.equal(calls, 1);
    assert.equal(library.started(), true);
  });

  it("tries again after a failed import", async () => {
    let fail = true;
    const library = lazyImport(async () => {
      if (fail) throw new Error("offline");
      return { ok: true };
    });
    await assert.rejects(library(), /offline/);
    assert.equal(library.started(), false);
    fail = false;
    assert.deepEqual(await library(), { ok: true });
  });

  /** A runner with a fake status line and message list. */
  const runner = (load, isActive = () => true) => {
    const page = { statusLine: { textContent: "" }, messages: null };
    const withLibrary = libraryRunner({
      library: lazyImport(load),
      statusLine: page.statusLine,
      showMessages: (messages) => (page.messages = messages),
      isActive,
    });
    return { page, withLibrary };
  };

  it("says it is loading, then runs the work with the library", async () => {
    const { page, withLibrary } = runner(async () => ({ v: 1 }));
    let seen = null;
    const done = withLibrary((lib) => (seen = lib));
    assert.equal(page.statusLine.textContent, "Loading @tradik/xslt3…");
    await done;
    assert.deepEqual(seen, { v: 1 });
  });

  it("reports a failed load", async () => {
    const { page, withLibrary } = runner(async () => {
      throw new Error("404");
    });
    await withLibrary(() => assert.fail("must not run"));
    assert.equal(
      page.statusLine.textContent,
      "@tradik/xslt3 could not be loaded.",
    );
    assert.deepEqual(page.messages, [{ level: "error", text: "404" }]);
  });

  it("drops runs overtaken by a newer run or a mode switch", async () => {
    const ran = [];
    const { withLibrary } = runner(async () => ({}));
    await Promise.all([
      withLibrary(() => ran.push(1)),
      withLibrary(() => ran.push(2)),
    ]);
    assert.deepEqual(ran, [2]);
    const inactive = runner(
      async () => ({}),
      () => false,
    );
    await inactive.withLibrary(() => ran.push(3));
    assert.deepEqual(ran, [2]);
  });
});

describe("stylesheet editor", () => {
  let dom;
  before(() => {
    dom = new JSDOM(
      '<textarea id="xml"></textarea><textarea id="xsl"></textarea><ul id="params"></ul><button id="add"></button>',
    );
    globalThis.document = dom.window.document;
  });
  after(() => {
    delete globalThis.document;
  });

  it("loads and reads the XML, the stylesheet and the parameters", () => {
    const $ = (id) => dom.window.document.getElementById(id);
    let changes = 0;
    const editor = createStylesheetEditor({
      xmlInput: $("xml"),
      xslInput: $("xsl"),
      paramList: $("params"),
      addButton: $("add"),
      onChange: () => changes++,
    });
    const input = {
      xml: "<a/>",
      xsl: "<xsl:stylesheet/>",
      params: [{ name: "rate", value: "0.08" }],
    };
    editor.load(input);
    assert.deepEqual(editor.read(), input);
    const [name, value] = $("params").querySelectorAll("input");
    assert.equal(name.getAttribute("aria-label"), "Parameter 1 name");
    assert.equal(value.getAttribute("aria-label"), "Parameter 1 value");

    $("add").click();
    assert.equal(dom.window.document.activeElement.dataset.key, "name");
    assert.deepEqual(editor.read().params[1], { name: "", value: "" });
    const remove = $("params").querySelector(
      '[aria-label="Remove parameter 2"]',
    );
    remove.click();
    assert.equal(changes, 1);
    assert.equal(editor.read().params.length, 1);
  });
});
