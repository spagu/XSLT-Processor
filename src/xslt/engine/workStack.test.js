/**
 * Tests for the explicit work stack of template instantiation: deep
 * recursion without JavaScript stack overflow and the template depth limit
 * (maxTemplateDepth, libxslt's xsltMaxDepth).
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { dom, parseXML, stylesheet } from "../harness.test.js";
import { XsltContext, XsltEngine, XSLT_MAX_TEMPLATE_DEPTH } from "../engine.js";
import { XSLTProcessor } from "../../XSLTProcessor.js";

/**
 * Compile a stylesheet and transform `<d/>` to a string.
 *
 * @param {string} xsl - A complete stylesheet
 * @param {object} [options] - Engine options
 * @param {string} [xml] - Source document markup
 * @returns {string} The result
 */
function run(xsl, options = {}, xml = "<d/>") {
  const engine = new XsltEngine(options);
  engine.importStylesheet(parseXML(xsl));
  return engine.transformToString(parseXML(xml));
}

/** Countdown through a recursive named template inside xsl:if. */
const callTemplate = (n) =>
  stylesheet(
    `<xsl:template match="/"><xsl:call-template name="r"><xsl:with-param name="n" select="${n}"/></xsl:call-template></xsl:template>
     <xsl:template name="r"><xsl:param name="n"/><xsl:if test="$n > 0"><xsl:call-template name="r"><xsl:with-param name="n" select="$n - 1"/></xsl:call-template></xsl:if><xsl:if test="$n = 0">done</xsl:if></xsl:template>`,
  );

/** Countdown through a recursive template rule, inside xsl:choose. */
const applyTemplates = (n) =>
  stylesheet(
    `<xsl:template match="/"><xsl:apply-templates select="*" mode="r"><xsl:with-param name="n" select="${n}"/></xsl:apply-templates></xsl:template>
     <xsl:template match="*" mode="r"><xsl:param name="n"/><xsl:choose><xsl:when test="$n > 0"><xsl:apply-templates select="." mode="r"><xsl:with-param name="n" select="$n - 1"/></xsl:apply-templates></xsl:when><xsl:otherwise>done</xsl:otherwise></xsl:choose></xsl:template>`,
  );

/** Sum 1..n, the recursive result captured in a variable each level. */
const sumInVariable = (n) =>
  stylesheet(
    `<xsl:template match="/"><xsl:call-template name="sum"><xsl:with-param name="n" select="${n}"/></xsl:call-template></xsl:template>
     <xsl:template name="sum"><xsl:param name="n"/><xsl:choose><xsl:when test="$n = 0">0</xsl:when><xsl:otherwise><xsl:variable name="rest"><xsl:call-template name="sum"><xsl:with-param name="n" select="$n - 1"/></xsl:call-template></xsl:variable><xsl:value-of select="$n + $rest"/></xsl:otherwise></xsl:choose></xsl:template>`,
  );

/**
 * A document of nested elements.
 *
 * @param {number} depth - Number of nested elements
 * @returns {string} The markup
 */
function nested(depth) {
  return `${"<e>".repeat(depth)}x${"</e>".repeat(depth)}`;
}

describe("deep template recursion", () => {
  it("defaults to libxslt's limit of 3000 nested templates", () => {
    assert.strictEqual(XSLT_MAX_TEMPLATE_DEPTH, 3000);
    assert.strictEqual(new XsltEngine().maxTemplateDepth, 3000);
  });

  it("runs 3000 nested call-template instantiations", () => {
    // The "/" rule plus 2999 invocations of r (n = 2998 .. 0)
    assert.strictEqual(run(callTemplate(2998)), "done");
  });

  it("runs 3000 nested apply-templates instantiations", () => {
    assert.strictEqual(run(applyTemplates(2998)), "done");
  });

  it("reports deeper recursion as a potential infinite recursion", () => {
    assert.throws(
      () => run(callTemplate(2999)),
      /Template recursion too deep: more than 3000 nested template invocations/,
    );
    assert.throws(
      () => run(applyTemplates(2999)),
      /Template recursion too deep: .*maxTemplateDepth/,
    );
  });

  it("reports infinite recursion", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><xsl:apply-templates select="." mode="loop"/></xsl:template>
       <xsl:template match="/" mode="loop"><x><xsl:apply-templates select="." mode="loop"/></x></xsl:template>`,
    );
    assert.throws(() => run(xsl), /Template recursion too deep/);
  });

  it("recurses as deep as maxTemplateDepth allows, without stack overflow", () => {
    const options = { maxTemplateDepth: 50000 };
    assert.strictEqual(run(callTemplate(40000), options), "done");
    assert.strictEqual(run(applyTemplates(40000), options), "done");
  });

  it("recurses through variables holding the recursive result", () => {
    assert.strictEqual(run(sumInVariable(2998)), String((2998 * 2999) / 2));
    assert.strictEqual(
      run(sumInVariable(20000), { maxTemplateDepth: 30000 }),
      String((20000 * 20001) / 2),
    );
  });

  it("applies a lower maxTemplateDepth", () => {
    assert.strictEqual(run(callTemplate(8), { maxTemplateDepth: 10 }), "done");
    assert.throws(
      () => run(callTemplate(9), { maxTemplateDepth: 10 }),
      /more than 10 nested template invocations/,
    );
  });

  it("counts the built-in template rules, as libxslt does", () => {
    const xsl = stylesheet(`<xsl:template match="text()">done</xsl:template>`);
    // The document node, the elements, and the text node's template rule
    assert.strictEqual(run(xsl, { maxTemplateDepth: 7 }, nested(5)), "done");
    assert.throws(
      () => run(xsl, { maxTemplateDepth: 6 }, nested(5)),
      /more than 6 nested/,
    );
    assert.strictEqual(
      run(xsl, { maxTemplateDepth: 5000 }, nested(4000)),
      "done",
    );
  });

  it("builds deep result trees", () => {
    const engine = new XsltEngine();
    engine.importStylesheet(
      parseXML(
        stylesheet(
          `<xsl:template match="*"><xsl:copy><xsl:apply-templates/></xsl:copy></xsl:template>`,
          "xml",
        ),
      ),
    );
    const fragment = engine.transform(
      parseXML(nested(2500)),
      dom.window.document,
    );
    let depth = 0;
    for (let node = fragment.firstChild; node.nodeType === 1;) {
      depth++;
      node = node.firstChild;
    }
    assert.strictEqual(depth, 2500);
  });

  it("keeps the engine usable after the limit was exceeded", () => {
    const engine = new XsltEngine({ maxTemplateDepth: 20 });
    engine.importStylesheet(parseXML(callTemplate(30)));
    assert.throws(() => engine.transformToString(parseXML("<d/>")));
    assert.strictEqual(engine.frames, null);

    engine.maxTemplateDepth = 40;
    assert.strictEqual(engine.transformToString(parseXML("<d/>")), "done");
    assert.strictEqual(engine.templateDepth, 0);
  });

  it("unwinds nested instantiations when an error escapes them", () => {
    // The recursion runs inside xsl:attribute, whose content is instantiated
    // at once, then fails deep down
    const xsl = stylesheet(
      `<xsl:template match="/"><o><xsl:attribute name="a"><xsl:call-template name="r"><xsl:with-param name="n" select="50"/></xsl:call-template></xsl:attribute></o></xsl:template>
       <xsl:template name="r"><xsl:param name="n"/><xsl:if test="$n = 0"><xsl:value-of select="$missing"/></xsl:if><xsl:if test="$n > 0"><xsl:call-template name="r"><xsl:with-param name="n" select="$n - 1"/></xsl:call-template></xsl:if></xsl:template>`,
      "xml",
    );
    const engine = new XsltEngine();
    engine.importStylesheet(parseXML(xsl));
    assert.throws(
      () => engine.transformToString(parseXML("<d/>")),
      /Undefined variable/,
    );
    assert.strictEqual(engine.frames, null);
  });

  it("keeps the order of output and of variable bindings", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><xsl:variable name="v"><xsl:for-each select="//i"><xsl:if test="position() > 1">,</xsl:if><xsl:value-of select="."/></xsl:for-each></xsl:variable>[<xsl:value-of select="$v"/>]<xsl:apply-templates select="//i"/></xsl:template>
       <xsl:template match="i"><xsl:choose><xsl:when test=". = 2">two</xsl:when><xsl:otherwise><xsl:value-of select="."/></xsl:otherwise></xsl:choose>;</xsl:template>`,
    );
    assert.strictEqual(
      run(xsl, {}, "<d><i>1</i><i>2</i><i>3</i></d>"),
      "[1,2,3]1;two;3;",
    );
  });

  it("passes maxTemplateDepth from XSLTProcessor to the engine", () => {
    const processor = new XSLTProcessor({ maxTemplateDepth: 10 });
    processor.importStylesheet(parseXML(callTemplate(20)));
    assert.strictEqual(processor.engine.maxTemplateDepth, 10);
    // Like the native processor, a failed transformation yields null
    const logged = [];
    const { error } = console;
    console.error = (...args) => logged.push(args);
    try {
      assert.strictEqual(processor.transformToDocument(parseXML("<d/>")), null);
    } finally {
      console.error = error;
    }
    assert.match(logged[0][1].message, /Template recursion too deep/);
    const defaults = new XSLTProcessor();
    defaults.importStylesheet(parseXML(callTemplate(20)));
    assert.strictEqual(defaults.engine.maxTemplateDepth, 3000);
  });

  it("instantiates at once when called outside a transformation", () => {
    const engine = new XsltEngine();
    engine.importStylesheet(
      parseXML(
        stylesheet(
          `<xsl:template match="i">[<xsl:value-of select="."/>]</xsl:template>`,
        ),
      ),
    );
    const source = parseXML("<i>1</i>");
    const output = dom.window.document.createDocumentFragment();
    const context = new XsltContext({
      currentNode: source,
      outputDocument: dom.window.document,
      xpathEvaluator: engine.xpathEvaluator,
    });
    // A single node, not a list
    engine.applyTemplates(source.documentElement, null, context, output);
    assert.strictEqual(output.textContent, "[1]");
    assert.strictEqual(engine.frames, null);
  });
});
