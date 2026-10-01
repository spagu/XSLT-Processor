/**
 * A strict JSON parser (RFC 7159) for fn:parse-json and fn:json-to-xml
 * (F&O 3.1 section 17.5). It builds a plain tree that each function turns
 * into its own result; strings keep track of which characters were
 * written as escape sequences, because the `escape` and `fallback` options
 * treat them by their original form. The `liberal` option accepts nothing
 * more (allowed: what a liberal parser accepts is implementation-defined).
 *
 * @module @tradik/xslt3/functions/json/jsonParser
 */

import { XPathError } from "../../errors.js";
import { scanChars } from "./jsonChars.js";

/** @typedef {import("./jsonChars.js").JsonChar} JsonChar */

/**
 * @typedef {{kind: "object", entries: Array<[JsonChar[], JsonValue]>}
 *   | {kind: "array", members: JsonValue[]}
 *   | {kind: "string", chars: JsonChar[]}
 *   | {kind: "number", text: string}
 *   | {kind: "boolean", value: boolean}
 *   | {kind: "null"}} JsonValue
 */

const LITERALS = { true: true, false: false, null: null };
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const WHITESPACE = /[ \t\n\r]*/y;

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
  /** @param {string} text */
  constructor(text) {
    this.text = text;
    this.pos = 0;
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

  /** @returns {JsonValue} */
  value() {
    this.skip();
    const char = this.text[this.pos];
    if (char === "{") return this.object();
    if (char === "[") return this.array();
    if (char === '"') return { kind: "string", chars: this.string() };
    const word = /^[a-z]+/.exec(this.text.slice(this.pos))?.[0];
    if (word !== undefined && Object.hasOwn(LITERALS, word)) {
      this.pos += word.length;
      const value = LITERALS[word];
      return value === null ? { kind: "null" } : { kind: "boolean", value };
    }
    NUMBER.lastIndex = this.pos;
    const number = NUMBER.exec(this.text)?.[0];
    if (number === undefined) syntaxError(`unexpected input at ${this.pos}`);
    this.pos += number.length;
    if (/^[\w.+-]/.test(this.text[this.pos] ?? "")) {
      syntaxError(`invalid number at ${this.pos}`);
    }
    return { kind: "number", text: number };
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

  /** @returns {JsonValue} */
  object() {
    const entries = this.list("}", () => {
      this.skip();
      if (this.text[this.pos] !== '"') syntaxError("expected a string key");
      const key = this.string();
      this.expect(":");
      return [key, this.value()];
    });
    return { kind: "object", entries };
  }

  /** @returns {JsonValue} */
  array() {
    return { kind: "array", members: this.list("]", () => this.value()) };
  }

  /** @returns {JsonChar[]} the characters of a string literal */
  string() {
    const { chars, end } = scanChars(this.text, this.pos + 1, syntaxError);
    this.pos = end + 1;
    return chars;
  }
}

/**
 * Parses a JSON text; a leading byte order mark is ignored.
 * @param {string} text
 * @returns {JsonValue}
 * @throws {XPathError} FOJS0001 when the text is not JSON
 */
export function parseJsonText(text) {
  const parser = new Parser(text.replace(/^\uFEFF/, ""));
  const value = parser.value();
  parser.skip();
  if (parser.pos < parser.text.length) {
    syntaxError(`unexpected input after the value at ${parser.pos}`);
  }
  return value;
}
