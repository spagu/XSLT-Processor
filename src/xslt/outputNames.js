/**
 * QName-valued attributes of `xsl:output` (XSLT 1.0 section 16).
 *
 * `cdata-section-elements` lists QNames that are expanded with the namespace
 * declarations in scope on the `xsl:output` element, the default namespace
 * included for unprefixed names (section 16.1). The serializer then compares
 * expanded names, so the prefixes used in the result do not matter.
 *
 * @module xslt/outputNames
 */

"use strict";

import { isQName } from "./qname.js";
import { splitQName } from "./resultNamespaces.js";
import { resolvePrefix } from "./stylesheetNamespaces.js";

/**
 * @typedef {{namespaceUri: (string|null), localName: string}} ExpandedName
 */

/**
 * Expand the QNames of a `cdata-section-elements` attribute and add them to
 * the names already declared (several xsl:output elements are merged, so the
 * lists are united). Invalid names and undeclared prefixes are reported and
 * skipped.
 *
 * @param {string} value - Whitespace separated QNames
 * @param {Object<string, string>} scope - Namespaces in scope on xsl:output
 * @param {ExpandedName[]} declared - Names declared by earlier xsl:output elements
 * @param {(message: string) => void} warn - Reports a name that is skipped
 * @returns {ExpandedName[]} The union, without duplicates
 *
 * @example
 * cdataSectionNames("p:c d", { p: "urn:p" }, [], console.warn);
 * // [{ namespaceUri: "urn:p", localName: "c" },
 * //  { namespaceUri: null, localName: "d" }]
 */
export function cdataSectionNames(value, scope, declared, warn) {
  const names = [...declared];
  const seen = new Set(names.map((n) => `{${n.namespaceUri}}${n.localName}`));

  for (const qname of value.split(/[ \t\r\n]+/).filter(Boolean)) {
    const { prefix, localName } = splitQName(qname);
    const namespaceUri = resolvePrefix(scope, prefix);
    if (!isQName(qname) || (prefix && !namespaceUri)) {
      warn(
        `xsl:output cdata-section-elements: "${qname}" is not a QName with a declared prefix and is ignored`,
      );
      continue;
    }
    const key = `{${namespaceUri}}${localName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    names.push({ namespaceUri, localName });
  }
  return names;
}
