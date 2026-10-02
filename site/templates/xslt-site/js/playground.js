/**
 * Playground page wiring: the mode switch, the example menu, the shared XML
 * and stylesheet editors, the Run button, live runs while typing, the
 * message list and the link that runs the same stylesheet with the other
 * engine. Each mode brings its own result handling: playground-xslt.js
 * (XSLT 1.0), playground-xslt3.js (XSLT 3.0) and playground-xpath.js
 * (XPath 3.1).
 *
 * Needs the browser bundle (global XsltProcessorLib) loaded before it.
 *
 * @module playground
 */

import { lazyImport } from "./playground-library.js";
import {
  compareMode,
  loadMode,
  MODES,
  modeUrl,
  resolveMode,
  saveMode,
} from "./playground-modes.js";
import { createStylesheetEditor } from "./playground-stylesheet.js";
import { createXPathMode } from "./playground-xpath.js";
import { createXsltMode } from "./playground-xslt.js";
import { createXslt3Mode } from "./playground-xslt3.js";

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
const compareLink = $("pg-compare");
const storage = () => window.localStorage;

/**
 * Fill the message list. A message with a code (an XPath or XSLT error)
 * shows the code in place of the level.
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

let mode = MODES.xslt;
const editor = createStylesheetEditor({
  xmlInput,
  xslInput: $("pg-xsl"),
  paramList: $("pg-params"),
  addButton: $("pg-add-param"),
  onChange: () => run(),
});
const library = lazyImport(() => import(app.dataset.xslt3));
const shared = { xmlInput, editor, statusLine, showMessages };
/** Each mode with the texts the page shows for it. */
const modes = {
  [MODES.xslt]: {
    ...createXsltMode(shared),
    name: "XSLT 1.0",
    runLabel: "Transform",
    outputTitle: "transformToString() output",
  },
  [MODES.xslt3]: {
    ...createXslt3Mode({
      ...shared,
      library,
      isActive: () => mode === MODES.xslt3,
    }),
    name: "XSLT 2.0 / 3.0",
    runLabel: "Transform",
    outputTitle: "serialize() output",
  },
  [MODES.xpath]: {
    ...createXPathMode({
      ...shared,
      library,
      isActive: () => mode === MODES.xpath,
    }),
    name: "XPath 3.1",
    runLabel: "Evaluate",
  },
};
/** The editors of each mode when the visitor left it, and its example. */
const saved = {};

/** Run the current mode. */
function run() {
  modes[mode].run();
}

/**
 * Switch to a mode: show its editors and result panel, restore what it had
 * or load its first example, and remember the choice in the URL and storage.
 * With `carry`, the XML, stylesheet and parameters stay as they are, so the
 * same stylesheet runs with the other engine.
 *
 * @param {string} next - Mode id
 * @param {{ carry?: boolean }} [options] - Keep the current input
 */
function setMode(next, { carry = false } = {}) {
  const from = mode;
  if (presetSelect.options.length > 0) {
    saved[from] = { ...editor.read(), preset: presetSelect.value };
  }
  mode = next;
  $(`pg-mode-${next}`).checked = true;
  for (const el of app.querySelectorAll("[data-mode]")) {
    el.hidden = !el.dataset.mode.split(" ").includes(next);
  }
  runButton.textContent = modes[next].runLabel;
  $("pg-xsl-label").textContent = `${modes[next].name} stylesheet`;
  $("pg-output-title").textContent = modes[next].outputTitle ?? "";
  const other = compareMode(next);
  if (other) {
    compareLink.href = modeUrl(location.href, other);
    compareLink.textContent = `Run this stylesheet with ${modes[other].name}`;
  }
  presetSelect.replaceChildren(
    ...modes[next].presets.map(({ id, label }) => new Option(label, id)),
  );
  showMessages([]);
  history.replaceState(null, "", modeUrl(location.href, next));
  saveMode(storage, next);
  if (carry) {
    presetSelect.prepend(new Option(`Your ${modes[from].name} input`, ""));
    presetSelect.value = "";
    run();
  } else if (saved[next]) {
    presetSelect.value = saved[next].preset;
    if (presetSelect.value !== saved[next].preset) {
      presetSelect.prepend(new Option("Your earlier input", ""));
      presetSelect.value = "";
    }
    if (other) editor.load(saved[next]);
    else xmlInput.value = saved[next].xml;
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
compareLink.addEventListener("click", (event) => {
  event.preventDefault();
  setMode(compareMode(mode), { carry: true });
});
presetSelect.addEventListener("change", () => {
  if (presetSelect.value) modes[mode].loadPreset(presetSelect.value);
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  run();
});
form.addEventListener("input", (event) => {
  if (event.target !== presetSelect && event.target !== live) scheduleRun();
});
app.hidden = false;
setMode(resolveMode(location.search, loadMode(storage)));
