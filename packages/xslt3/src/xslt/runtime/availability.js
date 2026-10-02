/**
 * The functions that tell what the processor provides (XSLT 3.0 section
 * 20.4): system-property(), available-system-properties(),
 * element-available(), function-available() and type-available().
 *
 * @module @tradik/xslt3/xslt/runtime/availability
 */

import { isStandardFunction, NS } from "../../functions/signatures.js";
import { booleanItem, stringItem } from "../../xpath/eval/atomics.js";
import { AtomicValue } from "../../xdm/atomic.js";
import { QNameValue } from "../../xdm/qname.js";
import { getType, types, XS_NAMESPACE } from "../../xdm/types.js";
import { LIST_TYPES } from "../../xpath/eval/typeExprs.js";
import { resolveQName, XSL_NS } from "../names.js";
import {
  availableInstructions,
  systemProperty,
  systemPropertyNames,
} from "./properties.js";

/**
 * Resolves a QName argument with the namespaces of the calling expression.
 * @param {string} text
 * @param {object} context - Dynamic context (with `sc`)
 * @param {string} code - Error code for an invalid name
 * @param {string} [defaultUri] - Namespace of unprefixed names
 * @returns {{uri: string, local: string}}
 */
export function nameArgument(text, context, code, defaultUri = "") {
  const namespaces = new Map(context.sc.namespaces);
  namespaces.set("", defaultUri);
  return resolveQName(text, namespaces, { code, useDefault: true });
}

/**
 * Whether the transformation allows xsl:evaluate (the dynamicEvaluation
 * option); always at compile time.
 * @param {object} context - XPath dynamic context
 * @returns {boolean}
 */
const dynamicEvaluation = (context) =>
  context.xc?.tx.dynamicEvaluation !== false;

/**
 * Whether a function of a name exists with an arity.
 * @param {object} library
 * @param {string} uri
 * @param {string} local
 * @param {number} arity
 * @returns {boolean}
 */
const hasFunction = (library, uri, local, arity) =>
  Boolean(library.lookup(uri, local, arity)) ||
  isStandardFunction(uri, local, arity);

/**
 * function-available().
 * @param {Array} args
 * @param {object} context
 * @returns {Array}
 */
function functionAvailable([[name], arity], context) {
  const { uri, local } = nameArgument(name.value, context, "XTDE1400", NS.fn);
  const library = context.sc.functions;
  const n = arity?.length ? Number(arity[0].value) : null;
  let found = false;
  for (let i = n ?? 0; i <= (n ?? 20) && !found; i++) {
    found = hasFunction(library, uri, local, i);
  }
  if (!found && uri === XS_NAMESPACE && (n === null || n === 1)) {
    try {
      // list types (xs:NMTOKENS...) have constructor functions too
      found = Boolean(LIST_TYPES[local]) || !getType(local).abstract;
    } catch {
      found = false;
    }
  }
  return [booleanItem(found)];
}

/**
 * type-available().
 * @param {Array} args
 * @param {object} context
 * @returns {Array}
 */
function typeAvailable([[name]], context) {
  const { uri, local } = nameArgument(name.value, context, "XTDE1428");
  let found = false;
  if (uri === XS_NAMESPACE) {
    try {
      found = Boolean(getType(local));
    } catch {
      found = ["anyType", "untyped", "anySimpleType"].includes(local);
    }
  }
  return [booleanItem(found)];
}

/** Function definitions. */
export const availabilityFunctions = [
  {
    local: "system-property",
    params: ["xs:string"],
    returns: "xs:string",
    impl: ([[name]], context) => {
      const { uri, local } = nameArgument(name.value, context, "XTDE1390");
      if (uri !== XSL_NS) return [stringItem("")];
      const off =
        local === "supports-dynamic-evaluation" && !dynamicEvaluation(context);
      return [stringItem(off ? "no" : systemProperty(local))];
    },
  },
  {
    local: "available-system-properties",
    params: [],
    returns: "xs:QName*",
    impl: () =>
      systemPropertyNames().map(
        (local) =>
          new AtomicValue(types.QName, new QNameValue(XSL_NS, local, "xsl")),
      ),
  },
  {
    local: "element-available",
    params: ["xs:string"],
    returns: "xs:boolean",
    impl: ([[name]], context) => {
      // unprefixed: the default namespace (xmlns) in scope
      const { uri, local } = nameArgument(
        name.value,
        context,
        "XTDE1440",
        context.sc.defaultNamespace,
      );
      const available =
        uri === XSL_NS &&
        availableInstructions.has(local) &&
        (local !== "evaluate" || dynamicEvaluation(context));
      return [booleanItem(available)];
    },
  },
  {
    local: "function-available",
    params: ["xs:string"],
    returns: "xs:boolean",
    impl: functionAvailable,
  },
  {
    local: "function-available",
    params: ["xs:string", "xs:integer"],
    returns: "xs:boolean",
    impl: functionAvailable,
  },
  {
    local: "type-available",
    params: ["xs:string"],
    returns: "xs:boolean",
    impl: typeAvailable,
  },
];
