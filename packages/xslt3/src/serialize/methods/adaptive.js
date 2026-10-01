/**
 * The adaptive output method (Serialization 3.1 section 11): any
 * sequence, written in a form close to XPath syntax. Items are separated
 * by item-separator (a newline by default); nodes are written with the
 * xml method, attributes as name="value", maps as map{key:value,...},
 * arrays as [...], strings quoted, other atomic values as constructor
 * calls (xs:date("...")), functions as name#arity.
 *
 * @module @tradik/xslt3/serialize/methods/adaptive
 */

import { canonicalString, itemKind } from "../../xdm/index.js";

/** Prefixes of the standard function namespaces. */
const FUNCTION_PREFIXES = {
  "http://www.w3.org/2005/xpath-functions": "fn",
  "http://www.w3.org/2005/xpath-functions/math": "math",
  "http://www.w3.org/2005/xpath-functions/map": "map",
  "http://www.w3.org/2005/xpath-functions/array": "array",
  "http://www.w3.org/2001/XMLSchema": "xs",
};

/** Types written as quoted strings. */
const STRING_TYPES = new Set(["string", "anyURI", "untypedAtomic"]);

/**
 * An xs:double in exponential notation, e.g. 1.0e0 or -1.25e-3.
 * @param {number} value
 * @returns {string}
 */
export function doubleText(value) {
  if (Number.isNaN(value)) return "NaN";
  if (!Number.isFinite(value)) return value > 0 ? "INF" : "-INF";
  if (value === 0) return Object.is(value, -0) ? "-0.0e0" : "0.0e0";
  const [mantissa, exponent] = value.toExponential().split("e");
  const digits = mantissa.includes(".") ? mantissa : `${mantissa}.0`;
  return `${digits}e${Number(exponent)}`;
}

/**
 * @param {{namespaceURI: string, localName: string, prefix?: string}} name
 * @returns {string} prefix:local for known namespaces, else Q{uri}local
 */
function functionName(name) {
  const prefix = FUNCTION_PREFIXES[name.namespaceURI] ?? name.prefix;
  if (prefix) return `${prefix}:${name.localName}`;
  return name.namespaceURI
    ? `Q{${name.namespaceURI}}${name.localName}`
    : name.localName;
}

/** Writes the adaptive form of items. */
export class AdaptiveWriter {
  /**
   * @param {import("../output/expander.js").Expander} expander
   * @param {(node: Node) => string} serializeNode - The xml method
   */
  constructor(expander, serializeNode) {
    this.expander = expander;
    this.serializeNode = serializeNode;
  }

  /**
   * @param {Array} sequence
   * @returns {string} one item as is, others in parentheses
   */
  sequence(sequence) {
    if (sequence.length === 1) return this.item(sequence[0]);
    return `(${sequence.map((item) => this.item(item)).join(",")})`;
  }

  /**
   * @param {*} item
   * @returns {string}
   */
  item(item) {
    switch (itemKind(item)) {
      case "atomic":
        return this.atomic(item);
      case "node":
        return this.node(item);
      case "map": {
        const entries = [...item.entries.values()].map(
          ({ key, value }) => `${this.atomic(key)}:${this.sequence(value)}`,
        );
        return `map{${entries.join(",")}}`;
      }
      case "array":
        return `[${item.members.map((m) => this.sequence(m)).join(",")}]`;
      default: {
        const name = item.name
          ? functionName(item.name)
          : "(anonymous-function)";
        return `${name}#${item.arity}`;
      }
    }
  }

  /**
   * @param {Node} node
   * @returns {string}
   */
  node(node) {
    if (node.nodeType === 2) {
      const value = this.expander.attribute(node.value);
      return `${node.name}="${value}"`;
    }
    if (node.nodeType === 13) {
      const name = node.localName ? `xmlns:${node.localName}` : "xmlns";
      return `${name}="${this.expander.attribute(node.nodeValue)}"`;
    }
    return this.serializeNode(node);
  }

  /**
   * @param {import("../../xdm/atomic.js").AtomicValue} item
   * @returns {string}
   */
  atomic(item) {
    const primitive = item.type.primitive;
    const name = primitive.localName;
    if (STRING_TYPES.has(name)) return `"${item.value.replaceAll('"', '""')}"`;
    if (name === "boolean") return item.value ? "true()" : "false()";
    if (name === "decimal") return canonicalString(item);
    if (name === "double") return doubleText(item.value);
    if (name === "QName") {
      return `Q{${item.value.namespaceURI}}${item.value.localName}`;
    }
    return `${primitive.prefixedName}("${canonicalString(item)}")`;
  }
}
