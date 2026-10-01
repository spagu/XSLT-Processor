/**
 * Linking the packages of a stylesheet (XSLT 3.0 section 3.5.3.5): one
 * environment for the global variables of every package, the components
 * accepted from used packages entered in the registries of the using
 * package, and abstract components made to fail when invoked (overriding
 * declarations: see overrideLinks.js).
 *
 * @module @tradik/xslt3/xslt/compiler/linker
 */

import { xsltError } from "../names.js";
import { compileGlobal } from "./globals.js";
import { usesOriginal } from "./overrideLinks.js";

/** A body that raises XTDE3052: an abstract component was invoked. */
const ABSTRACT_BODY = [
  () => {
    throw xsltError("XTDE3052", "An abstract component was invoked");
  },
];

/**
 * Lays out the global variables of every package of the stylesheet in
 * one environment, and gives each package the names it sees.
 * @param {object} top - The top-level package's compiler
 */
export function layoutGlobals(top) {
  const slots = [];
  const packages = [];
  const visit = (cx) => {
    for (const use of cx.uses) visit(use.child);
    packages.push(cx);
    slots.push(...cx.ownSlots);
  };
  visit(top);
  for (const cx of packages) {
    cx.layout = slots;
    cx.setGlobals(
      slots.map((slot, i) =>
        cx.globalNames.get(slot.name) === slot ? slot.name : `\u0000${i}`,
      ),
    );
  }
}

/**
 * Evaluates a global variable of a library package with an absent focus.
 * @param {object} compiled - Compiled global
 */
function withoutFocus(compiled) {
  const { value } = compiled;
  compiled.value = (xc, machine) =>
    value({ ...xc, item: undefined, position: 0, size: 0 }, machine);
}

/**
 * Compiles the global variables whose value this package gives.
 * @param {object} cx
 * @returns {object[]} compiled globals of the whole layout (meaningful
 *   for the top-level package, once every package is compiled)
 */
export function compileSlots(cx) {
  cx.layout.forEach((slot) => {
    if (slot.owner !== cx) return;
    const original = slot.original
      ? cx.layout.indexOf(slot.original)
      : undefined;
    if (slot.original?.abstract && usesOriginal(slot.declaration.element)) {
      throw xsltError("XTSE3075", "The overridden variable is abstract");
    }
    slot.compiled = compileGlobal(
      slot.declaration,
      cx,
      cx.globalScope(original),
    );
    // the value an overriding variable replaced is only read through it
    if (slot.name === "") slot.compiled.required = false;
    // the global context item belongs to the top-level package
    if (cx.packageChain.length > 0) withoutFocus(slot.compiled);
    if (slot.abstract) {
      slot.compiled.value = ABSTRACT_BODY[0];
      slot.compiled.required = false;
    }
  });
  return cx.layout.map((slot, i) => ({
    ...slot.compiled,
    key: cx.globalKeys[i],
  }));
}

/**
 * Enters the templates, attribute sets and modes accepted from used
 * packages in the registries of this package.
 * @param {object} cx
 */
export function importAccepted(cx) {
  for (const use of cx.uses) {
    for (const { component } of use.accepted) {
      const { owner, key } = component;
      if (component.kind === "template") {
        cx.namedTemplates.set(key, owner.namedTemplates.get(key));
      } else if (component.kind === "attribute-set") {
        cx.attributeSets.set(key, owner.attributeSets.get(key));
      } else if (component.kind === "mode") {
        cx.acceptedModes.set(key, owner.mode(key));
      }
    }
  }
}

/**
 * Makes the abstract components of this package raise XTDE3052.
 * @param {object} cx
 */
export function markAbstract(cx) {
  for (const entry of cx.table.values()) {
    if (entry.owner !== cx || entry.visibility !== "abstract") continue;
    if (entry.kind === "template") {
      const template = cx.namedTemplates.get(entry.key);
      template.body = ABSTRACT_BODY;
      // its parameters are not evaluated: the call fails first
      template.params = template.params.map((param) => ({
        ...param,
        required: false,
        value: () => [],
      }));
    } else if (entry.kind === "function") {
      entry.cell.body = ABSTRACT_BODY;
    } else if (entry.kind === "attribute-set") {
      const parts = cx.attributeSets.get(entry.key);
      parts.splice(0, parts.length, { uses: [], body: ABSTRACT_BODY, cx });
    }
  }
}
