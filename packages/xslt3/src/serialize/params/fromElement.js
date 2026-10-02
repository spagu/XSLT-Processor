/**
 * Serialization parameters given as an `output:serialization-parameters`
 * element (Serialization 3.1 section 3.1), as fn:serialize accepts them.
 *
 * Errors: XPTY0004 when the element is not output:serialization-parameters,
 * SEPM0017 for an invalid element (unknown output:* parameter, element in
 * no namespace, unknown attribute, invalid value), SEPM0018 for a
 * character mapped twice, SEPM0019 for a parameter given twice. Elements
 * in other namespaces are extension parameters, ignored.
 *
 * @module @tradik/xslt3/serialize/params/fromElement
 */

import { compareCodepoints } from "../../xdm/strings.js";
import { XPathError } from "../../errors.js";
import { isNamespaceDeclaration } from "../../xpath/eval/domNodes.js";
import { inScopeNamespaces } from "../../xpath/eval/namespaceNodes.js";
import { OUTPUT_NAMESPACE, PARAMETER_KINDS } from "./names.js";
import { clarkName, CONVERTERS } from "./values.js";

/**
 * @param {string} message
 * @returns {XPathError} SEPM0017
 */
const invalid = (message) => new XPathError("SEPM0017", message);

/**
 * @param {Element} element
 * @returns {string[]} local names of its attributes in no namespace
 */
function plainAttributes(element) {
  const names = [];
  for (const attribute of element.attributes) {
    if (!isNamespaceDeclaration(attribute) && !attribute.namespaceURI) {
      names.push(attribute.localName ?? attribute.name);
    }
  }
  return names;
}

/**
 * @param {Element} element
 * @returns {Element[]} its element children
 */
function elementChildren(element) {
  const children = [];
  for (let child = element.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1) children.push(child);
  }
  return children;
}

/**
 * Reads the character map of output:use-character-maps.
 * @param {Element} element
 * @returns {Map<string, string>}
 */
function characterMap(element) {
  const map = new Map();
  for (const child of elementChildren(element)) {
    const attributes = plainAttributes(child).sort(compareCodepoints).join(" ");
    if (
      child.namespaceURI !== OUTPUT_NAMESPACE ||
      child.localName !== "character-map" ||
      attributes !== "character map-string"
    ) {
      throw invalid("Invalid content of output:use-character-maps");
    }
    const character = child.getAttribute("character");
    if ([...character].length !== 1) {
      throw invalid(`Not a single character: ${character}`);
    }
    if (map.has(character)) {
      throw new XPathError("SEPM0018", `Character ${character} mapped twice`);
    }
    map.set(character, child.getAttribute("map-string"));
  }
  return map;
}

/**
 * Reads one parameter element.
 * @param {Element} element - output:* parameter element
 * @param {string} name - Its local name
 * @returns {*} the converted value
 */
function parameterValue(element, name) {
  const attributes = plainAttributes(element);
  if (name === "use-character-maps") {
    if (attributes.length) throw invalid(`Attributes on output:${name}`);
    return characterMap(element);
  }
  if (attributes.join(" ") !== "value") {
    throw invalid(`output:${name} needs exactly a value attribute`);
  }
  const value = element.getAttribute("value");
  const bindings = inScopeNamespaces(element);
  const resolve = (prefix) => bindings.get(prefix);
  try {
    return CONVERTERS[PARAMETER_KINDS[name]](name, value, resolve);
  } catch (error) {
    throw invalid(error.message);
  }
}

/**
 * Reads serialization parameters from an element.
 * @param {Element} element - An output:serialization-parameters element
 * @returns {Record<string, *>} parameters by hyphenated name
 */
export function parametersFromElement(element) {
  if (
    element.nodeType !== 1 ||
    element.namespaceURI !== OUTPUT_NAMESPACE ||
    element.localName !== "serialization-parameters"
  ) {
    throw new XPathError(
      "XPTY0004",
      "Serialization parameters must be an output:serialization-parameters element",
    );
  }
  if (plainAttributes(element).length) {
    throw invalid("Attributes on output:serialization-parameters");
  }
  const params = {};
  const seen = new Set();
  for (const child of elementChildren(element)) {
    const namespace = child.namespaceURI ?? "";
    const local = child.localName;
    const key = clarkName(namespace, local);
    if (seen.has(key)) {
      throw new XPathError("SEPM0019", `Parameter ${local} given twice`);
    }
    seen.add(key);
    if (namespace === "") throw invalid(`Parameter ${local} in no namespace`);
    if (namespace !== OUTPUT_NAMESPACE) continue;
    if (!PARAMETER_KINDS[local]) throw invalid(`Unknown parameter ${local}`);
    params[local] = parameterValue(child, local);
  }
  return params;
}
