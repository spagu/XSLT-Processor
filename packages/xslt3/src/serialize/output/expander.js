/**
 * Character expansion (Serialization 3.1 section 4, phase 2): character
 * maps, Unicode normalization, escaping of the characters markup gives a
 * meaning to, and character references for the characters the encoding
 * cannot represent. A character replaced by a character map is written as
 * it is mapped: it is neither normalized nor escaped.
 *
 * @module @tradik/xslt3/serialize/output/expander
 */

import { XPathError } from "../../errors.js";

/**
 * @param {number} codePoint
 * @returns {string} a hexadecimal character reference, e.g. "&#xE9;"
 */
export const characterReference = (codePoint) =>
  `&#x${codePoint.toString(16).toUpperCase()};`;

const NAMED = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

/**
 * Characters escaped in each context. XML escapes CR, NEL, LINE
 * SEPARATOR, DEL and the C1 controls as references, attributes also tab
 * and newline (which attribute value normalization would turn into
 * spaces); the other C0 controls are only allowed, as references, in XML
 * 1.1. HTML attributes keep "&{" (a script macro) and "<" unescaped.
 */
const C0 = "\\u0001-\\u0008\\u000B\\u000C\\u000E-\\u001F";
const C1 = "\\u007F-\\u009F\\u2028";
const PATTERNS = {
  xmlText: `[&<>\\r${C0}${C1}]`,
  xmlAttribute: `[&<>"\\t\\n\\r${C0}${C1}]`,
  htmlText: "[&<>]",
  htmlAttribute: '&(?!\\{)|"',
};

/** Expands characters for one serialization. */
export class Expander {
  /**
   * @param {import("../params/settings.js").Settings} settings
   */
  constructor(settings) {
    this.map = settings.useCharacterMaps;
    this.form =
      settings.normalizationForm === "none" ? null : settings.normalizationForm;
    this.encodable = settings.encoding.encodable;
    this.xml11 = settings.version === "1.1";
    this.html = settings.method === "html";
    const restricted = this.encodable ? "|[^\\u0000-\\u007F]" : "";
    const compile = (name) => new RegExp(PATTERNS[name] + restricted, "gu");
    this.textPattern = compile(this.html ? "htmlText" : "xmlText");
    this.attributePattern = compile(
      this.html ? "htmlAttribute" : "xmlAttribute",
    );
    this.replace = (char) => this.replacement(char);
  }

  /**
   * The escaped form of a character matched by a pattern.
   * @param {string} char
   * @returns {string}
   */
  replacement(char) {
    const named = NAMED[char];
    if (named) return named;
    const cp = char.codePointAt(0);
    if (cp < 0x20 && cp !== 9 && cp !== 10 && cp !== 13 && !this.xml11) {
      throw new XPathError(
        "SERE0006",
        `Character #x${cp.toString(16)} is not allowed in XML 1.0`,
      );
    }
    if (cp < 0xa0 || cp === 0x2028 || !this.encodable(cp)) {
      return characterReference(cp);
    }
    return char;
  }

  /**
   * Splits text into the runs of unmapped characters (normalized and
   * passed to `write`) and the replacements of mapped ones (kept as they
   * are).
   * @param {string} text
   * @param {(run: string) => string} write - Expands an unmapped run
   * @returns {string}
   */
  mapped(text, write) {
    const expand = (run) => write(this.form ? run.normalize(this.form) : run);
    if (!this.map) return expand(text);
    let result = "";
    let run = "";
    for (const char of text) {
      const replacement = this.map.get(char);
      if (replacement === undefined) {
        run += char;
      } else {
        if (run) result += expand(run);
        result += replacement;
        run = "";
      }
    }
    return run ? result + expand(run) : result;
  }

  /**
   * Checks the characters of HTML output (SERE0014: C1 controls).
   * @param {string} text
   */
  checkHtml(text) {
    if (this.html && /[\u007F-\u009F]/.test(text)) {
      throw new XPathError(
        "SERE0014",
        "The HTML output method cannot write the characters #x7F to #x9F",
      );
    }
  }

  /**
   * @param {string} text - Content of a text node
   * @returns {string} escaped character data
   */
  text(text) {
    this.checkHtml(text);
    return this.mapped(text, (run) =>
      run.replace(this.textPattern, this.replace),
    );
  }

  /**
   * @param {string} value - Attribute value
   * @returns {string} the escaped value, to be written between quotes
   */
  attribute(value) {
    this.checkHtml(value);
    return this.mapped(value, (run) =>
      run.replace(this.attributePattern, this.replace),
    );
  }

  /**
   * Text written as CDATA sections; a mapped or unencodable character
   * ends the section, and "]]>" is split across two sections.
   * @param {string} text
   * @returns {string}
   */
  cdata(text) {
    return this.mapped(text, (run) => {
      let result = "";
      let section = "";
      const flush = () => {
        if (section) {
          const safe = section.replaceAll("]]>", "]]]]><![CDATA[>");
          result += `<![CDATA[${safe}]]>`;
        }
        section = "";
      };
      for (const char of run) {
        const cp = char.codePointAt(0);
        if (this.encodable && !this.encodable(cp)) {
          flush();
          result += characterReference(cp);
        } else {
          section += char;
        }
      }
      flush();
      return result;
    });
  }

  /**
   * Text written without escaping (HTML script and style content, the
   * text output method): character maps and normalization only.
   * @param {string} text
   * @returns {string}
   * @throws {XPathError} SERE0008 for characters the encoding lacks
   */
  raw(text) {
    this.checkHtml(text);
    return this.mapped(text, (run) => this.unescaped(run));
  }

  /**
   * Text written as it is, which must be encodable: names, comments,
   * processing instructions, unescaped text.
   * @param {string} text
   * @returns {string}
   * @throws {XPathError} SERE0008 for characters the encoding lacks
   */
  unescaped(text) {
    if (this.encodable) {
      for (const char of text) {
        if (!this.encodable(char.codePointAt(0))) {
          throw new XPathError(
            "SERE0008",
            `Character ${char} cannot be written in the output encoding`,
          );
        }
      }
    }
    return text;
  }
}
