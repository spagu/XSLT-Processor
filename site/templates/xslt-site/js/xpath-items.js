/**
 * Items of an XPath 3.1 result, described for the playground: the type of
 * each item (xs:integer, element(name), map...) and a readable value. Nodes
 * are serialized, atomic values show their string value, and maps and
 * arrays are written in XPath syntax, nested values included.
 *
 * Works on the items of @tradik/xslt3 without importing it: maps, arrays
 * and functions carry a kind under a registered symbol, atomic values a
 * type descriptor with its prefixed name.
 *
 * @module xpath-items
 */

/** Key under which @tradik/xslt3 marks maps, arrays and function items. */
const ITEM_KIND = Symbol.for("@tradik/xslt3/itemKind");

/** Width up to which a map or an array is written on one line. */
const INLINE_WIDTH = 60;

/**
 * @typedef {object} ResultItem
 * @property {string} type - Item type: xs:integer, element(name), map...
 * @property {string} value - The item, readable
 */

/**
 * The XPath item type of a DOM node: element(name), attribute(name)...
 *
 * @param {Node} node - DOM node, or a namespace node of @tradik/xslt3
 * @returns {string} The type
 */
export function nodeType(node) {
  switch (node.nodeType) {
    case 1:
      return `element(${node.nodeName})`;
    case 2:
      return `attribute(${node.nodeName})`;
    case 3:
    case 4:
      return "text()";
    case 7:
      return `processing-instruction(${node.nodeName})`;
    case 8:
      return "comment()";
    case 9:
      return "document-node()";
    default:
      return "namespace-node()";
  }
}

/**
 * A node as markup: elements, documents, comments and processing
 * instructions serialized, attributes and namespace nodes as name="value",
 * text as its content.
 *
 * @param {Node} node - The node
 * @param {XMLSerializer} serializer - Serializer of the DOM
 * @returns {string} The node, readable
 */
export function nodeValue(node, serializer) {
  switch (node.nodeType) {
    case 2:
      return `${node.nodeName}="${node.value}"`;
    case 3:
    case 4:
      return node.data;
    case 13:
      return `xmlns${node.nodeName ? `:${node.nodeName}` : ""}="${node.nodeValue}"`;
    default:
      return serializer.serializeToString(node);
  }
}

/** @type {WeakMap<object, (item: object) => string>} */
const stringers = new WeakMap();

/**
 * The string value of an atomic value, as fn:string gives it (1.0E6, not
 * 1000000, for an xs:double), compiled once per library.
 *
 * @param {object} lib - @tradik/xslt3
 * @param {object} item - An atomic value
 * @returns {string} Its string value
 */
function atomicString(lib, item) {
  if (!stringers.has(lib)) {
    const query = lib.compileXPath("string($v)", { variables: ["v"] });
    stringers.set(
      lib,
      (v) => query.evaluate(undefined, { variables: { v } })[0].value,
    );
  }
  return stringers.get(lib)(item);
}

/**
 * An atomic value as an XPath literal, for values inside maps and arrays:
 * strings quoted, numbers and booleans plain, other types as constructor
 * calls (xs:date("2026-03-14")).
 *
 * @param {object} lib - @tradik/xslt3
 * @param {object} item - An atomic value
 * @returns {string} The literal
 */
function atomicLiteral(lib, item) {
  const text = atomicString(lib, item);
  const type = item.type.prefixedName;
  if (type === "xs:string" || type === "xs:untypedAtomic") {
    return JSON.stringify(text);
  }
  if (type === "xs:boolean") return `${text}()`;
  if (/^xs:(integer|decimal|double)$/.test(type)) return text;
  return `${type}(${JSON.stringify(text)})`;
}

/**
 * A function item: its name and arity, or "function#2" when anonymous.
 *
 * @param {object} item - Function item of @tradik/xslt3
 * @returns {string} The function, readable
 */
function functionValue(item) {
  const name = item.name ? String(item.name) : "function";
  return `${name}#${item.arity}`;
}

/**
 * Write the parts of a map or an array on one line when they are short,
 * otherwise one part per line, indented.
 *
 * @param {string} open - Opening bracket
 * @param {string[]} parts - Entries or members, already written
 * @param {string} close - Closing bracket
 * @param {string} indent - Indentation of the enclosing line
 * @returns {string} The map or array
 */
function bracket(open, parts, close, indent) {
  if (parts.length === 0) return `${open.trimEnd()}${close.trimStart()}`;
  const inline = `${open}${parts.join(", ")}${close}`;
  if (inline.length <= INLINE_WIDTH && !inline.includes("\n")) return inline;
  const inner = `${indent}  `;
  return `${open.trimEnd()}\n${parts.map((p) => inner + p).join(",\n")}\n${indent}${close.trimStart()}`;
}

/**
 * A sequence inside a map or an array: () when empty, the item alone, or
 * the items in parentheses.
 *
 * @param {Array} sequence - Items
 * @param {object} env - Library and serializer
 * @param {string} indent - Indentation of the enclosing line
 * @returns {string} The sequence, readable
 */
function sequenceValue(sequence, env, indent) {
  const parts = sequence.map((item) => nestedValue(item, env, indent));
  return parts.length === 1 ? parts[0] : bracket("(", parts, ")", indent);
}

/**
 * An item inside a map or an array.
 *
 * @param {object} item - Any item
 * @param {object} env - Library and serializer
 * @param {string} indent - Indentation of the enclosing line
 * @returns {string} The item, readable
 */
function nestedValue(item, env, indent) {
  const kind = item[ITEM_KIND];
  if (kind === "map") {
    const parts = item
      .keys()
      .map(
        (key) =>
          `${atomicLiteral(env.lib, key)}: ${sequenceValue(item.get(key), env, `${indent}  `)}`,
      );
    return bracket("map { ", parts, " }", indent);
  }
  if (kind === "array") {
    const parts = item.members.map((member) =>
      sequenceValue(member, env, `${indent}  `),
    );
    return bracket("[", parts, "]", indent);
  }
  if (kind === "function") return functionValue(item);
  if (typeof item.nodeType === "number") {
    return nodeValue(item, env.serializer);
  }
  return atomicLiteral(env.lib, item);
}

/**
 * Describe one item of a result: its type and a readable value. Atomic
 * values show their string value; maps and arrays are written in XPath
 * syntax, nested values included.
 *
 * @param {object} item - Atomic value, DOM node, map, array or function
 * @param {{ lib: object, serializer: XMLSerializer }} env - @tradik/xslt3
 *   and an XMLSerializer
 * @returns {ResultItem} The description
 */
export function describeItem(item, env) {
  const kind = item[ITEM_KIND];
  if (kind === "map") return { type: "map", value: nestedValue(item, env, "") };
  if (kind === "array") {
    return { type: "array", value: nestedValue(item, env, "") };
  }
  if (kind === "function") {
    return { type: "function", value: functionValue(item) };
  }
  if (typeof item.nodeType === "number") {
    return { type: nodeType(item), value: nodeValue(item, env.serializer) };
  }
  return { type: item.type.prefixedName, value: atomicString(env.lib, item) };
}
