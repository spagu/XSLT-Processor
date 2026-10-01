/**
 * Other declarations: xsl:strip-space and xsl:preserve-space (XSLT 3.0
 * section 4.3), xsl:namespace-alias (11.1.3) and xsl:key (20.2.1);
 * xsl:mode is in modeDecl.js.
 *
 * @module @tradik/xslt3/xslt/compiler/miscDecl
 */

import { compileBody } from "./body.js";
import { getCollation } from "../../functions/collations.js";
import { resolveUri } from "../../xpath/eval/uris.js";
import { required, yesNo } from "./attributes.js";
import { infoOf } from "./elementInfo.js";
import { attr, clarkOf, tokens, xsltError } from "../names.js";
import { compilePattern } from "../patterns/compile.js";

/**
 * A name test of xsl:strip-space or xsl:preserve-space: `*`, `prefix:*`,
 * `*:local` or a QName (in the xpath-default-namespace when unprefixed).
 * @param {string} token
 * @param {Element} element
 * @param {object} cx
 * @returns {{uri: string|null, local: string|null, priority: number}}
 */
function nameTest(token, element, cx) {
  if (token === "*") return { uri: null, local: null, priority: -0.5 };
  if (token.startsWith("*:")) {
    return { uri: null, local: token.slice(2), priority: -0.25 };
  }
  const eqWildcard = /^Q\{([^}]*)\}\*$/.exec(token);
  if (eqWildcard) return { uri: eqWildcard[1], local: null, priority: -0.25 };
  if (token.endsWith(":*")) {
    const prefix = token.slice(0, -2);
    const uri = infoOf(element).namespaces.get(prefix);
    if (uri === undefined) {
      throw xsltError("XTSE0280", `Undeclared prefix ${prefix}`);
    }
    return { uri, local: null, priority: -0.25 };
  }
  const name = cx.exprs.qname(token, element);
  const uri = name.uri || infoOf(element).xpathDefaultNs;
  return { uri, local: name.local, priority: 0 };
}

/**
 * Compiles the whitespace stripping rules.
 * @param {object[]} declarations - xsl:strip-space and xsl:preserve-space
 * @param {object} cx
 * @returns {object[]} rules `{strip, uri, local, priority, precedence,
 *   position}` (uri or local null for wildcards), best first
 */
export function compileSpaceRules(declarations, cx) {
  const rules = [];
  declarations.forEach(({ element, precedence }, position) => {
    const strip = element.localName === "strip-space";
    for (const token of tokens(required(element, "elements"))) {
      const test = nameTest(token, element, cx);
      rules.push({ strip, ...test, precedence, position });
    }
  });
  const seen = new Map();
  for (const rule of rules) {
    const key = `${rule.precedence}|${rule.uri}|${rule.local}`;
    if (seen.has(key) && seen.get(key) !== rule.strip) {
      throw xsltError(
        "XTSE0270",
        "The same name is in xsl:strip-space and xsl:preserve-space",
      );
    }
    seen.set(key, rule.strip);
  }
  rules.sort(
    (a, b) =>
      b.precedence - a.precedence ||
      b.priority - a.priority ||
      b.position - a.position,
  );
  return rules;
}

/**
 * Collects the namespace aliases.
 * @param {object[]} declarations
 * @returns {Map<string, {uri: string, prefix: string}>} result namespace
 *   and prefix by stylesheet namespace URI
 */
export function collectAliases(declarations) {
  const aliases = new Map();
  const from = new Map();
  for (const { element, precedence } of declarations) {
    const namespaces = infoOf(element).namespaces;
    const lookup = (name) => {
      const prefix = required(element, name).trim();
      const key = prefix === "#default" ? "" : prefix;
      const uri = namespaces.get(key);
      if (uri === undefined && key !== "") {
        throw xsltError("XTSE0812", `Undeclared prefix ${prefix}`);
      }
      return { prefix: key, uri: uri ?? "" };
    };
    const source = lookup("stylesheet-prefix");
    const result = lookup("result-prefix");
    const previous = aliases.get(source.uri);
    if (
      previous &&
      from.get(source.uri) === precedence &&
      previous.uri !== result.uri
    ) {
      throw xsltError("XTSE0810", "Conflicting namespace aliases");
    }
    if (!previous || from.get(source.uri) <= precedence) {
      aliases.set(source.uri, result);
      from.set(source.uri, precedence);
    }
  }
  return aliases;
}

/**
 * XTSE1210: the collation of a key must be known.
 * @param {string} uri - The collation attribute
 * @param {Element} element
 */
function knownCollation(uri, element) {
  try {
    getCollation(resolveUri(uri.trim(), infoOf(element).baseUri));
  } catch {
    throw xsltError("XTSE1210", `Unknown collation ${uri}`);
  }
}

/**
 * Compiles an xsl:key into the key registry.
 * @param {object} declaration
 * @param {object} cx
 */
export function declareKey({ element }, cx) {
  const name = clarkOf(cx.exprs.qname(required(element, "name"), element));
  const use = attr(element, "use");
  const children = cx.children(element);
  if (use !== undefined && children.length > 0) {
    throw xsltError("XTSE1205", "xsl:key cannot have use and content");
  }
  if (use === undefined && children.length === 0) {
    throw xsltError("XTSE1205", "xsl:key needs use or content");
  }
  const scope = cx.globalScope();
  const collation = attr(element, "collation");
  const definition = {
    match: compilePattern(required(element, "match"), element, cx),
    use: use === undefined ? null : cx.exprs.xpath(use, element, scope.vars),
    body: use === undefined ? compileBody(element, cx, scope) : null,
    collation: collation ?? infoOf(element).defaultCollation,
    compatible: infoOf(element).version < 2,
  };
  if (collation !== undefined) knownCollation(collation, element);
  definition.composite = yesNo(element, "composite", false);
  const list = cx.keys.get(name) ?? [];
  if (list.length > 0 && list[0].collation !== definition.collation) {
    throw xsltError("XTSE1220", `The key ${name} has different collations`);
  }
  if (list.length > 0 && list[0].composite !== definition.composite) {
    throw xsltError("XTSE1222", `The key ${name} is composite and not`);
  }
  list.push(definition);
  cx.keys.set(name, list);
}
