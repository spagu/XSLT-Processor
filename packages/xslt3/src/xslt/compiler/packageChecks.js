/**
 * Checks on a whole package: modes declared when declared-modes="yes"
 * (XSLT 3.0 section 3.5.4.1, XTSE3085), no abstract component left in the
 * top-level package (XTSE3080), and which components can start a
 * transformation (sections 2.3.3 to 2.3.5).
 *
 * @module @tradik/xslt3/xslt/compiler/packageChecks
 */

import { standardAttr, xsltError } from "../names.js";
import { matchesOf } from "./visibility.js";

const ENTRY_VISIBILITIES = new Set(["public", "final"]);

/**
 * XTSE3085: with declared-modes="yes", every mode a package uses must be
 * declared by xsl:mode or accepted from a used package.
 * @param {object} cx - Package compiler, its templates compiled
 */
export function checkDeclaredModes(cx) {
  if (!cx.header.declaredModes) return;
  const declared = new Set(
    cx.all("mode").map(({ element }) => cx.declaredModeName(element)),
  );
  for (const [key, entry] of cx.table) {
    if (key.startsWith("mode ")) {
      declared.add(entry.key);
    }
  }
  const used = new Set([...cx.modes.keys(), ...cx.modeRefs]);
  if (standardAttr(cx.tree.root, "default-mode") !== undefined) {
    used.add(cx.defaultModeOf(cx.tree.root));
  }
  for (const name of used) {
    if (!declared.has(name)) {
      throw xsltError(
        "XTSE3085",
        `The mode ${name || "#unnamed"} is not declared`,
      );
    }
  }
}

/**
 * XTSE3080: the top-level package has no abstract component.
 * @param {object} cx - Its compiler, prepared
 */
export function checkExecutable(cx) {
  for (const entry of cx.table.values()) {
    if (entry.visibility === "abstract") {
      throw xsltError("XTSE3080", `The component ${entry.local} is abstract`);
    }
  }
}

/**
 * Whether a component of the top-level package can be the initial named
 * template or function (public or final).
 * @param {object} cx
 * @param {string} kind - "template" or "function"
 * @param {string} key - Clark name (with `#arity` for a function)
 * @returns {boolean}
 */
export function isEntryPoint(cx, kind, key) {
  return ENTRY_VISIBILITIES.has(cx.table.get(`${kind} ${key}`)?.visibility);
}

/**
 * Whether a mode can be the initial mode (section 2.3.3).
 * @param {object} cx - The top-level package's compiler
 * @param {string} name - Clark name, "" for the unnamed mode
 * @returns {boolean}
 */
export function isEligibleMode(cx, name) {
  if (name === "" || name === cx.defaultModeName) return true;
  if (isEntryPoint(cx, "mode", name)) return true;
  if (cx.header.declaredModes || !cx.modes.has(name)) return false;
  if (cx.table.has(`mode ${name}`)) return false;
  // a mode used without declaration is eligible, unless xsl:expose makes
  // it private (XSLT 3.0 section 3.5.3.1)
  const [uri, local] = name.slice(1).split("}");
  const [best] = matchesOf(cx.exposeRules ?? [], { kind: "mode", uri, local });
  return !best || ENTRY_VISIBILITIES.has(best.rule.visibility);
}
