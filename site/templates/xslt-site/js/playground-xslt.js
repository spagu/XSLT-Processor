/**
 * Page wiring of the playground's XSLT 1.0 mode: runs the shared stylesheet
 * editor's input with @tradik/xslt-processor and fills the result panel
 * (serialized output, output method and a sandboxed preview). The
 * transformation itself is in playground-core.js.
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
 * @param {ReturnType<import("./playground-stylesheet.js").createStylesheetEditor>} page.editor
 *   - The XML, stylesheet and parameter editors
 * @param {HTMLElement} page.statusLine - Status line (a live region)
 * @param {(messages: { level: string, text: string }[]) => void} page.showMessages
 *   - Fills the message list
 * @returns {{ presets: object[], loadPreset: (id: string) => void, run: () => void }}
 *   The mode
 */
export function createXsltMode({ editor, statusLine, showMessages }) {
  const outputCode = document.getElementById("pg-output");
  const preview = document.getElementById("pg-preview");

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
      transform(editor.read(), {
        lib: window.XsltProcessorLib,
        DOMParser,
        now: () => performance.now(),
      }),
    );
  }

  /**
   * Load an example into the editors and run it.
   *
   * @param {string} id - Preset id
   */
  function loadPreset(id) {
    editor.load(presets.find((p) => p.id === id) ?? presets[0]);
    run();
  }

  return { presets, loadPreset, run };
}
