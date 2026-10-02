/**
 * xsl:global-context-item (XSLT 3.0 section 3.5.6): whether the global
 * context item is required, optional or absent, and its type, checked
 * when a transformation starts.
 *
 * @module @tradik/xslt3/xslt/compiler/globalContextItem
 */

import { coerce } from "../../xpath/eval/coercion.js";
import { attr, xsltError } from "../names.js";

/** Values of the use attribute. */
const USES = new Set(["required", "optional", "absent"]);

/**
 * Compiles the xsl:global-context-item declarations into
 * `cx.globalContextItem`: `{use, type}`.
 * @param {object[]} declarations
 * @param {object} cx
 * @throws {import("../../errors.js").XPathError} XTSE3087 for two
 *   different declarations, XTSE0020 for an invalid use, XTSE3089 for a
 *   type with use="absent"
 */
export function declareGlobalContextItem(declarations, cx) {
  cx.globalContextItem = { use: "optional", type: null };
  const seen = new Set();
  const modules = new Set();
  for (const { element } of declarations) {
    if (modules.has(element.parentNode)) {
      throw xsltError("XTSE3087", "Two xsl:global-context-item in a module");
    }
    modules.add(element.parentNode);
    const use = (attr(element, "use") ?? "optional").trim();
    if (!USES.has(use)) throw xsltError("XTSE0020", `Invalid use "${use}"`);
    const asText = attr(element, "as");
    if (use === "absent" && asText !== undefined) {
      throw xsltError("XTSE3089", 'use="absent" cannot have a type');
    }
    // the types compared without whitespace, which is not significant
    seen.add(`${use}|${asText?.replace(/\s+/g, "")}`);
    if (seen.size > 1) {
      throw xsltError("XTSE3087", "Conflicting xsl:global-context-item");
    }
    const type =
      asText === undefined ? null : cx.exprs.sequenceType(asText, element);
    cx.globalContextItem = { use, type };
  }
}

/**
 * Checks the used packages: their global context item is absent, so one
 * that declares it required cannot run (XSLT 3.0 xsl:global-context-item:
 * XTTE0590).
 * @param {object} cx - The top-level package's compiler
 * @throws {import("../../errors.js").XPathError} XTTE0590
 */
export function checkLibraryContextItems(cx) {
  for (const { child } of cx.uses) {
    if (child.globalContextItem.use === "required") {
      throw xsltError(
        "XTTE0590",
        `The used package ${child.packageName} requires a global context item`,
      );
    }
    checkLibraryContextItems(child);
  }
}

/**
 * The global context item of a transformation, checked against the
 * declaration.
 * @param {object} declared - `{use, type}`
 * @param {*} item - The item supplied, undefined for none
 * @returns {*} the item, undefined when absent
 * @throws {import("../../errors.js").XPathError} XTDE3086 when a
 *   required item is missing, XTTE0590 when it has the wrong type
 */
export function globalContextItem(declared, item) {
  if (declared.use === "absent") return undefined;
  if (item === undefined) {
    if (declared.use === "required") {
      throw xsltError("XTDE3086", "A global context item is required");
    }
    return undefined;
  }
  if (!declared.type) return item;
  try {
    return coerce([item], declared.type, { what: "global context item" })[0];
  } catch (error) {
    throw xsltError("XTTE0590", error.message.replace(/^[A-Z]+\d+: /, ""));
  }
}
