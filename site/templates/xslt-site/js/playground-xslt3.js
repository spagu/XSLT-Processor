/**
 * Page wiring of the playground's XSLT 3.0 mode: runs the shared stylesheet
 * editor's input with @tradik/xslt3 and fills the result panel (the
 * serialized principal result, its preview, and one block per
 * xsl:result-document). The transformation itself is in xslt3-core.js.
 *
 * @tradik/xslt3 is loaded on the first run (playground-library.js), so the
 * XSLT 1.0 mode never downloads it.
 *
 * @module playground-xslt3
 */

import { previewDocument } from "./playground-core.js";
import { libraryRunner } from "./playground-library.js";
import { transform3 } from "./xslt3-core.js";
import { xslt3Presets } from "./xslt3-presets.js";

/**
 * "1 item" or "2 items".
 *
 * @param {number} count - How many
 * @param {string} noun - Singular noun
 * @returns {string} The phrase
 */
const plural = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * Build the XSLT 3.0 mode.
 *
 * @param {object} page - Elements and helpers shared with the page
 * @param {ReturnType<import("./playground-library.js").lazyImport>} page.library
 *   - Loads @tradik/xslt3
 * @param {ReturnType<import("./playground-stylesheet.js").createStylesheetEditor>} page.editor
 *   - The XML, stylesheet and parameter editors
 * @param {HTMLElement} page.statusLine - Status line (a live region)
 * @param {(messages: { level: string, text: string, code?: string }[]) => void} page.showMessages
 *   - Fills the message list
 * @param {() => boolean} page.isActive - Whether XSLT 3.0 is still the
 *   current mode once the library has loaded
 * @returns {{ presets: object[], loadPreset: (id: string) => void, run: () => Promise<void> }}
 *   The mode
 */
export function createXslt3Mode({
  library,
  editor,
  statusLine,
  showMessages,
  isActive,
}) {
  const $ = (id) => document.getElementById(id);
  const outputCode = $("pg-output");
  const preview = $("pg-preview");
  const secondaryList = $("pg-secondary");
  const secondaryNone = $("pg-secondary-none");
  const withLibrary = libraryRunner({
    library,
    statusLine,
    showMessages,
    isActive,
  });

  /**
   * One block per xsl:result-document: its href, method and content.
   *
   * @param {import("./xslt3-core.js").SecondaryResult[]} results - Results
   */
  function showSecondary(results) {
    secondaryNone.hidden = results.length > 0;
    secondaryList.replaceChildren(
      ...results.map(({ href, method, output }, index) => {
        const item = document.createElement("li");
        item.className = "pg-item";
        const label = document.createElement("span");
        label.className = "pg-item__type";
        label.textContent = `${href} (${method})`;
        const pre = document.createElement("pre");
        pre.className = "pg-item__value";
        pre.tabIndex = 0;
        pre.setAttribute("aria-label", `Result document ${index + 1}, ${href}`);
        const code = document.createElement("code");
        code.textContent = output;
        pre.append(code);
        item.append(label, pre);
        return item;
      }),
    );
  }

  /**
   * Show a transformation result in the result panel.
   *
   * @param {import("./xslt3-core.js").Xslt3Result} result - The result
   * @param {object} lib - @tradik/xslt3
   */
  function show(result, lib) {
    const source = result.declared ? "declared by xsl:output" : "default rule";
    const extra =
      result.secondary.length > 0
        ? ` and ${plural(result.secondary.length, "result document")}`
        : "";
    statusLine.textContent =
      result.output === null
        ? "The transformation failed. See the messages below."
        : `Output method: ${result.method} (${source}). ${plural(result.output.length, "character")}${extra} in ${result.ms.toFixed(1)} ms with @tradik/xslt3 ${lib.VERSION}.`;
    showMessages(result.messages);
    outputCode.textContent = result.output ?? "";
    preview.srcdoc =
      result.output === null
        ? ""
        : previewDocument(result.output, result.method);
    showSecondary(result.secondary);
  }

  /** Transform the current input and show the result. */
  function run() {
    return withLibrary((lib) =>
      show(
        transform3(editor.read(), {
          lib,
          DOMParser,
          now: () => performance.now(),
        }),
        lib,
      ),
    );
  }

  /**
   * Load an example into the editors and run it.
   *
   * @param {string} id - Preset id
   */
  function loadPreset(id) {
    editor.load(xslt3Presets.find((p) => p.id === id) ?? xslt3Presets[0]);
    void run(); // run() reports its own errors on the page
  }

  return { presets: xslt3Presets, loadPreset, run };
}
