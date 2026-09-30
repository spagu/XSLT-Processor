/**
 * Serialization of deeply nested result trees: the writers walk the tree on
 * an explicit stack (frames.js), so nesting far deeper than the JavaScript
 * call stack allows serializes like any other tree, with every output rule
 * intact, through transformToString and transformToStream alike.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { XSLTProcessor } from "../../XSLTProcessor.js";
import {
  markRawText,
  serializeChunks,
  serializeResult,
} from "../serializer.js";
import { NODE_TYPE } from "./constants.js";

const { window } = new JSDOM("");
const parseXML = (markup) =>
  new window.DOMParser().parseFromString(markup, "application/xml");

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';

before(() => {
  globalThis.DOMParser = window.DOMParser;
});

after(() => {
  delete globalThis.DOMParser;
});

/**
 * A stylesheet nesting `depth` `e` elements around the text `x`, by
 * recursion of a named template.
 *
 * @param {number} depth - Number of nested elements
 * @param {string} output - Attributes of xsl:output
 * @returns {string} The stylesheet
 */
function nestingStylesheet(depth, output) {
  return `<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
    <xsl:output ${output}/>
    <xsl:template match="/"><xsl:call-template name="r"><xsl:with-param name="n" select="${depth}"/></xsl:call-template></xsl:template>
    <xsl:template name="r"><xsl:param name="n"/><xsl:if test="$n > 0"><e><xsl:call-template name="r"><xsl:with-param name="n" select="$n - 1"/></xsl:call-template></e></xsl:if><xsl:if test="$n = 0">x</xsl:if></xsl:template>
  </xsl:stylesheet>`;
}

/**
 * Read a stream to its end.
 *
 * @param {ReadableStream<string>} stream - The stream
 * @returns {Promise<string[]>} Its chunks
 */
async function readAll(stream) {
  const chunks = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
}

/**
 * `depth` nested `e` elements around `inner`, without indentation.
 *
 * @param {number} depth - Number of nested elements
 * @param {string} inner - Content of the innermost element
 * @returns {string} The markup
 */
function flat(depth, inner) {
  return `${"<e>".repeat(depth)}${inner}${"</e>".repeat(depth)}`;
}

/**
 * `depth` nested `e` elements around the text `x`, indented: every element
 * but the innermost has element-only content.
 *
 * @param {number} depth - Number of nested elements
 * @returns {string} The markup
 */
function indented(depth) {
  const open = [];
  const close = [];
  for (let level = 0; level < depth - 1; level++) {
    open.push(`<e>\n${"  ".repeat(level + 1)}`);
    close.push(`\n${"  ".repeat(level)}</e>`);
  }
  return `${open.join("")}<e>x</e>${close.reverse().join("")}`;
}

describe("deep result trees through the XSLTProcessor API", () => {
  const depth = 5000;
  const cases = [
    ["xml", 'method="xml"', XML_DECLARATION + flat(depth, "x")],
    [
      "xml indented",
      'method="xml" indent="yes"',
      XML_DECLARATION + indented(depth),
    ],
    ["html", 'method="html" indent="no"', flat(depth, "x")],
    ["html indented", 'method="html" indent="yes"', indented(depth)],
    ["xhtml", 'method="xhtml"', XML_DECLARATION + flat(depth, "x")],
    ["text", 'method="text"', "x"],
  ];

  for (const [label, output, expected] of cases) {
    it(`serializes ${depth} nested elements, ${label}`, async () => {
      const processor = new XSLTProcessor({ maxTemplateDepth: depth + 10 });
      processor.importStylesheet(parseXML(nestingStylesheet(depth, output)));
      const source = parseXML("<d/>");

      assert.strictEqual(processor.transformToString(source), expected);
      const chunks = await readAll(
        processor.transformToStream(source, { chunkSize: 4096 }),
      );
      assert.ok(chunks.every((chunk) => chunk.length <= 4096));
      assert.strictEqual(chunks.join(""), expected);
    });
  }
});

/**
 * Minimal result tree nodes. jsdom checks the ancestors of the parent on
 * every insertion, so building a 50,000-level tree with it takes minutes;
 * the serializer only reads these properties.
 */
class TreeNode {
  /**
   * @param {number} nodeType - DOM node type
   * @param {object} [fields] - Node properties (nodeName, nodeValue, ...)
   */
  constructor(nodeType, fields = {}) {
    this.nodeType = nodeType;
    this.namespaceURI = null;
    this.prefix = null;
    this.attributes = [];
    this.childNodes = [];
    this.parentNode = null;
    this.nextSibling = null;
    this.nodeValue = null;
    Object.assign(this, fields);
  }

  /** @returns {TreeNode|null} The first child */
  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  /**
   * Append children.
   *
   * @param {...TreeNode} children - Nodes to append
   * @returns {TreeNode} This node
   */
  append(...children) {
    for (const child of children) {
      const last = this.childNodes.at(-1);
      if (last) last.nextSibling = child;
      child.parentNode = this;
      this.childNodes.push(child);
    }
    return this;
  }
}

const element = (name) =>
  new TreeNode(NODE_TYPE.ELEMENT, { nodeName: name, localName: name });
const text = (value) => new TreeNode(NODE_TYPE.TEXT, { nodeValue: value });

/**
 * A fragment of `depth` nested `e` elements around `inner`.
 *
 * @param {number} depth - Number of nested elements
 * @param {TreeNode[]} inner - Children of the innermost element
 * @returns {TreeNode} The fragment
 */
function deepFragment(depth, inner) {
  const fragment = new TreeNode(NODE_TYPE.DOCUMENT_FRAGMENT);
  let parent = fragment;
  for (let level = 0; level < depth; level++) {
    const child = element("e");
    parent.append(child);
    parent = child;
  }
  parent.append(...inner);
  return fragment;
}

/**
 * Serialize with serializeResult and serializeChunks and check both agree.
 *
 * @param {TreeNode} tree - Result tree
 * @param {object} settings - Output settings
 * @returns {string} The output
 */
function serializeBoth(tree, settings) {
  const whole = serializeResult(tree, settings);
  const chunks = [...serializeChunks(tree, settings, { chunkSize: 4096 })];
  assert.ok(chunks.every((chunk) => chunk.length <= 4096));
  assert.strictEqual(chunks.join(""), whole);
  return whole;
}

describe("50,000 nested elements", () => {
  const depth = 50000;

  it("keeps escaping, comments and processing instructions in xml", () => {
    const tree = deepFragment(depth, [
      text("a<b&"),
      new TreeNode(NODE_TYPE.COMMENT, { nodeValue: "c--" }),
      new TreeNode(NODE_TYPE.PROCESSING_INSTRUCTION, {
        target: "p",
        nodeValue: "d",
      }),
    ]);
    assert.strictEqual(
      serializeBoth(tree, { method: "xml" }),
      XML_DECLARATION + flat(depth, "a&lt;b&amp;<!--c- - --><?p d?>"),
    );
  });

  it("joins adjacent text into one CDATA section and keeps raw text", () => {
    const tree = deepFragment(depth, [
      text("a]]>"),
      text("b"),
      markRawText(text("<raw/>")),
      text("c"),
    ]);
    assert.strictEqual(
      serializeBoth(tree, {
        method: "xml",
        omitXmlDeclaration: "yes",
        cdataSectionElements: "e",
      }),
      flat(depth, "<![CDATA[a]]]]><![CDATA[>b]]><raw/><![CDATA[c]]>"),
    );
  });

  it("writes html void elements and processing instructions", () => {
    const tree = deepFragment(depth, [
      element("br"),
      new TreeNode(NODE_TYPE.PROCESSING_INSTRUCTION, {
        target: "p",
        nodeValue: "",
      }),
    ]);
    assert.strictEqual(
      serializeBoth(tree, { method: "html" }),
      flat(depth, "<br><?p>"),
    );
  });

  it("writes xhtml empty elements", () => {
    const tree = deepFragment(depth, [element("br"), element("div")]);
    assert.strictEqual(
      serializeBoth(tree, { method: "xhtml", omitXmlDeclaration: "yes" }),
      flat(depth, "<br /><div></div>"),
    );
  });

  it("writes the text output method", () => {
    const tree = deepFragment(depth, [text("x"), text("y")]);
    assert.strictEqual(serializeBoth(tree, { method: "text" }), "xy");
  });
});
