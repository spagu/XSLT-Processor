/**
 * Page wiring of the playground's XSLT 1.0 mode: the stylesheet editor,
 * parameter rows, and the result panel (serialized output, output method
 * and a sandboxed preview). The transformation itself is in
 * playground-core.js.
 *
 * Needs the browser bundle (global XsltProcessorLib) loaded before it.
 *
 * @module playground-xslt
 */

import { previewDocument, transform } from "./playground-core.js";
import { presets } from "./presets.js";

/**
 * Build the XSLT 1.0 mode.
 *
 * @param {object} page - Elements and helpers shared with the page
 * @param {HTMLTextAreaElement} page.xmlInput - The XML source editor
 * @param {HTMLElement} page.statusLine - Status line (a live region)
 * @param {(messages: { level: string, text: string }[]) => void} page.showMessages
 *   - Fills the message list
 * @returns {{ presets: object[], loadPreset: (id: string) => void, run: () => void }}
 *   The mode
 */
export function createXsltMode({ xmlInput, statusLine, showMessages }) {
  const $ = (id) => document.getElementById(id);
  const xslInput = $("pg-xsl");
  const paramList = $("pg-params");
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
   * Show a transformation result in the result panel.
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
    showMessages(result.messages);
    outputCode.textContent = result.output ?? "";
    preview.srcdoc =
      result.output === null
        ? ""
        : previewDocument(result.output, result.method);
  }

  /** Transform the current input and show the result. */
  function run() {
    show(
      transform(
        { xml: xmlInput.value, xsl: xslInput.value, params: readParams() },
        {
          lib: window.XsltProcessorLib,
          DOMParser,
          now: () => performance.now(),
        },
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

  $("pg-add-param").addEventListener("click", () => {
    addParam();
    paramList.lastElementChild.querySelector("input").focus();
  });

  return { presets, loadPreset, run };
}
