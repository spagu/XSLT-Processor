/**
 * "Listen" on a blog post: reads the article aloud with the browser's own
 * speech synthesis (Web Speech API). Nothing is sent anywhere; without speech
 * synthesis the player stays hidden. The current block is highlighted, the
 * rate applies from the next sentence, and leaving the page stops it.
 */

import { chunks, listenBlocks } from "./listen-blocks.js";

/**
 * Create the player for an article.
 *
 * @param {object} options - Parts
 * @param {HTMLElement} options.root - The player (buttons, rate, status)
 * @param {Element} options.article - The article to read
 * @param {SpeechSynthesis} options.synth - window.speechSynthesis
 * @param {typeof SpeechSynthesisUtterance} options.Utterance - Its constructor
 * @returns {{play: Function, stop: Function}} Controls (for tests)
 */
export function createListenPlayer({ root, article, synth, Utterance }) {
  const toggle = root.querySelector("[data-listen-toggle]");
  const stopButton = root.querySelector("[data-listen-stop]");
  const rate = root.querySelector("[data-listen-rate]");
  const status = root.querySelector("[data-listen-status]");
  const blocks = listenBlocks(article);
  const lang = article.ownerDocument.documentElement.lang || "en";
  let index = 0;
  let state = "idle";

  const highlight = (on) => {
    blocks[index]?.element.classList.toggle("listen-current", on);
  };
  const show = (next) => {
    state = next;
    const labels = { idle: "Listen", playing: "Pause", paused: "Resume" };
    toggle.textContent = labels[state];
    toggle.setAttribute("aria-pressed", String(state === "playing"));
    stopButton.disabled = state === "idle";
    const position = `${Math.min(index + 1, blocks.length)} of ${blocks.length}`;
    status.textContent = state === "idle" ? "" : `Reading part ${position}`;
  };
  const finish = () => {
    highlight(false);
    index = 0;
    show("idle");
  };
  const speakBlock = () => {
    if (index >= blocks.length) return finish();
    highlight(true);
    show("playing");
    const pieces = chunks(blocks[index].text);
    pieces.forEach((piece, at) => {
      const utterance = new Utterance(piece);
      utterance.lang = lang;
      utterance.rate = Number(rate.value);
      if (at === pieces.length - 1) {
        utterance.onend = () => {
          if (state === "idle") return;
          highlight(false);
          index += 1;
          speakBlock();
        };
      }
      synth.speak(utterance);
    });
    return undefined;
  };
  const stop = () => {
    show("idle");
    synth.cancel();
    finish();
  };
  const play = () => {
    if (state === "playing") {
      synth.pause();
      show("paused");
    } else if (state === "paused") {
      synth.resume();
      show("playing");
    } else {
      synth.cancel();
      speakBlock();
    }
  };

  toggle.addEventListener("click", play);
  stopButton.addEventListener("click", stop);
  root.hidden = blocks.length === 0;
  show("idle");
  return { play, stop };
}

const root = globalThis.document?.querySelector("[data-listen]");
const synth = globalThis.window?.speechSynthesis;
if (root && synth && globalThis.window.SpeechSynthesisUtterance) {
  const player = createListenPlayer({
    root,
    article: root.closest("article"),
    synth,
    Utterance: globalThis.window.SpeechSynthesisUtterance,
  });
  globalThis.window.addEventListener("pagehide", () => player.stop());
}
