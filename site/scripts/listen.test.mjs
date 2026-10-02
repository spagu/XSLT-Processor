/**
 * The "Listen" player of blog posts: the blocks read aloud, the sentence
 * chunks, and the controller against a fake speech engine.
 *
 * Run: node --test site/scripts/listen.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  MAX_CHUNK,
  chunks,
  listenBlocks,
} from "../templates/xslt-site/js/listen-blocks.js";
import { createListenPlayer } from "../templates/xslt-site/js/listen.js";

const ARTICLE = `<article class="prose">
  <p class="post-meta" data-listen-skip>Blog · 2 October 2026</p>
  <h1>Title</h1>
  <div data-listen data-listen-skip hidden>
    <button data-listen-toggle>Listen</button><button data-listen-stop>Stop</button>
    <select data-listen-rate><option value="1" selected>1</option><option value="1.5">1.5</option></select>
    <output data-listen-status></output>
  </div>
  <p>First   paragraph.</p>
  <ul><li>One</li><li>Two <ul><li>Nested</li></ul></li></ul>
  <pre><code>const x = 1;</code></pre>
  <p><img src="a.svg" alt="A chart"></p>
  <img src="b.svg" alt="">
  <img src="c.svg" alt="Bare image">
  <table><caption>Results</caption></table>
  <table></table>
  <blockquote><p>Quoted.</p></blockquote>
  <hr>
  <p>  </p>
</article>`;

/**
 * Parse the sample article.
 *
 * @param {string} [html] - Article markup
 * @returns {Element} The article
 */
function article(html = ARTICLE) {
  const { document } = new JSDOM(
    `<!DOCTYPE html><html lang="en-GB"><body>${html}</body></html>`,
  ).window;
  return document.querySelector("article");
}

/** A speech engine that records utterances and ends them on demand. */
class FakeSynth {
  constructor() {
    this.spoken = [];
    this.calls = [];
  }
  speak(utterance) {
    this.spoken.push(utterance);
  }
  cancel() {
    this.calls.push("cancel");
    this.spoken = [];
  }
  pause() {
    this.calls.push("pause");
  }
  resume() {
    this.calls.push("resume");
  }
  /** End every queued utterance, in order. */
  endAll() {
    const queued = this.spoken;
    this.spoken = [];
    for (const utterance of queued) utterance.onend?.();
  }
}

/** Stand-in for SpeechSynthesisUtterance. */
class Utterance {
  constructor(text) {
    this.text = text;
  }
}

describe("listenBlocks", () => {
  it("reads headings, paragraphs and list items, and describes the rest", () => {
    const texts = listenBlocks(article()).map((block) => block.text);
    assert.deepEqual(texts, [
      "Title",
      "First paragraph.",
      "One",
      "Two",
      "Nested",
      "Code sample.",
      "Image: A chart",
      "Image: Bare image",
      "Table: Results",
      "Table.",
      "Quoted.",
    ]);
  });
});

describe("chunks", () => {
  it("keeps short text whole and joins sentences up to the limit", () => {
    assert.deepEqual(chunks("One. Two!"), ["One. Two!"]);
  });

  it("splits at sentences, then at spaces for a sentence that is too long", () => {
    const long = `${"word ".repeat(60).trim()}.`;
    const pieces = chunks(`Short one. ${long} End`);
    assert.equal(pieces[0], "Short one.");
    assert.ok(pieces.every((piece) => piece.length <= MAX_CHUNK));
    assert.equal(
      pieces.join(" ").replaceAll(/\s+/g, " "),
      `Short one. ${long} End`,
    );
    assert.deepEqual(chunks("x".repeat(MAX_CHUNK + 5)), [
      "x".repeat(MAX_CHUNK),
      "xxxxx",
    ]);
  });
});

describe("createListenPlayer", () => {
  /**
   * A player on the sample article.
   *
   * @returns {object} The parts
   */
  function setup() {
    const node = article();
    const root = node.querySelector("[data-listen]");
    const synth = new FakeSynth();
    const player = createListenPlayer({
      root,
      article: node,
      synth,
      Utterance,
    });
    const toggle = root.querySelector("[data-listen-toggle]");
    const status = root.querySelector("[data-listen-status]");
    return { node, root, synth, player, toggle, status };
  }

  it("shows the player and reads every block in order, highlighting it", () => {
    const { node, root, synth, toggle, status } = setup();
    assert.equal(root.hidden, false);
    toggle.click();
    assert.equal(toggle.textContent, "Pause");
    assert.equal(toggle.getAttribute("aria-pressed"), "true");
    assert.equal(status.textContent, "Reading part 1 of 11");
    assert.equal(synth.spoken[0].lang, "en-GB");
    assert.equal(synth.spoken[0].rate, 1);
    assert.ok(node.querySelector("h1").classList.contains("listen-current"));
    const read = [];
    while (synth.spoken.length) {
      read.push(...synth.spoken.map((utterance) => utterance.text));
      synth.endAll();
    }
    assert.equal(read.at(-1), "Quoted.");
    assert.equal(toggle.textContent, "Listen");
    assert.equal(node.querySelectorAll(".listen-current").length, 0);
  });

  it("pauses, resumes, applies the rate and stops", () => {
    const { root, synth, toggle, status } = setup();
    root.querySelector("[data-listen-rate]").value = "1.5";
    toggle.click();
    assert.equal(synth.spoken[0].rate, 1.5);
    toggle.click();
    assert.equal(toggle.textContent, "Resume");
    toggle.click();
    assert.equal(toggle.textContent, "Pause");
    assert.deepEqual(synth.calls, ["cancel", "pause", "resume"]);
    const pending = synth.spoken[0];
    root.querySelector("[data-listen-stop]").click();
    assert.equal(toggle.textContent, "Listen");
    assert.equal(status.textContent, "");
    pending.onend?.();
    assert.equal(synth.spoken.length, 0);
  });

  it("stays hidden for an article with nothing to read", () => {
    const node = article(`<article><div data-listen data-listen-skip>
      <button data-listen-toggle></button><button data-listen-stop></button>
      <select data-listen-rate><option value="1" selected>1</option></select><output data-listen-status></output></div></article>`);
    const root = node.querySelector("[data-listen]");
    createListenPlayer({
      root,
      article: node,
      synth: new FakeSynth(),
      Utterance,
    });
    assert.equal(root.hidden, true);
  });
});

describe("listen.js on a page", () => {
  it("starts the player where speech synthesis exists and stops it on pagehide", async () => {
    const node = article();
    const synth = new FakeSynth();
    const listeners = {};
    globalThis.document = node.ownerDocument;
    globalThis.window = {
      speechSynthesis: synth,
      SpeechSynthesisUtterance: Utterance,
      addEventListener: (type, listener) => {
        listeners[type] = listener;
      },
    };
    try {
      await import(`../templates/xslt-site/js/listen.js?page=${Date.now()}`);
      const root = node.querySelector("[data-listen]");
      assert.equal(root.hidden, false);
      const toggle = root.querySelector("[data-listen-toggle]");
      toggle.click();
      assert.ok(synth.spoken.length > 0);
      toggle.click();
      toggle.click();
      assert.deepEqual(synth.calls.slice(-2), ["pause", "resume"]);
      synth.endAll();
      assert.equal(toggle.textContent, "Pause");
      const pending = synth.spoken[0];
      listeners.pagehide();
      assert.equal(synth.spoken.length, 0);
      pending.onend();
      assert.equal(toggle.textContent, "Listen");
    } finally {
      delete globalThis.document;
      delete globalThis.window;
    }
  });
});
