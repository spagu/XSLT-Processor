/**
 * Parser of the XPath regular expression grammar (XSD 1.1 regExp with the
 * F&O 3.1 additions: ^ $ anchors, reluctant quantifiers, back-references,
 * non-capturing groups), producing JS RegExp source for the `u` flag.
 * Character classes and escapes are handled by charClass.js.
 *
 * @module @tradik/xslt3/functions/regex/parser
 */

import { parseCharClass } from "./charClass.js";
import { jsChar, parseEscape, regexError } from "./escapes.js";
import { RegexReader } from "./reader.js";

const isDigit = (c) => c !== undefined && c >= "0" && c <= "9";

/** Recursive-descent translator of one pattern to JS source. */
export class RegexParser {
  /**
   * @param {string} pattern
   * @param {{dotAll: boolean, multiLine: boolean, caseless: boolean}} options
   *   - The s and m flags; caseless: categories ignore the i flag
   */
  constructor(pattern, options) {
    this.reader = new RegexReader(pattern, options.caseless);
    this.options = options;
    this.groups = 0;
    this.parents = [0];
    this.open = [];
    this.closed = new Set();
  }

  /** @returns {string} the translation of the whole pattern */
  translate() {
    const source = this.alternation();
    if (!this.reader.atEnd()) regexError("unmatched )");
    return source;
  }

  /** @returns {string} branch ("|" branch)* */
  alternation() {
    const branches = [this.branch()];
    while (this.reader.peek() === "|") {
      this.reader.next();
      branches.push(this.branch());
    }
    return branches.join("|");
  }

  /** @returns {string} a sequence of pieces */
  branch() {
    let source = "";
    for (;;) {
      const c = this.reader.peek();
      if (c === undefined || c === "|" || c === ")") return source;
      source += this.atom() + this.quantifier();
    }
  }

  /** @returns {string} one atom */
  atom() {
    const { reader, options } = this;
    const c = reader.next();
    switch (c) {
      case "(":
        return this.group();
      case "[":
        return parseCharClass(reader);
      case ".":
        return options.dotAll ? "[^]" : "[^\\n\\r]";
      case "^":
        // a line starts after any \n except one that ends the string
        return options.multiLine ? "(?:^|(?<=\\n)(?!$))" : "(?:^)";
      case "$":
        return options.multiLine ? "(?:$|(?=\\n))" : "(?:$)";
      case "\\":
        return isDigit(reader.peek()) ? this.backReference() : escape(reader);
      default:
        if ("?*+{}]".includes(c)) regexError(`unexpected ${c}`);
        return jsChar(c.codePointAt(0));
    }
  }

  /** @returns {string} a group, the reader being after "(" */
  group() {
    const { reader } = this;
    let source;
    if (reader.peek() === "?") {
      reader.next();
      if (reader.next() !== ":") regexError("unsupported group syntax (?");
      source = `(?:${this.alternation()})`;
    } else {
      const number = ++this.groups;
      this.parents[number] = this.open.at(-1) ?? 0;
      this.open.push(number);
      source = `(${this.alternation()})`;
      this.open.pop();
      this.closed.add(number);
    }
    if (reader.next() !== ")") regexError("missing )");
    return source;
  }

  /** @returns {string} a back-reference, the reader being on its digits */
  backReference() {
    const { reader } = this;
    if (reader.peek() === "0") regexError("\\0 is not a back-reference");
    let number = Number(reader.next());
    while (
      isDigit(reader.peek()) &&
      number * 10 + Number(reader.peek()) <= this.groups
    ) {
      number = number * 10 + Number(reader.next());
    }
    if (!this.closed.has(number)) {
      regexError(`back-reference \\${number} to a group not closed before it`);
    }
    return `(?:\\${number})`;
  }

  /** @returns {string} an optional quantifier with its reluctant mark */
  quantifier() {
    const { reader } = this;
    const c = reader.peek();
    let source;
    if (c === "?" || c === "*" || c === "+") {
      source = reader.next();
    } else if (c === "{") {
      reader.next();
      source = `{${this.bounds()}}`;
    } else {
      return "";
    }
    if (reader.peek() === "?") source += reader.next();
    return source;
  }

  /** @returns {string} "n", "n," or "n,m" of a {..} quantifier */
  bounds() {
    const { reader } = this;
    const digits = () => {
      let text = "";
      while (isDigit(reader.peek())) text += reader.next();
      return text;
    };
    const min = digits();
    let text = min;
    if (reader.peek() === ",") {
      reader.next();
      const max = digits();
      if (max !== "" && BigInt(max) < BigInt(min || "0")) {
        regexError("quantifier {n,m} with m < n");
      }
      text += `,${max}`;
    }
    if (min === "" || reader.next() !== "}") regexError("invalid quantifier");
    return text;
  }
}

/**
 * An escape outside a class as a JS atom.
 * @param {RegexReader} reader
 * @returns {string}
 */
function escape(reader) {
  const item = parseEscape(reader);
  if (item.char !== undefined) return item.set;
  return item.atom ?? `[${item.set}]`;
}
