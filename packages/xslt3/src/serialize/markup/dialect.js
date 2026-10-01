/**
 * The differences between the xml, xhtml and html output methods
 * (Serialization 3.1 sections 5, 6 and 7) for the markup writer: which
 * elements are HTML elements, how empty elements, attributes and
 * processing instructions are written, where CDATA sections, raw text and
 * indentation are allowed.
 *
 * HTML elements are, for the html method, those in no namespace (and with
 * HTML5 those in the XHTML namespace); for the xhtml method, those in the
 * XHTML namespace (and with HTML5 those in no namespace). HTML5 output
 * writes XHTML, SVG and MathML elements without a prefix.
 *
 * @module @tradik/xslt3/serialize/markup/dialect
 */

import { XPathError } from "../../errors.js";
import { percentEncode } from "../../functions/uri.js";
import { clarkName } from "../params/values.js";
import {
  BOOLEAN_ATTRIBUTES,
  HTML5_UNPREFIXED,
  INLINE_ELEMENTS,
  isUriAttribute,
  PRESERVING_ELEMENTS,
  RAW_TEXT_ELEMENTS,
  VOID_ELEMENTS,
  XHTML_NAMESPACE,
} from "./htmlData.js";

/** escape-html-uri: %-escapes all but printable ASCII. */
const escapeUri = (value) => percentEncode(value, (cp) => cp >= 32 && cp < 127);

/**
 * Lower-cases the local names of a set of Clark names.
 * @param {Set<string>} names
 * @returns {Set<string>}
 */
const lowerCased = (names) =>
  new Set([...names].map((n) => n.replace(/\}.*$/, (s) => s.toLowerCase())));

/** Output method rules for the markup writer. */
export class Dialect {
  /**
   * @param {import("../params/settings.js").Settings} settings
   */
  constructor(settings) {
    this.settings = settings;
    this.method = settings.method;
    this.html = this.method === "html";
    this.htmlLike = this.html || this.method === "xhtml";
    this.html5 = this.htmlLike && settings.htmlVersion === 5;
    this.unprefixed = this.html5 ? HTML5_UNPREFIXED : new Set();
    this.voids = VOID_ELEMENTS[settings.htmlVersion];
    const names = (set) => (this.html ? lowerCased(set) : set);
    this.cdataElements = names(settings.cdataSectionElements);
    this.suppressed = names(settings.suppressIndentation);
  }

  /**
   * Describes an element for the other hooks.
   * @param {Element} element
   * @param {import("./namespaces.js").FixedElement} fixed
   * @returns {{fixed: object, isHtml: boolean, lower: string, key: string}}
   */
  describe(element, fixed) {
    const ns = fixed.namespaceURI;
    const local = element.localName ?? element.nodeName;
    const lower = local.toLowerCase();
    const primary = this.html ? "" : XHTML_NAMESPACE;
    const secondary = this.html ? XHTML_NAMESPACE : "";
    const isHtml =
      this.htmlLike && (ns === primary || (this.html5 && ns === secondary));
    const key = clarkName(ns, this.html ? lower : local);
    return { fixed, isHtml, lower, key };
  }

  /**
   * @param {object} info - From {@link Dialect#describe}
   * @returns {string} the markup closing an empty element's start tag
   */
  emptyElement(info) {
    if (!this.htmlLike) return "/>";
    const isVoid = info.isHtml && this.voids.has(info.lower);
    if (this.html) {
      if (isVoid) return ">";
      return info.isHtml ? `></${info.fixed.name}>` : "/>";
    }
    return isVoid ? " />" : `></${info.fixed.name}>`;
  }

  /**
   * @param {object} info - The element
   * @param {{name: string, localName: string, namespaceURI: string, value: string}} attribute
   * @param {import("../output/expander.js").Expander} expander
   * @returns {string} the attribute markup, with its leading space
   */
  attribute(info, attribute, expander) {
    let { value } = attribute;
    if (info.isHtml && attribute.namespaceURI === "") {
      const lower = attribute.localName.toLowerCase();
      if (
        this.html &&
        BOOLEAN_ATTRIBUTES.has(lower) &&
        value.toLowerCase() === lower
      ) {
        return ` ${attribute.name}`;
      }
      if (
        this.settings.escapeUriAttributes &&
        isUriAttribute(info.lower, lower)
      ) {
        value = escapeUri(value);
      }
    }
    return ` ${attribute.name}="${expander.attribute(value)}"`;
  }

  /**
   * How the text children of an element are written.
   * @param {object} info
   * @returns {"escape"|"cdata"|"raw"}
   */
  textMode(info) {
    if (this.html && info.isHtml) {
      return RAW_TEXT_ELEMENTS.has(info.lower) ? "raw" : "escape";
    }
    return this.cdataElements.has(info.key) ? "cdata" : "escape";
  }

  /**
   * Whether indentation is suppressed inside an element and its
   * descendants.
   * @param {object} info
   * @returns {boolean}
   */
  suppressesIndent(info) {
    return (
      this.suppressed.has(info.key) ||
      (info.isHtml && PRESERVING_ELEMENTS.has(info.lower))
    );
  }

  /**
   * Whether the children (elements, comments, processing instructions)
   * of an element may be indented: not when one is an inline element.
   * @param {Array<string|Node>} children
   * @returns {boolean}
   */
  allowsIndent(children) {
    if (!this.htmlLike) return true;
    return !children.some(
      (child) =>
        child.nodeType === 1 &&
        INLINE_ELEMENTS.has((child.localName ?? child.nodeName).toLowerCase()),
    );
  }

  /**
   * @param {ProcessingInstruction} node
   * @param {import("../output/expander.js").Expander} expander
   * @returns {string} the processing instruction markup
   * @throws {XPathError} SERE0015 for ">" in HTML processing instructions
   */
  processingInstruction(node, expander) {
    const data = expander.unescaped(node.nodeValue ?? "");
    const target = node.target ?? node.nodeName;
    const space = data ? " " : "";
    if (!this.html) return `<?${target}${space}${data}?>`;
    if (data.includes(">")) {
      throw new XPathError(
        "SERE0015",
        "A processing instruction in HTML output cannot contain >",
      );
    }
    return `<?${target}${space}${data}>`;
  }
}
