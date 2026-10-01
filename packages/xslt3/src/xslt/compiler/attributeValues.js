/**
 * The values of the enumerated attributes of XSLT elements (XSLT 3.0
 * section 3.5, XTSE0020): yes/no attributes (also true/false/1/0, with
 * whitespace trimmed) and attributes with a fixed list of values;
 * validation="strict" needs a schema-aware processor
 * (XTSE1660).
 *
 * @module @tradik/xslt3/xslt/compiler/attributeValues
 */

import { attr, xsltError } from "../names.js";

const BOOLEAN = ["yes", "no", "true", "false", "1", "0"];
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
const INTEGERS = /^[+-]?\d+(\s+[+-]?\d+)*$/;
const VALIDATION = ["strict", "lax", "preserve", "strip"];

/** Allowed values by element local name and attribute name. */
const VALUES = {
  "attribute-set": { streamable: BOOLEAN },
  attribute: { validation: VALIDATION },
  copy: {
    "copy-namespaces": BOOLEAN,
    "inherit-namespaces": BOOLEAN,
    validation: VALIDATION,
  },
  "copy-of": {
    "copy-accumulators": BOOLEAN,
    "copy-namespaces": BOOLEAN,
    validation: VALIDATION,
  },
  document: { validation: VALIDATION },
  element: { "inherit-namespaces": BOOLEAN, validation: VALIDATION },
  "for-each-group": { composite: BOOLEAN },
  number: { "start-at": INTEGERS },
  output: { "html-version": DECIMAL },
  "result-document": { "html-version": DECIMAL },
  sort: { stable: BOOLEAN },
  function: {
    override: BOOLEAN,
    "override-extension-function": BOOLEAN,
    "new-each-time": [...BOOLEAN, "maybe"],
    cache: BOOLEAN,
  },
  key: { composite: BOOLEAN },
  mode: {
    streamable: BOOLEAN,
    typed: [...BOOLEAN, "strict", "lax", "unspecified"],
    "warning-on-no-match": BOOLEAN,
    "warning-on-multiple-match": BOOLEAN,
    "on-multiple-match": ["use-last", "fail"],
  },
  package: { "declared-modes": BOOLEAN },
  param: { required: BOOLEAN, tunnel: BOOLEAN, static: BOOLEAN },
  stylesheet: {
    "input-type-annotations": ["preserve", "strip", "unspecified"],
  },
  text: { "disable-output-escaping": BOOLEAN },
  try: { "rollback-output": BOOLEAN },
  "value-of": { "disable-output-escaping": BOOLEAN },
  variable: { static: BOOLEAN },
  "with-param": { tunnel: BOOLEAN },
};
VALUES.transform = VALUES.stylesheet;

/** Elements whose children are top-level declarations. */
const TOP_LEVEL = new Set(["stylesheet", "transform", "package"]);

/**
 * Constraints that depend on where an element is or on another
 * attribute: static only on global variables and parameters, function
 * parameters neither tunnel nor optional, consistent override flags of
 * xsl:function.
 * @param {Element} element
 */
function checkPlacement(element) {
  const yes = (name) =>
    ["yes", "true", "1"].includes(attr(element, name)?.trim());
  const parent = element.parentNode;
  const local = element.localName;
  const fail = (message) => {
    throw xsltError("XTSE0020", message);
  };
  if (yes("static") && !TOP_LEVEL.has(parent?.localName)) {
    fail(`A local xsl:${local} cannot be static`);
  }
  if (
    yes("static") &&
    !["private", undefined].includes(attr(element, "visibility")?.trim())
  ) {
    fail("A static variable is private");
  }
  if (local === "param" && parent?.localName === "function") {
    if (yes("tunnel")) {
      fail("A function parameter cannot be a tunnel parameter");
    }
    if (attr(element, "required") !== undefined && !yes("required")) {
      fail("A function parameter is always required");
    }
  }
  const override = attr(element, "override");
  const extension = attr(element, "override-extension-function");
  if (
    override !== undefined &&
    extension !== undefined &&
    yes("override") !== yes("override-extension-function")
  ) {
    fail("override and override-extension-function differ");
  }
}

/**
 * XTSE1660: what only a schema-aware processor accepts: a type
 * attribute, strict validation, typed modes.
 * @param {Element} element
 */
function checkSchemaAware(element) {
  const defaultValidation = attr(element, "default-validation")?.trim();
  if (defaultValidation === "strict") {
    throw xsltError("XTSE1660", "default-validation=strict needs a schema");
  }
  if (
    defaultValidation !== undefined &&
    defaultValidation !== "preserve" &&
    defaultValidation !== "strip"
  ) {
    throw xsltError(
      "XTSE0020",
      `Invalid default-validation ${defaultValidation}`,
    );
  }
  if (
    VALUES[element.localName]?.validation &&
    attr(element, "type") !== undefined
  ) {
    throw xsltError("XTSE1660", "The type attribute needs a schema");
  }
  if (
    element.localName === "mode" &&
    ["yes", "true", "1", "strict"].includes(attr(element, "typed")?.trim())
  ) {
    throw xsltError("XTSE1660", "A typed mode needs a schema");
  }
}

/**
 * Checks the enumerated attributes of an XSLT element.
 * @param {Element} element
 * @throws {import("../../errors.js").XPathError} XTSE0020 for a value
 *   not allowed, XTSE1660 for validation that needs a schema
 */
export function checkAttributeValues(element) {
  const table = VALUES[element.localName];
  for (const [name, allowed] of Object.entries(table ?? {})) {
    const value = attr(element, name)?.trim();
    // attribute value templates are checked when evaluated
    if (value === undefined || value.includes("{")) continue;
    const ok = Array.isArray(allowed)
      ? allowed.includes(value)
      : allowed.test(value);
    if (!ok) {
      throw xsltError(
        "XTSE0020",
        `Invalid value "${value}" for ${name} on xsl:${element.localName}`,
      );
    }
    // XSLT 3.0: lax validation without a schema is allowed
    if (name === "validation" && value === "strict") {
      throw xsltError("XTSE1660", `validation="${value}" needs a schema`);
    }
  }
  checkPlacement(element);
  checkSchemaAware(element);
}
