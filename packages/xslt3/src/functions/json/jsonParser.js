/**
 * A strict JSON parser (RFC 7159) for fn:parse-json and fn:json-to-xml
 * (F&O 3.1 section 17.5). Each value is handed to a builder as soon as it
 * is read, so that each function makes its own result (DOM nodes, XDM
 * items) without an intermediate tree; {@link TREE_BUILDER} makes a plain
 * tree. Strings keep track of which characters were written as escape
 * sequences, because the `escape` and `fallback` options treat them by
 * their original form: a string without escape sequences is the slice of
 * the text it is, the others a list of characters. The `liberal` option
 * accepts nothing more (allowed: what a liberal parser accepts is
 * implementation-defined).
 *
 * @module @tradik/xslt3/functions/json/jsonParser
 */

import { XPathError } from "../../errors.js";
import { scanChars } from "./jsonChars.js";

/** @typedef {import("./jsonChars.js").JsonChar} JsonChar */

/**
 * The characters of a JSON string: the string itself when it was written
 * without escape sequences, else its characters.
 * @typedef {string|JsonChar[]} JsonString
 */

/**
 * @typedef {{kind: "object", entries: Array<[JsonString, JsonValue]>}
 *   | {kind: "array", members: JsonValue[]}
 *   | {kind: "string", chars: JsonString}
 *   | {kind: "number", text: string}
 *   | {kind: "boolean", value: boolean}
 *   | {kind: "null"}} JsonValue
 */

/**
 * Makes the result of each JSON value from the results of its members.
 * @template T
 * @typedef {object} JsonBuilder
 * @property {(entries: Array<[JsonString, T]>) => T} object
 * @property {(members: T[]) => T} array
 * @property {(chars: JsonString) => T} string
 * @property {(text: string) => T} number - The number as written
 * @property {(value: boolean) => T} boolean
 * @property {() => T} null
 */

/** @type {JsonBuilder<JsonValue>} The builder of a plain tree. */
export const TREE_BUILDER = Object.freeze({
  object: (entries) => ({ kind: "object", entries }),
  array: (members) => ({ kind: "array", members }),
  string: (chars) => ({ kind: "string", chars }),
  number: (text) => ({ kind: "number", text }),
  boolean: (value) => ({ kind: "boolean", value }),
  null: () => ({ kind: "null" }),
});

const LITERALS = new Set(["true", "false", "null"]);
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const WHITESPACE = /[ \t\n\r]*/y;
const WORD = /[a-z]+/y;
/** The body of a string up to a quote, a backslash or a control. */
// eslint-disable-next-line no-control-regex -- JSON strings exclude them
const PLAIN = /[^"\\\u0000-\u001f]*/y;

/**
 * @param {string} message
 * @returns {never}
 * @throws {XPathError} FOJS0001
 */
const syntaxError = (message) => {
  throw new XPathError("FOJS0001", `Invalid JSON: ${message}`);
};

/** A recursive descent parser over one JSON text. */
class Parser {
  /**
   * @param {string} text
   * @param {JsonBuilder<*>} builder
   */
  constructor(text, builder) {
    this.text = text;
    this.pos = 0;
    this.builder = builder;
  }

  /** Skips JSON whitespace. */
  skip() {
    WHITESPACE.lastIndex = this.pos;
    WHITESPACE.exec(this.text);
    this.pos = WHITESPACE.lastIndex;
  }

  /**
   * @param {string} char - Expected character, after whitespace
   */
  expect(char) {
    this.skip();
    if (this.text[this.pos] !== char) {
      syntaxError(`expected "${char}" at offset ${this.pos}`);
    }
    this.pos++;
  }

  /** @returns {*} what the builder makes of the value */
  value() {
    this.skip();
    const char = this.text[this.pos];
    if (char === "{") return this.object();
    if (char === "[") return this.array();
    if (char === '"') return this.builder.string(this.string());
    WORD.lastIndex = this.pos;
    const word = WORD.exec(this.text)?.[0];
    if (LITERALS.has(word)) {
      this.pos += word.length;
      return word === "null"
        ? this.builder.null()
        : this.builder.boolean(word === "true");
    }
    NUMBER.lastIndex = this.pos;
    const number = NUMBER.exec(this.text)?.[0];
    if (number === undefined) syntaxError(`unexpected input at ${this.pos}`);
    this.pos += number.length;
    if (/^[\w.+-]/.test(this.text[this.pos] ?? "")) {
      syntaxError(`invalid number at ${this.pos}`);
    }
    return this.builder.number(number);
  }

  /**
   * Members of an object or array up to the closing bracket.
   * @param {string} close
   * @param {() => *} member
   * @returns {Array}
   */
  list(close, member) {
    this.pos++;
    this.skip();
    const items = [];
    if (this.text[this.pos] === close) {
      this.pos++;
      return items;
    }
    for (;;) {
      items.push(member());
      this.skip();
      const char = this.text[this.pos++];
      if (char === close) return items;
      if (char !== ",") syntaxError(`expected "," or "${close}"`);
    }
  }

  /** @returns {*} */
  object() {
    const entries = this.list("}", () => {
      this.skip();
      if (this.text[this.pos] !== '"') syntaxError("expected a string key");
      const key = this.string();
      this.expect(":");
      return [key, this.value()];
    });
    return this.builder.object(entries);
  }

  /** @returns {*} */
  array() {
    return this.builder.array(this.list("]", () => this.value()));
  }

  /** @returns {JsonString} the characters of a string literal */
  string() {
    const start = this.pos + 1;
    PLAIN.lastIndex = start;
    PLAIN.exec(this.text);
    const plainEnd = PLAIN.lastIndex;
    if (this.text[plainEnd] === '"') {
      this.pos = plainEnd + 1;
      return this.text.slice(start, plainEnd);
    }
    const { chars, end } = scanChars(this.text, start, syntaxError);
    this.pos = end + 1;
    return chars;
  }
}

/**
 * Parses a JSON text; a leading byte order mark is ignored.
 * @template T
 * @param {string} text
 * @param {JsonBuilder<T>} [builder] - Makes the results (default: a plain
 *   tree of {@link JsonValue})
 * @returns {T} what the builder makes of the whole text
 * @throws {XPathError} FOJS0001 when the text is not JSON
 */
export function parseJsonText(text, builder = TREE_BUILDER) {
  const parser = new Parser(text.replace(/^\uFEFF/, ""), builder);
  const value = parser.value();
  parser.skip();
  if (parser.pos < parser.text.length) {
    syntaxError(`unexpected input after the value at ${parser.pos}`);
  }
  return value;
}
