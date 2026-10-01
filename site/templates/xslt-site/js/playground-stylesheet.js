/**
 * The stylesheet editor and the parameter rows, shared by the playground's
 * XSLT 1.0 and XSLT 3.0 modes: both run the same XML, stylesheet and
 * parameters, so a stylesheet can be compared between the two engines.
 *
 * @module playground-stylesheet
 */

/**
 * @typedef {object} StylesheetInput
 * @property {string} xml - XML source document
 * @property {string} xsl - Stylesheet
 * @property {{ name: string, value: string }[]} params - Parameter rows
 */

/**
 * Build the editor.
 *
 * @param {object} page - Elements of the page
 * @param {HTMLTextAreaElement} page.xmlInput - The XML source editor
 * @param {HTMLTextAreaElement} page.xslInput - The stylesheet editor
 * @param {HTMLUListElement} page.paramList - The parameter rows
 * @param {HTMLButtonElement} page.addButton - "Add parameter"
 * @param {() => void} page.onChange - Called when a row is removed
 * @returns {{ read: () => StylesheetInput, load: (input: StylesheetInput) => void }}
 *   Reads and replaces the XML, the stylesheet and the parameters
 */
export function createStylesheetEditor({
  xmlInput,
  xslInput,
  paramList,
  addButton,
  onChange,
}) {
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
      onChange();
    });
    row.append(remove);
    paramList.append(row);
  }

  addButton.addEventListener("click", () => {
    addParam();
    paramList.lastElementChild.querySelector("input").focus();
  });

  return {
    read: () => ({
      xml: xmlInput.value,
      xsl: xslInput.value,
      params: [...paramList.querySelectorAll(".pg-param")].map((row) => ({
        name: row.querySelector('[data-key="name"]').value,
        value: row.querySelector('[data-key="value"]').value,
      })),
    }),
    load({ xml, xsl, params }) {
      xmlInput.value = xml;
      xslInput.value = xsl;
      paramList.replaceChildren();
      params.forEach((param) => addParam(param));
    },
  };
}
