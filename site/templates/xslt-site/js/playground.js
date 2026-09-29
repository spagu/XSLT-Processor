/**
 * Playground page wiring: example menu, editors, parameter rows, and the
 * result panel (serialized output, output method, messages and a sandboxed
 * preview). The transformation itself is in playground-core.js.
 *
 * Needs the browser bundle (global XsltProcessorLib) loaded before it.
 *
 * @module playground
 */

import { previewDocument, transform } from "./playground-core.js";
import { presets } from "./presets.js";

const DEBOUNCE_MS = 300;

/**
 * Find a playground element by id.
 *
 * @param {string} id - Element id
 * @returns {HTMLElement} The element
 */
const $ = (id) => document.getElementById(id);

const form = $("pg-form");
const presetSelect = $("pg-preset");
const xmlInput = $("pg-xml");
const xslInput = $("pg-xsl");
const live = $("pg-live");
const paramList = $("pg-params");
const statusLine = $("pg-status");
const messageList = $("pg-messages");
const outputCode = $("pg-output");
const preview = $("pg-preview");

/**
 * Add a parameter row with labelled name and value inputs.
 *
 * @param {{ name: string, value: string }} [param] - Initial values
 */
function addParam(param = { name: "", value: "" }) {
  const index = paramList.children.length + 1;
  const row = document.createElement("li");
  row.className = "pg-param";
  for (const [key, label] of [
    ["name", "Name"],
    ["value", "Value"],
  ]) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = param[key];
    input.dataset.key = key;
    input.spellcheck = false;
    input.setAttribute(
      "aria-label",
      `Parameter ${index} ${label.toLowerCase()}`,
    );
    input.placeholder = label;
    row.append(input);
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "button button--small";
  remove.textContent = "Remove";
  remove.setAttribute("aria-label", `Remove parameter ${index}`);
  remove.addEventListener("click", () => {
    row.remove();
    run();
  });
  row.append(remove);
  paramList.append(row);
}

/**
 * The parameters currently entered.
 *
 * @returns {{ name: string, value: string }[]} Parameters
 */
function readParams() {
  return [...paramList.querySelectorAll(".pg-param")].map((row) => ({
    name: row.querySelector('[data-key="name"]').value,
    value: row.querySelector('[data-key="value"]').value,
  }));
}

/**
 * Show a result in the result panel.
 *
 * @param {import("./playground-core.js").TransformResult} result - Result
 */
function show(result) {
  const lib = window.XsltProcessorLib;
  const source = result.declared ? "declared by xsl:output" : "default rule";
  statusLine.textContent =
    result.output === null
      ? "The transformation failed. See the messages below."
      : `Output method: ${result.method} (${source}). ${result.output.length} characters in ${Math.round(result.ms)} ms with @tradik/xslt-processor ${lib.VERSION}.`;
  messageList.replaceChildren(
    ...result.messages.map(({ level, text }) => {
      const item = document.createElement("li");
      item.className = `pg-message pg-message--${level}`;
      const label = document.createElement("strong");
      label.textContent = `${level[0].toUpperCase()}${level.slice(1)}: `;
      item.append(label, text);
      return item;
    }),
  );
  outputCode.textContent = result.output ?? "";
  preview.srcdoc =
    result.output === null ? "" : previewDocument(result.output, result.method);
}

/** Transform the current input and show the result. */
function run() {
  show(
    transform(
      { xml: xmlInput.value, xsl: xslInput.value, params: readParams() },
      { lib: window.XsltProcessorLib, DOMParser, now: () => performance.now() },
    ),
  );
}

/**
 * Load an example into the editors and run it.
 *
 * @param {string} id - Preset id
 */
function loadPreset(id) {
  const preset = presets.find((p) => p.id === id) ?? presets[0];
  xmlInput.value = preset.xml;
  xslInput.value = preset.xsl;
  paramList.replaceChildren();
  preset.params.forEach((param) => addParam(param));
  run();
}

let timer = 0;
/** Run after typing pauses, when live mode is on. */
function scheduleRun() {
  if (!live.checked) return;
  clearTimeout(timer);
  timer = setTimeout(run, DEBOUNCE_MS);
}

presetSelect.replaceChildren(
  ...presets.map(({ id, label }) => new Option(label, id)),
);
presetSelect.addEventListener("change", () => loadPreset(presetSelect.value));
form.addEventListener("submit", (event) => {
  event.preventDefault();
  run();
});
form.addEventListener("input", (event) => {
  if (event.target !== presetSelect && event.target !== live) scheduleRun();
});
$("pg-add-param").addEventListener("click", () => {
  addParam();
  paramList.lastElementChild.querySelector("input").focus();
});
$("pg-app").hidden = false;
loadPreset(presets[0].id);
