/**
 * The JSON output method (Serialization 3.1 section 10): maps as objects,
 * arrays as arrays, numbers, booleans and strings as themselves, other
 * atomic values as strings, nodes as strings holding their serialization
 * with json-node-output-method.
 *
 * Errors: SERE0020 for NaN and infinities, SERE0021 for function items,
 * SERE0022 for duplicate keys (unless allow-duplicate-names), SERE0023
 * for sequences of more than one item.
 *
 * @module @tradik/xslt3/serialize/methods/json
 */

import { XPathError } from "../../errors.js";
import { canonicalString, itemKind } from "../../xdm/index.js";

const ESCAPES = {
  '"': '\\"',
  "\\": "\\\\",
  "/": "\\/",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
};

/**
 * @param {number} unit - UTF-16 code unit
 * @returns {string} a \u escape
 */
const unicodeEscape = (unit) =>
  `\\u${unit.toString(16).toUpperCase().padStart(4, "0")}`;

/** Writes JSON for one serialization. */
export class JsonWriter {
  /**
   * @param {import("../params/settings.js").Settings} settings
   * @param {import("../output/expander.js").Expander} expander - For
   *   character maps and normalization
   * @param {(node: Node) => string} serializeNode - Serializes a node
   *   with json-node-output-method
   */
  constructor(settings, expander, serializeNode) {
    this.settings = settings;
    this.expander = expander;
    this.serializeNode = serializeNode;
    const encodable = settings.encoding.encodable;
    this.escapeChar = (char) => {
      if (ESCAPES[char]) return ESCAPES[char];
      const cp = char.codePointAt(0);
      if (cp < 0xa0 || (encodable && !encodable(cp))) {
        let escaped = "";
        for (let i = 0; i < char.length; i++) {
          escaped += unicodeEscape(char.charCodeAt(i));
        }
        return escaped;
      }
      return char;
    };
    const escaped = '["\\\\/\\u0000-\\u001F\\u007F-\\u009F]';
    this.pattern = new RegExp(
      encodable ? `${escaped}|[^\\u0000-\\u007F]` : escaped,
      "gu",
    );
  }

  /**
   * @param {string} text
   * @returns {string} a JSON string literal
   */
  string(text) {
    const body = this.expander.mapped(text, (run) =>
      run.replace(this.pattern, this.escapeChar),
    );
    return `"${body}"`;
  }

  /**
   * @param {Array} sequence - A value: at most one item
   * @param {number} depth - Nesting depth, for indentation
   * @returns {string}
   */
  sequence(sequence, depth) {
    if (sequence.length > 1) {
      throw new XPathError(
        "SERE0023",
        "The JSON output method cannot write a sequence of several items",
      );
    }
    return sequence.length ? this.item(sequence[0], depth) : "null";
  }

  /**
   * @param {string[]} members - Serialized members
   * @param {string} open
   * @param {string} close
   * @param {number} depth
   * @returns {string} an object or array
   */
  container(members, open, close, depth) {
    if (!members.length) return open + close;
    if (!this.settings.indent) return open + members.join(",") + close;
    const inner = `\n${"  ".repeat(depth + 1)}`;
    return `${open}${inner}${members.join(`,${inner}`)}\n${"  ".repeat(depth)}${close}`;
  }

  /**
   * @param {*} item
   * @param {number} depth
   * @returns {string}
   */
  item(item, depth) {
    const kind = itemKind(item);
    if (kind === "map") {
      const seen = new Set();
      const separator = this.settings.indent ? ": " : ":";
      const members = [...item.entries.values()].map(({ key, value }) => {
        const name = canonicalString(key);
        if (seen.has(name) && !this.settings.allowDuplicateNames) {
          throw new XPathError("SERE0022", `Duplicate key ${name} in JSON`);
        }
        seen.add(name);
        return this.string(name) + separator + this.sequence(value, depth + 1);
      });
      return this.container(members, "{", "}", depth);
    }
    if (kind === "array") {
      const members = item.members.map((m) => this.sequence(m, depth + 1));
      return this.container(members, "[", "]", depth);
    }
    if (kind === "node") return this.string(this.serializeNode(item));
    if (kind === "function") {
      throw new XPathError(
        "SERE0021",
        "A function item cannot be written as JSON",
      );
    }
    return this.atomic(item);
  }

  /**
   * @param {import("../../xdm/atomic.js").AtomicValue} item
   * @returns {string}
   */
  atomic(item) {
    const primitive = item.type.primitive.localName;
    if (primitive === "boolean") return String(item.value);
    const text = canonicalString(item);
    if (primitive === "double" || primitive === "float") {
      if (!Number.isFinite(item.value)) {
        throw new XPathError("SERE0020", `${text} cannot be written as JSON`);
      }
      return text;
    }
    return primitive === "decimal" ? text : this.string(text);
  }
}
