/**
 * XPath in a stylesheet: the static context of each stylesheet element
 * (in-scope namespaces, xpath-default-namespace, base URI, backwards
 * compatibility, decimal formats, the function library with the
 * stylesheet functions), and the compilation of expressions, sequence
 * types and attribute value templates against the variables in scope.
 *
 * @module @tradik/xslt3/xslt/compiler/expressions
 */

import { compileNode, withinLimits } from "../../xpath/eval/compiler.js";
import { compileSequenceType } from "../../xpath/eval/sequenceType.js";
import { createStaticContext } from "../../xpath/eval/staticContext.js";
import { parseXPath } from "../../xpath/syntax/index.js";
import { TokenStream } from "../../xpath/syntax/tokenStream.js";
import { parseSequenceType } from "../../xpath/syntax/types.js";
import { XPathError } from "../../errors.js";
import { resolveQName } from "../names.js";
import { parseAvt } from "./avt.js";
import { infoOf } from "./elementInfo.js";

/**
 * A compiled XPath expression of the stylesheet.
 * @typedef {object} Expr
 * @property {(ctx: object) => Array} run - The evaluator
 * @property {string} text - Source text
 * @property {object} sc - Static context
 * @property {object} ast - Syntax tree
 */

/** The namespace of the standard functions. */
const FN_NS = "http://www.w3.org/2005/xpath-functions";

/**
 * In backwards-compatible mode a call of an unknown extension function
 * is an error only when evaluated (XSLT 3.0 section 24.1.2, XTDE1425).
 * @param {Error} error - Raised by the XPath compiler
 * @param {object} sc - Static context of the expression
 * @returns {(ctx: object) => Array} an evaluator raising XTDE1425
 * @throws {Error} the error otherwise
 */
function unavailableFunction(error, sc) {
  const uri = /^XPST0017: Unknown function Q\{([^}]*)\}/.exec(
    error.message,
  )?.[1];
  if (!sc.backwardsCompatible || uri === undefined || uri === FN_NS) {
    throw error;
  }
  return () => {
    throw new XPathError("XTDE1425", error.message.slice(10));
  };
}

/** Compiles the XPath expressions of a stylesheet. */
export class ExpressionCompiler {
  /**
   * @param {object} options
   * @param {import("../../functions/registry.js").FunctionLibrary} options.library
   * @param {Array<object>} [options.decimalFormats] - Definitions
   * @param {object} [options.owner] - Package compiler of the expressions
   */
  constructor({ library, decimalFormats = [], owner = null }) {
    this.library = library;
    this.decimalFormats = decimalFormats;
    /** The package compiler whose keys key() reads (null: the stylesheet's) */
    this.owner = owner;
    /** @type {WeakMap<Map, Map<string, object>>} */
    this.cache = new WeakMap();
  }

  /**
   * The static context of the expressions of a stylesheet element.
   * @param {Element} element
   * @returns {object} an XPath static context
   */
  staticContext(element) {
    const info = infoOf(element);
    let byKey = this.cache.get(info.namespaces);
    if (!byKey) {
      byKey = new Map();
      this.cache.set(info.namespaces, byKey);
    }
    const compatible = info.version < 2;
    const key = `${info.xpathDefaultNs}|${info.baseUri}|${compatible}`;
    let sc = byKey.get(key);
    if (!sc) {
      const namespaces = new Map(
        [...info.namespaces].filter(([p]) => p !== ""),
      );
      sc = createStaticContext(
        {
          namespaces,
          defaultElementNamespace: info.xpathDefaultNs,
          baseUri: info.baseUri,
          backwardsCompatible: compatible,
          decimalFormats: this.decimalFormats,
        },
        this.library,
      );
      sc.owner = this.owner;
      byKey.set(key, sc);
    }
    return sc;
  }

  /**
   * Compiles an XPath expression written on a stylesheet element.
   * @param {string} text
   * @param {Element} element
   * @param {object|null} vars - Variables in scope (see eval/scope.js)
   * @returns {Expr}
   */
  xpath(text, element, vars) {
    const sc = this.staticContext(element);
    const ast = parseXPath(text);
    const run = withinLimits(() => {
      try {
        return compileNode(ast, { sc, vars });
      } catch (error) {
        return unavailableFunction(error, sc);
      }
    });
    return { run, text, sc, ast };
  }

  /**
   * Compiles an XPath AST (patterns compile their parts this way).
   * @param {object} ast
   * @param {object} sc
   * @param {object|null} vars
   * @returns {(ctx: object) => Array}
   */
  compileAst(ast, sc, vars) {
    return withinLimits(() => compileNode(ast, { sc, vars }));
  }

  /**
   * Compiles a sequence type (an `as` attribute).
   * @param {string} text
   * @param {Element} element
   * @returns {import("../../xpath/eval/sequenceType.js").SequenceType}
   */
  sequenceType(text, element) {
    const tokens = new TokenStream(text);
    const node = parseSequenceType(tokens);
    if (tokens.peek().type !== "eof") tokens.fail("Unexpected token");
    return compileSequenceType(node, this.staticContext(element));
  }

  /**
   * Compiles an attribute value template.
   * @param {string} text
   * @param {Element} element
   * @param {object|null} vars
   * @returns {Array<string|Expr>} literal parts and expressions
   */
  avt(text, element, vars) {
    return parseAvt(text).map((part) =>
      typeof part === "string" ? part : this.xpath(part.expr, element, vars),
    );
  }

  /**
   * Resolves a QName attribute value of a stylesheet element.
   * @param {string} text
   * @param {Element} element
   * @param {object} [options] - See names.resolveQName
   * @returns {import("../names.js").ExpandedName}
   */
  qname(text, element, options) {
    return resolveQName(text, infoOf(element).namespaces, options);
  }
}
