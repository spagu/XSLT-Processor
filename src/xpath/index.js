/**
 * XPath 1.0 Module
 * Based on W3C XPath 1.0 Specification: http://www.w3.org/TR/1999/REC-xpath-19991116
 */

'use strict';

export { TokenType, Token, XPathTokenizer, tokenize } from './tokenizer.js';
export { NodeType, ASTNode, XPathParser, parse } from './parser.js';
export { XPathResultType, XPathContext, XPathEvaluator, XPathLimits } from './evaluator.js';

import { parse } from './parser.js';
import { XPathEvaluator, XPathContext } from './evaluator.js';

/**
 * Evaluate an XPath expression against a node
 *
 * @param {string} expression - XPath expression
 * @param {Node} contextNode - Context node
 * @param {Object} options - Options (variables, namespaces)
 * @returns {*} Evaluation result
 */
export function evaluate(expression, contextNode, options = {}) {
  const ast = parse(expression);
  const evaluator = new XPathEvaluator();
  const context = new XPathContext(
    contextNode,
    1,
    1,
    options.variables || {},
    options.namespaces || {}
  );
  return evaluator.evaluate(ast, context);
}

/**
 * Select nodes matching an XPath expression
 *
 * @param {string} expression - XPath expression
 * @param {Node} contextNode - Context node
 * @param {Object} options - Options
 * @returns {Node[]} Matching nodes
 */
export function select(expression, contextNode, options = {}) {
  const result = evaluate(expression, contextNode, options);
  if (Array.isArray(result)) return result;
  if (result && result.nodeType) return [result];
  return [];
}

/**
 * Select first node matching an XPath expression
 *
 * @param {string} expression - XPath expression
 * @param {Node} contextNode - Context node
 * @param {Object} options - Options
 * @returns {Node|null} First matching node or null
 */
export function selectFirst(expression, contextNode, options = {}) {
  const nodes = select(expression, contextNode, options);
  return nodes.length > 0 ? nodes[0] : null;
}
