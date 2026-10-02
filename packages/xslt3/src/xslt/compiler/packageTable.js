/**
 * The components of a package (XSLT 3.0 section 3.5.3): its own
 * declarations, the components accepted from used packages and the
 * overriding declarations, checked for conflicts (XTSE3050, XTSE3055);
 * the non-hidden ones are what a using package sees (`exports`). Global
 * variables are slots of one environment shared by every package of the
 * stylesheet; each package names the slots it can see.
 *
 * @module @tradik/xslt3/xslt/compiler/packageTable
 */

import { attr, isXsl, xsltError } from "../names.js";
import { yesNo } from "./attributes.js";
import { declaredComponents, exposeComponents } from "./components.js";
import { parseVersion } from "./packageVersions.js";
import { modesOf } from "./templatesDecl.js";
import { parseVisibilityRules } from "./visibility.js";

/** Import precedences of the packages that use another one start here. */
export const LEVEL_PRECEDENCE = 1e6;

/**
 * The attributes of the package: name, version, declared-modes.
 * @param {Element} root - Root of the principal module
 * @returns {{name: string|undefined, version: string, declaredModes:
 *   boolean, implicit: boolean}}
 */
export function packageHeader(root) {
  if (!isXsl(root, "package")) {
    return {
      name: undefined,
      version: "1",
      declaredModes: false,
      implicit: true,
    };
  }
  const version = attr(root, "package-version")?.trim() ?? "1";
  if (parseVersion(version) === null) {
    throw xsltError("XTSE0020", `Invalid package-version ${version}`);
  }
  return {
    name: attr(root, "name")?.trim(),
    version,
    declaredModes: yesNo(root, "declared-modes", true),
    implicit: false,
  };
}

/**
 * Adds a component to the table of a package.
 * @param {Map<string, object>} table
 * @param {object} entry
 * @param {string} code - Error code of a conflict
 */
function enter(table, entry, code) {
  const id = `${entry.kind} ${entry.key}`;
  if (table.has(id)) {
    throw xsltError(code, `Two components ${entry.kind} ${entry.local}`);
  }
  table.set(id, entry);
}

/**
 * A variable slot (see the module comment).
 * @param {string} name - Clark name
 * @param {object} owner - Compiler of the declaration that gives its value
 * @param {object} declaration - `{element, key}`
 * @returns {object}
 */
const slot = (name, owner, declaration) => ({
  name,
  owner,
  declaration,
  original: null,
  abstract: false,
});

/**
 * Builds the component table, the exports and the variable slots.
 * @param {object} cx - The package's compiler after compileContext
 * @param {(kind: string) => object[]} all - Declarations by kind
 * @param {{signatures: Map, globals: Map, definitions: Map}} context
 */
export function buildTable(cx, all, context) {
  const rules = parseVisibilityRules(
    all("expose").map(({ element }) => element),
    cx,
    {
      allowed: new Set(["public", "private", "final", "abstract"]),
      anyCode: "XTSE3022",
    },
  );
  const own = declaredComponents(all, cx, context);
  exposeComponents(own, rules, cx.header.implicit);
  // kept for the modes used without declaration (see packageChecks.js)
  cx.exposeRules = rules;
  const table = new Map();
  cx.ownSlots = [];
  cx.globalNames = new Map();
  for (const component of own) {
    const entry = { ...component, owner: cx };
    if (component.kind === "function") {
      entry.definition = context.definitions.get(component.key);
      entry.cell = cx.functionBodies.get(component.key);
    } else if (component.kind === "variable") {
      const declaration = context.globals.get(component.key);
      entry.slot = slot(component.key, cx, declaration);
      entry.slot.abstract = component.visibility === "abstract";
      cx.ownSlots.push(entry.slot);
      cx.globalNames.set(component.key, entry.slot);
    }
    enter(table, entry, "XTSE3050");
  }
  const overridden = new Set();
  for (const use of cx.uses) {
    for (const { component, visibility, override } of use.accepted) {
      const entry = { ...component, visibility, override };
      if (override) {
        const id = `${component.kind} ${component.key}`;
        if (table.has(id) && !overridden.has(id)) {
          throw xsltError(
            component.kind === "function" ? "XTSE0770" : "XTSE3055",
            `${component.local} is declared and overridden`,
          );
        }
        overridden.add(id);
        if (component.kind === "variable") overrideSlot(cx, entry, override);
        entry.owner = cx;
      }
      if (component.kind === "variable") {
        cx.globalNames.set(entry.key, entry.slot);
      }
      enter(table, entry, "XTSE3050");
    }
  }
  checkRulesInAcceptedModes(cx, all, table);
  cx.table = table;
  cx.exports = [...table.values()];
}

/**
 * Gives a variable slot the value of its overriding declaration; the
 * value it had moves to a new hidden slot, its `xsl:original`.
 * @param {object} cx
 * @param {object} entry - Table entry of the accepted variable
 * @param {Element} element - The overriding xsl:variable or xsl:param
 */
function overrideSlot(cx, entry, element) {
  const target = entry.slot;
  const original = slot("", target.owner, target.declaration);
  original.original = target.original;
  original.abstract = target.abstract;
  cx.ownSlots.push(original);
  target.owner = cx;
  target.declaration = { element, key: entry.key };
  target.original = original;
  target.abstract = false;
  entry.isParam = isXsl(element, "param");
}

/**
 * XTSE3050: template rules outside xsl:override cannot be added to a mode
 * of a used package.
 * @param {object} cx
 * @param {(kind: string) => object[]} all
 * @param {Map<string, object>} table
 */
function checkRulesInAcceptedModes(cx, all, table) {
  for (const { element } of all("template")) {
    if (attr(element, "match") === undefined) continue;
    for (const mode of modesOf(element, cx)) {
      const entry = table.get(`mode ${mode}`);
      if (entry && entry.owner !== cx) {
        throw xsltError(
          "XTSE3050",
          `The mode ${mode} belongs to a used package`,
        );
      }
    }
  }
}
