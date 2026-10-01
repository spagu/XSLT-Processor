/**
 * Unit tests of dependency filtering and the XML helpers.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { TextEncoder } from "node:util";
import {
  CODEPOINT_COLLATION,
  applicability,
  createConfig,
  effectiveDependencies,
  environmentProblem,
  hasDependency,
  specTokenSupported,
} from "./dependencies.mjs";
import {
  attr,
  attributes,
  boolAttr,
  childElements,
  decodeXml,
  parseXml,
} from "./xmlUtil.mjs";

const dep = (type, value, satisfied = true) => ({ type, value, satisfied });
const env = (overrides = {}) => ({
  sources: [],
  collections: [],
  collations: [],
  ...overrides,
});

describe("spec dependencies", () => {
  const qt3 = createConfig("qt3").specs;
  const xslt = createConfig("xslt30").specs;

  it("matches exact and open-ended versions per family", () => {
    assert.equal(specTokenSupported("XP31", qt3), true);
    assert.equal(specTokenSupported("XP30+", qt3), true);
    assert.equal(specTokenSupported("XP20+", qt3), true);
    assert.equal(specTokenSupported("XP20", qt3), false);
    assert.equal(specTokenSupported("XT30+", qt3), true);
    assert.equal(specTokenSupported("XQ31+", qt3), false);
    assert.equal(specTokenSupported("XSLT30+", xslt), true);
    assert.equal(specTokenSupported("XSLT10+", xslt), true);
    assert.equal(specTokenSupported("XSLT20", xslt), false);
    assert.equal(specTokenSupported("bogus", xslt), false);
  });

  it("accepts a list when any token matches", () => {
    const config = createConfig("qt3");
    assert.equal(hasDependency(dep("spec", "XQ10+ XP20+"), config), true);
    assert.equal(hasDependency(dep("spec", "XQ10+"), config), false);
    assert.equal(hasDependency(dep("spec", "XQ10 XP20"), config), false);
  });
});

describe("other dependencies", () => {
  it("checks features against the configuration", () => {
    const config = createConfig("qt3");
    assert.equal(
      hasDependency(dep("feature", "higherOrderFunctions"), config),
      true,
    );
    assert.equal(hasDependency(dep("feature", "schemaImport"), config), false);
    assert.equal(hasDependency(dep("feature", "unheard-of"), config), false);
    assert.equal(
      hasDependency(dep("feature", "xpath-1.0-compatibility"), config),
      false,
    );
    const compat = createConfig("qt3", {
      xpath10Compatibility: true,
      features: { serialization: true },
    });
    assert.equal(
      hasDependency(dep("feature", "xpath-1.0-compatibility"), compat),
      true,
    );
    assert.equal(hasDependency(dep("feature", "serialization"), compat), true);
    const xslt = createConfig("xslt30");
    assert.equal(hasDependency(dep("feature", "streaming"), xslt), false);
    assert.equal(
      hasDependency(dep("feature", "higher_order_functions"), xslt),
      true,
    );
    assert.equal(
      hasDependency(dep("feature", "backwards_compatibility"), xslt),
      false,
    );
  });

  it("checks versions, languages and other values", () => {
    const config = createConfig("qt3");
    assert.equal(hasDependency(dep("xml-version", "1.0"), config), true);
    assert.equal(hasDependency(dep("xml-version", "1.1"), config), false);
    assert.equal(hasDependency(dep("xml-version", "1.0:5+ 1.1"), config), true);
    assert.equal(hasDependency(dep("xml-version", "1.0:4-"), config), false);
    assert.equal(hasDependency(dep("xsd-version", "1.1"), config), true);
    assert.equal(hasDependency(dep("xsd-version", "1.0"), config), false);
    assert.equal(hasDependency(dep("language", "en"), config), true);
    assert.equal(hasDependency(dep("language", "de"), config), false);
    assert.equal(hasDependency(dep("default-language", "en"), config), true);
    assert.equal(
      hasDependency(dep("unicode-normalization-form", "NFKD"), config),
      true,
    );
    assert.equal(
      hasDependency(
        dep("unicode-normalization-form", "FULLY-NORMALIZED"),
        config,
      ),
      false,
    );
    assert.equal(
      hasDependency(dep("format-integer-sequence", "①"), config),
      false,
    );
    assert.equal(hasDependency(dep("unicode-version", "9.0"), config), false);
    assert.equal(hasDependency(dep("calendar", "CB"), config), false);
    assert.equal(
      hasDependency(
        dep("additional_normalization_form", "support NFD"),
        config,
      ),
      true,
    );
    assert.equal(hasDependency(dep("sweep_and_posture", "x"), config), false);
  });
});

describe("applicability", () => {
  const config = createConfig("qt3");

  it("lets a test case's spec dependency replace the test set's", () => {
    const set = [dep("spec", "XQ31+"), dep("feature", "higherOrderFunctions")];
    assert.deepEqual(effectiveDependencies(set, [dep("spec", "XP31+ XQ31+")]), [
      dep("feature", "higherOrderFunctions"),
      dep("spec", "XP31+ XQ31+"),
    ]);
    assert.deepEqual(effectiveDependencies(set, []), set);
  });

  it("applies satisfied=false as a negation", () => {
    const testCase = {
      dependencies: [dep("feature", "schemaImport", false)],
      environment: null,
    };
    assert.deepEqual(applicability(testCase, [dep("spec", "XP30+")], config), {
      applicable: true,
      reason: "",
    });
    const negated = {
      dependencies: [dep("feature", "higherOrderFunctions", false)],
      environment: null,
    };
    assert.deepEqual(applicability(negated, [], config), {
      applicable: false,
      reason: "not feature higherOrderFunctions",
    });
    const xquery = { dependencies: [dep("spec", "XQ10+")], environment: null };
    assert.deepEqual(applicability(xquery, [], config), {
      applicable: false,
      reason: "spec XQ10+",
    });
  });

  it("rejects schema validated documents and non-codepoint collations", () => {
    assert.equal(environmentProblem(null, config), "");
    assert.equal(environmentProblem(env(), config), "");
    assert.equal(
      environmentProblem(env({ sources: [{ validation: "strict" }] }), config),
      "schema validation (strict)",
    );
    assert.equal(
      environmentProblem(
        env({ collections: [{ sources: [{ validation: "lax" }] }] }),
        config,
      ),
      "schema validation (lax)",
    );
    assert.equal(
      environmentProblem(env({ sources: [{ validation: "skip" }] }), config),
      "",
    );
    assert.equal(
      environmentProblem(
        env({ collations: [{ uri: CODEPOINT_COLLATION }] }),
        config,
      ),
      "",
    );
    assert.equal(
      environmentProblem(
        env({ collations: [{ uri: "http://x/caseblind" }] }),
        config,
      ),
      "collation http://x/caseblind",
    );
    const testCase = {
      dependencies: [],
      environment: env({ collations: [{ uri: "u" }] }),
    };
    assert.deepEqual(applicability(testCase, [], config), {
      applicable: false,
      reason: "collation u",
    });
  });
});

describe("xml helpers", () => {
  const latin = (text) => Uint8Array.from(Buffer.from(text, "latin1"));

  it("decodes by byte order mark and declared encoding", () => {
    assert.equal(decodeXml(Uint8Array.from([0xfe, 0xff, 0, 0x61])), "a");
    assert.equal(decodeXml(Uint8Array.from([0xff, 0xfe, 0x61, 0])), "a");
    assert.equal(
      decodeXml(latin('<?xml version="1.0" encoding="iso-8859-1"?><a>é</a>')),
      '<?xml version="1.0" encoding="iso-8859-1"?><a>é</a>',
    );
    assert.equal(
      decodeXml(latin('<?xml version="1.0" encoding="foo"?><a/>')),
      '<?xml version="1.0" encoding="foo"?><a/>',
    );
    assert.equal(decodeXml(new TextEncoder().encode("<a>€</a>")), "<a>€</a>");
  });

  it("parses, reads children and attributes, and rejects malformed XML", () => {
    const root = parseXml(
      '<r a="1" b="yes"><x/>text<y/><x/></r>',
    ).documentElement;
    assert.equal(childElements(root).length, 3);
    assert.equal(childElements(root, "x").length, 2);
    assert.equal(attr(root, "a"), "1");
    assert.equal(attr(root, "z"), undefined);
    assert.equal(boolAttr(root, "b"), true);
    assert.equal(boolAttr(root, "a"), true);
    assert.equal(boolAttr(root, "z", true), true);
    assert.deepEqual(attributes(root), { a: "1", b: "yes" });
    assert.throws(() => parseXml("<r>", "bad.xml"), /bad\.xml/);
  });
});
