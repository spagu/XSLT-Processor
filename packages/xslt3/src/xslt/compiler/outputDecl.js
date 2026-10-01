/**
 * Declarations collected for serialization:
 * xsl:output (XSLT 3.0 section 26) and xsl:character-map (26.1).
 *
 * @module @tradik/xslt3/xslt/compiler/outputDecl
 */

import { clarkOf, isXsl, tokens, xsltError } from "../names.js";
import { required } from "./attributes.js";

/** xsl:output attributes whose value is a list of QNames. */
const QNAME_LISTS = new Set(["cdata-section-elements", "suppress-indentation"]);

/** The serialization methods of Serialization 3.1. */
const METHODS = new Set(["xml", "html", "xhtml", "text", "json", "adaptive"]);

/**
 * The method parameter: a standard method, or a QName in Clark notation.
 * @param {string} value
 * @param {Element} element
 * @param {object} cx
 * @returns {string}
 * @throws {import("../../errors.js").XPathError} XTSE1570 for an unknown
 *   unprefixed method
 */
function outputMethod(value, element, cx) {
  const method = value.trim();
  if (METHODS.has(method)) return method;
  if (!method.includes(":")) {
    throw xsltError("XTSE1570", `Unknown output method ${method}`);
  }
  return clarkOf(cx.exprs.qname(method, element));
}

/**
 * Collects the xsl:output declarations by name: the parameters of each
 * name merged, higher precedence winning (XTSE1560 for a conflict at the
 * same precedence).
 * @param {object[]} declarations
 * @param {object} cx
 * @returns {Map<string, object>} parameters (spec names) by Clark name,
 *   "" for the unnamed output definition
 */
export function collectOutputs(declarations, cx) {
  const outputs = new Map();
  const sources = new Map();
  for (const { element, precedence } of declarations) {
    const nameText = element.getAttribute("name");
    const name = nameText ? clarkOf(cx.exprs.qname(nameText, element)) : "";
    const params = outputs.get(name) ?? {};
    const from = sources.get(name) ?? {};
    for (const attribute of element.attributes) {
      const key = attribute.name;
      if (key === "name" || attribute.namespaceURI || key.startsWith("xmlns")) {
        continue;
      }
      let value = attribute.value;
      if (QNAME_LISTS.has(key)) {
        const previous = params[key] ?? [];
        const names = tokens(value).map((token) =>
          clarkOf(cx.exprs.qname(token, element, { useDefault: true })),
        );
        params[key] = [...previous, ...names];
        continue;
      }
      if (key === "use-character-maps") {
        value = tokens(value).map((token) =>
          clarkOf(cx.exprs.qname(token, element)),
        );
        params[key] = [...(params[key] ?? []), ...value];
        continue;
      }
      if (key === "method") value = outputMethod(value, element, cx);
      if (from[key] === precedence && params[key] !== value) {
        throw xsltError(
          "XTSE1560",
          `Conflicting values of ${key} in xsl:output`,
        );
      }
      if (from[key] === undefined || from[key] <= precedence) {
        params[key] = value;
        from[key] = precedence;
      }
    }
    outputs.set(name, params);
    sources.set(name, from);
  }
  return outputs;
}

/**
 * Collects the character maps.
 * @param {object[]} declarations
 * @param {object} cx
 * @returns {Map<string, {uses: string[], map: Map<string, string>}>}
 */
export function collectCharacterMaps(declarations, cx) {
  const maps = new Map();
  for (const { element, precedence } of declarations) {
    const name = clarkOf(cx.exprs.qname(required(element, "name"), element));
    const current = maps.get(name);
    if (current?.precedence === precedence) {
      throw xsltError("XTSE1580", `Two character maps are named ${name}`);
    }
    const map = new Map();
    for (const child of cx.children(element)) {
      if (child.nodeType !== 1 || !isXsl(child, "output-character")) {
        throw xsltError(
          "XTSE0010",
          "xsl:character-map contains xsl:output-character",
        );
      }
      const character = child.getAttribute("character");
      if ([...character].length !== 1) {
        throw xsltError("XTSE0020", "character must be a single character");
      }
      map.set(character, child.getAttribute("string"));
    }
    const uses = tokens(element.getAttribute("use-character-maps") || "").map(
      (token) => clarkOf(cx.exprs.qname(token, element)),
    );
    // declarations come lowest precedence first: a later one wins
    maps.set(name, { uses, map, precedence });
  }
  return maps;
}

/**
 * Checks the character maps that maps and output definitions use: they
 * exist (XTSE1590) and do not use themselves (XTSE1600).
 * @param {Map<string, object>} outputs
 * @param {Map<string, object>} maps
 */
export function checkCharacterMaps(outputs, maps) {
  for (const name of maps.keys()) expandCharacterMaps([name], maps);
  for (const output of outputs.values()) {
    expandCharacterMaps(output["use-character-maps"] ?? [], maps);
  }
}

/**
 * Expands a list of character maps (with the maps they use) into one map.
 * @param {string[]} names
 * @param {Map<string, object>} maps
 * @param {Set<string>} [active]
 * @returns {Map<string, string>}
 */
export function expandCharacterMaps(names, maps, active = new Set()) {
  const result = new Map();
  for (const name of names) {
    const entry = maps.get(name);
    if (!entry) throw xsltError("XTSE1590", `No character map ${name}`);
    if (active.has(name)) {
      throw xsltError("XTSE1600", `The character map ${name} uses itself`);
    }
    active.add(name);
    for (const [c, s] of expandCharacterMaps(entry.uses, maps, active)) {
      result.set(c, s);
    }
    active.delete(name);
    for (const [c, s] of entry.map) result.set(c, s);
  }
  return result;
}
