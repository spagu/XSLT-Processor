import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkBodies } from "../testing.test.js";
import { originalNode } from "./copyOrigins.js";

const options = {
  attributes: 'expand-text="yes"',
  xml: '<doc xmlns:p="urn:p" a="1"><s b="2"><t>x</t></s></doc>',
};

describe("fn:snapshot", () => {
  it("copies the ancestors of a node with their attributes", () => {
    checkBodies(
      [
        [
          '<xsl:variable name="v" select="snapshot(/doc/s/t)"/><out>{name($v/..)} {$v/../@b} {$v/../../@a} {count($v/../../*)} {exists(root($v)/self::document-node())} {$v}</out>',
          "<out>s 2 1 1 true x</out>",
        ],
        [
          '<xsl:variable name="v" select="snapshot(/doc/s/@b)"/><out>{name($v)} {name($v/..)} {count($v/../..)}</out>',
          "<out>b s 1</out>",
        ],
        [
          '<xsl:variable name="v" select="snapshot(/doc/namespace::p)"/><out>{local-name($v)} {string($v)} {name($v/..)}</out>',
          "<out>p urn:p doc</out>",
        ],
        [
          '<xsl:variable name="v" select="snapshot((/, 3))"/><out>{count($v)} {name($v[1]/*)} {$v[2]}</out>',
          "<out>2 doc 3</out>",
        ],
        [
          '<xsl:for-each select="/doc/s/t"><out>{name(snapshot()/..)}</out></xsl:for-each>',
          "<out>s</out>",
        ],
      ],
      options,
    );
  });

  it("keeps the accumulator values of the originals", () => {
    checkBodies(
      [
        [
          "<xsl:variable name=\"v\" select=\"snapshot(/doc/s/t)\"/><out>{$v/accumulator-before('n')} {$v/../accumulator-before('n')}</out>",
          "<out>3 2</out>",
        ],
      ],
      {
        ...options,
        declarations:
          '<xsl:mode use-accumulators="n"/><xsl:accumulator name="n" initial-value="0"><xsl:accumulator-rule match="*" select="$value + 1"/></xsl:accumulator>',
      },
    );
  });
});

describe("originalNode", () => {
  it("maps the nodes of a copy to the original", () => {
    const original = { childNodes: [{}, { name: "second" }] };
    const copy = { nodeType: 1, parentNode: null, childNodes: [] };
    const child = { nodeType: 1, parentNode: copy };
    copy.childNodes.push({}, child);
    const origins = new WeakMap([[copy, original]]);
    assert.equal(originalNode(origins, child).name, "second");
    assert.equal(originalNode(new WeakMap(), child), null);
  });
});
