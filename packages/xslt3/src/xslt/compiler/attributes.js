/**
 * The attributes each XSLT element may have (XSLT 3.0 section 3.5,
 * XTSE0090) and helpers to read them: required attributes (XTSE0010),
 * yes/no values (XTSE0020).
 *
 * @module @tradik/xslt3/xslt/compiler/attributes
 */

import { attr, XSL_NS, xsltError } from "../names.js";
import { checkAttributeValues } from "./attributeValues.js";
import { infoOf } from "./elementInfo.js";

/** Standard attributes, allowed on every XSLT element. */
const STANDARD = new Set([
  "version",
  "exclude-result-prefixes",
  "extension-element-prefixes",
  "xpath-default-namespace",
  "default-collation",
  "use-when",
  "default-mode",
  "default-validation",
  "expand-text",
]);

const SERIALIZATION =
  "allow-duplicate-names build-tree byte-order-mark cdata-section-elements " +
  "doctype-public doctype-system encoding escape-uri-attributes " +
  "html-version include-content-type indent item-separator json-node-output-method " +
  "media-type method normalization-form omit-xml-declaration parameter-document " +
  "standalone suppress-indentation undeclare-prefixes use-character-maps";

/** Attributes by element local name. */
const ALLOWED = {
  "analyze-string": "select regex flags",
  "apply-imports": "",
  "apply-templates": "select mode",
  attribute: "name namespace select separator type validation",
  "attribute-set": "name use-attribute-sets visibility streamable",
  "call-template": "name",
  "character-map": "name use-character-maps",
  choose: "",
  comment: "select",
  copy: "select copy-namespaces inherit-namespaces use-attribute-sets type validation",
  "copy-of": "select copy-accumulators copy-namespaces type validation",
  "decimal-format":
    "name decimal-separator grouping-separator infinity minus-sign exponent-separator NaN percent per-mille zero-digit digit pattern-separator",
  document: "validation type",
  element:
    "name namespace inherit-namespaces use-attribute-sets type validation",
  fallback: "",
  "for-each": "select",
  "for-each-group":
    "select group-by group-adjacent group-starting-with group-ending-with composite collation",
  function:
    "name as visibility streamability override-extension-function override new-each-time cache",
  if: "test",
  import: "href",
  "import-schema": "namespace schema-location",
  include: "href",
  key: "name match use composite collation",
  "matching-substring": "",
  map: "",
  "map-entry": "key select",
  try: "select rollback-output",
  catch: "errors select",
  "context-item": "as use",
  "global-context-item": "as use use-accumulators",
  message: "select terminate error-code",
  "namespace-alias": "stylesheet-prefix result-prefix",
  namespace: "name select",
  "next-match": "",
  "non-matching-substring": "",
  number:
    "value select level count from format lang letter-value ordinal start-at grouping-separator grouping-size",
  otherwise: "",
  output: `name ${SERIALIZATION}`,
  "output-character": "character string",
  param: "name select as required tunnel static",
  "perform-sort": "select",
  "preserve-space": "elements",
  "processing-instruction": "name select",
  "result-document": `format href type validation output-version ${SERIALIZATION}`,
  sequence: "select",
  sort: "select lang order collation stable case-order data-type",
  "strip-space": "elements",
  stylesheet: "id input-type-annotations",
  template: "match name priority mode as visibility",
  text: "disable-output-escaping",
  transform: "id input-type-annotations",
  "value-of": "select separator disable-output-escaping",
  variable: "name select as visibility static",
  when: "test",
  "with-param": "name select as tunnel",
  // XSLT 3.0 instructions of task 0031
  break: "select",
  iterate: "select",
  "next-iteration": "",
  "on-completion": "select",
  "on-empty": "select",
  "on-non-empty": "select",
  "where-populated": "",
  fork: "",
  accumulator: "name initial-value as streamable",
  "accumulator-rule": "match phase select",
  "source-document": "href streamable use-accumulators validation type",
  assert: "test select error-code",
  evaluate:
    "xpath as base-uri with-params context-item namespace-context schema-aware",
  merge: "",
  "merge-action": "",
  "merge-key": "select lang order collation case-order data-type",
  "merge-source":
    "name for-each-item for-each-source select streamable use-accumulators sort-before-merge validation type",
  package: "id name package-version input-type-annotations declared-modes",
  "use-package": "name package-version",
  expose: "component names visibility",
  accept: "component names visibility",
  override: "",
  mode: "name streamable use-accumulators on-no-match on-multiple-match warning-on-no-match warning-on-multiple-match typed visibility",
};

/** @type {Map<string, Set<string>>} */
const allowedSets = new Map(
  Object.entries(ALLOWED).map(([name, list]) => [
    name,
    new Set(list.split(" ").filter(Boolean)),
  ]),
);

/**
 * Checks the attributes of an XSLT element (unknown attributes are
 * ignored in forwards-compatible mode).
 * @param {Element} element
 * @param {object} [_cx] - Stylesheet compiler (unused)
 * @throws {import("../../errors.js").XPathError} XTSE0090
 */
export function checkAttributes(element, _cx) {
  const allowed = allowedSets.get(element.localName);
  if (!allowed) return;
  const forwards = infoOf(element).version > 3;
  for (const attribute of element.attributes) {
    const uri = attribute.namespaceURI;
    const written = attribute.localName ?? attribute.name;
    // a shadow attribute _name stands for the attribute name
    const name = written.startsWith("_") ? written.slice(1) : written;
    if (uri === XSL_NS) {
      throw xsltError(
        "XTSE0090",
        `xsl:${element.localName} cannot have the attribute ${attribute.name}`,
      );
    }
    if (uri || attribute.name.startsWith("xmlns")) continue;
    if (allowed.has(name) || STANDARD.has(name) || forwards) continue;
    throw xsltError(
      "XTSE0090",
      `xsl:${element.localName} cannot have the attribute ${name}`,
    );
  }
  if (!forwards) checkAttributeValues(element);
}

/**
 * Checks that an element that must be empty is.
 * @param {Element} element
 * @param {{children: (element: Element) => Array}} cx
 * @throws {import("../../errors.js").XPathError} XTSE0260
 */
export function checkEmpty(element, cx) {
  if (cx.children(element).length > 0) {
    throw xsltError("XTSE0260", `xsl:${element.localName} must be empty`);
  }
}

/**
 * A required attribute.
 * @param {Element} element
 * @param {string} name
 * @returns {string}
 * @throws {import("../../errors.js").XPathError} XTSE0010 when absent
 */
export function required(element, name) {
  const value = attr(element, name);
  if (value === undefined) {
    throw xsltError(
      "XTSE0010",
      `xsl:${element.localName} requires the attribute ${name}`,
    );
  }
  return value;
}

/**
 * A yes/no attribute (also true/false/1/0 in XSLT 3.0).
 * @param {Element} element
 * @param {string} name
 * @param {boolean} fallback - Value when absent
 * @returns {boolean}
 * @throws {import("../../errors.js").XPathError} XTSE0020 for other values
 */
export function yesNo(element, name, fallback) {
  const value = attr(element, name);
  if (value === undefined) return fallback;
  const text = value.trim();
  if (["yes", "true", "1"].includes(text)) return true;
  if (["no", "false", "0"].includes(text)) return false;
  throw xsltError(
    "XTSE0020",
    `Invalid value "${value}" for ${name} on xsl:${element.localName}`,
  );
}
