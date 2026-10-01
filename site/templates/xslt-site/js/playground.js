/**
 * Playground page wiring: the mode switch, the example menu, the shared XML
 * editor, the Run button, live runs while typing and the message list. Each
 * mode brings its own editors and result panel: playground-xslt.js (XSLT
 * 1.0) and playground-xpath.js (XPath 3.1).
 *
 * Needs the browser bundle (global XsltProcessorLib) loaded before it.
 *
 * @module playground
 */

import {
  loadMode,
  MODES,
  modeUrl,
  resolveMode,
  saveMode,
} from "./playground-modes.js";
import { createXPathMode } from "./playground-xpath.js";
import { createXsltMode } from "./playground-xslt.js";

const DEBOUNCE_MS = 300;

/**
 * Find a playground element by id.
 *
 * @param {string} id - Element id
 * @returns {HTMLElement} The element
 */
const $ = (id) => document.getElementById(id);

const app = $("pg-app");
const form = $("pg-form");
const presetSelect = $("pg-preset");
const runButton = $("pg-run");
const xmlInput = $("pg-xml");
const live = $("pg-live");
const statusLine = $("pg-status");
const messageList = $("pg-messages");
const storage = () => window.localStorage;

/**
 * Fill the message list. A message with a code (an XPath error) shows the
 * code in place of the level.
 *
 * @param {{ level: string, text: string, code?: string }[]} messages - Messages
 */
function showMessages(messages) {
  messageList.replaceChildren(
    ...messages.map(({ level, text, code }) => {
      const item = document.createElement("li");
      item.className = `pg-message pg-message--${level}`;
      const label = document.createElement("strong");
      label.textContent = `${code ?? `${level[0].toUpperCase()}${level.slice(1)}`}: `;
      item.append(label, text);
      return item;
    }),
  );
}

const shared = { xmlInput, statusLine, showMessages };
const modes = {
  [MODES.xslt]: { ...createXsltMode(shared), runLabel: "Transform" },
  [MODES.xpath]: {
    ...createXPathMode({
      ...shared,
      libraryUrl: app.dataset.xslt3,
      isActive: () => mode === MODES.xpath,
    }),
    runLabel: "Evaluate",
  },
};
/** The XML each mode had when the visitor left it, and its example. */
const saved = {};
let mode = MODES.xslt;

/** Run the current mode. */
function run() {
  modes[mode].run();
}

/**
 * Switch to a mode: show its editors and result panel, restore its XML or
 * load its first example, and remember the choice in the URL and storage.
 *
 * @param {string} next - Mode id
 */
function setMode(next) {
  if (presetSelect.options.length > 0) {
    saved[mode] = { xml: xmlInput.value, preset: presetSelect.value };
  }
  mode = next;
  $(`pg-mode-${next}`).checked = true;
  for (const el of app.querySelectorAll("[data-mode]")) {
    el.hidden = el.dataset.mode !== next;
  }
  runButton.textContent = modes[next].runLabel;
  presetSelect.replaceChildren(
    ...modes[next].presets.map(({ id, label }) => new Option(label, id)),
  );
  showMessages([]);
  history.replaceState(null, "", modeUrl(location.href, next));
  saveMode(storage, next);
  if (saved[next]) {
    presetSelect.value = saved[next].preset;
    xmlInput.value = saved[next].xml;
    run();
  } else {
    modes[next].loadPreset(modes[next].presets[0].id);
  }
}

let timer = 0;
/** Run after typing pauses, when live mode is on. */
function scheduleRun() {
  if (!live.checked) return;
  clearTimeout(timer);
  timer = setTimeout(run, DEBOUNCE_MS);
}

for (const radio of document.querySelectorAll('input[name="pg-mode"]')) {
  radio.addEventListener("change", () => setMode(radio.value));
}
presetSelect.addEventListener("change", () =>
  modes[mode].loadPreset(presetSelect.value),
);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  run();
});
form.addEventListener("input", (event) => {
  if (event.target !== presetSelect && event.target !== live) scheduleRun();
});
app.hidden = false;
setMode(resolveMode(location.search, loadMode(storage)));
