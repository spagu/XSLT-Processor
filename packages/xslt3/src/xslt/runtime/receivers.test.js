import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkBodies, parse, run, stylesheet } from "../testing.test.js";
import { stripDocument } from "./strip.js";

const options = { attributes: 'expand-text="yes"' };

describe("document nodes in content", () => {
  it("contribute their children", () => {
    checkBodies(
      [
        [
          '<out><xsl:document>a<b/><xsl:comment>c</xsl:comment><xsl:processing-instruction name="p">x</xsl:processing-instruction><xsl:sequence select="1, 2"/><xsl:document>d</xsl:document><xsl:sequence select="3, doc"/></xsl:document></out>',
          "<out>a<b/><!--c--><?p x?>1 2d3<doc/></out>",
        ],
        [
          '<out><xsl:document><xsl:namespace name="p">urn:p</xsl:namespace></xsl:document></out>',
          "XTDE0420",
        ],
        [
          '<out><xsl:document><xsl:sequence select="map{}"/></xsl:document></out>',
          "XTDE0450",
        ],
      ],
      options,
    );
  });
});

describe("sequences of new nodes", () => {
  it("hold parentless nodes", () => {
    checkBodies(
      [
        [
          '<xsl:variable name="v" as="node()*"><xsl:comment>c</xsl:comment><xsl:processing-instruction name="p">d</xsl:processing-instruction><xsl:namespace name="n">urn:n</xsl:namespace><xsl:attribute name="a" namespace="urn:a">1</xsl:attribute><xsl:document><d/></xsl:document></xsl:variable>' +
            "<out>{$v ! (node-name(.) ! string(), '-')[1]}|{$v[4] ! namespace-uri()}</out>",
          "<out>- p n ns0:a -|urn:a</out>",
        ],
        [
          '<xsl:variable name="v" as="node()*"><xsl:copy-of select="/doc, doc/@x, doc/text(), doc/comment(), doc/processing-instruction()"/></xsl:variable><out>{count($v)}{$v[1]/@x}</out>',
          "<out>51</out>",
          '<doc x="1">t<!--c--><?p d?></doc>',
        ],
      ],
      options,
    );
  });
});

describe("namespaces of constructed elements", () => {
  it("reuse a prefix in scope and copy namespace nodes", () => {
    checkBodies(
      [
        [
          '<out xmlns:q="urn:q"><xsl:attribute name="a" namespace="urn:q">1</xsl:attribute></out>',
          '<out xmlns:q="urn:q" q:a="1"/>',
        ],
        [
          '<out><xsl:copy-of select="doc/namespace::p"/></out>',
          '<out xmlns:p="urn:p"/>',
          '<doc xmlns:p="urn:p"/>',
        ],
        [
          '<out xmlns:p="urn:1"><xsl:attribute name="p:a" namespace="urn:2"/><xsl:attribute name="p:b" namespace="urn:3"/></out>',
          '<out xmlns:p="urn:1" xmlns:p_1="urn:2" p_1:a="" xmlns:p_2="urn:3" p_2:b=""/>',
        ],
      ],
      options,
    );
  });
});

describe("whitespace stripping of sources", () => {
  it("copies the document URI, or keeps the document without rules", () => {
    const document = parse("<doc> <a/> </doc>");
    document.documentURI = "file:///d.xml";
    const rules = [{ strip: true, uri: null, local: null }];
    const stripped = stripDocument(document, rules);
    assert.equal(stripped.documentURI, "file:///d.xml");
    assert.equal(stripped.documentElement.childNodes.length, 1);
    assert.equal(stripDocument(document, []), document);
    const frozen = parse("<doc/>");
    frozen.documentURI = "file:///f.xml";
    const { implementation } = frozen;
    frozen.implementation = {
      createDocument: (...args) => {
        const copy = implementation.createDocument(...args);
        Object.defineProperty(copy, "documentURI", {
          get: () => undefined,
          set: () => {
            throw new Error("read-only");
          },
        });
        return copy;
      },
    };
    assert.equal(stripDocument(frozen, rules).documentURI, undefined);
  });

  it("strips documents loaded by doc()", () => {
    const loaded = parse("<x> <y/> </x>");
    assert.equal(
      run(
        stylesheet(
          '<xsl:strip-space elements="*"/><xsl:template match="/"><out>{count(doc(\'l.xml\')//text())}</out></xsl:template>',
          options,
        ),
        "<doc/>",
        { documentLoader: () => loaded },
      ),
      "<out>0</out>",
    );
  });
});
