#!/usr/bin/env node

/**
 * Build script for xslt-processor
 *
 * Creates:
 * - dist/xslt-processor.js - ESM module
 * - dist/xslt-processor.cjs - CommonJS module
 * - dist/xslt-processor.browser.js - Browser bundle (IIFE)
 * - dist/xslt-processor.browser.min.js - Minified browser bundle
 * - dist/xslt-processor.d.ts - TypeScript declarations
 */

import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const srcDir = join(rootDir, 'src');
const distDir = join(rootDir, 'dist');

// Ensure dist directory exists
mkdirSync(distDir, { recursive: true });

async function buildAll() {
  console.log('Building xslt-processor...\n');

  // ESM build
  console.log('Building ESM module...');
  await build({
    entryPoints: [join(srcDir, 'index.js')],
    outfile: join(distDir, 'xslt-processor.js'),
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: ['es2020'],
    sourcemap: true
  });

  // CommonJS build
  console.log('Building CommonJS module...');
  await build({
    entryPoints: [join(srcDir, 'index.js')],
    outfile: join(distDir, 'xslt-processor.cjs'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: ['node18'],
    sourcemap: true
  });

  // Browser IIFE build
  console.log('Building browser bundle...');
  await build({
    entryPoints: [join(srcDir, 'index.js')],
    outfile: join(distDir, 'xslt-processor.browser.js'),
    bundle: true,
    format: 'iife',
    globalName: 'XsltProcessorLib',
    platform: 'browser',
    target: ['chrome90', 'firefox88', 'safari14', 'edge90'],
    sourcemap: true,
    footer: {
      js: `
// Auto-install as global XSLTProcessor replacement if native is not functional
if (typeof window !== 'undefined') {
  XsltProcessorLib.installGlobal();
}
`
    }
  });

  // Minified browser build
  console.log('Building minified browser bundle...');
  await build({
    entryPoints: [join(srcDir, 'index.js')],
    outfile: join(distDir, 'xslt-processor.browser.min.js'),
    bundle: true,
    format: 'iife',
    globalName: 'XsltProcessorLib',
    platform: 'browser',
    target: ['chrome90', 'firefox88', 'safari14', 'edge90'],
    minify: true,
    sourcemap: true,
    footer: {
      js: `if(typeof window!=='undefined'){XsltProcessorLib.installGlobal();}`
    }
  });

  // Generate TypeScript declarations
  console.log('Generating TypeScript declarations...');
  const declarations = `/**
 * @cv-xslt/xslt-processor - TypeScript Declarations
 */

/**
 * XSLTProcessor - Applies XSLT stylesheet transformations to XML documents.
 */
export class XSLTProcessor {
  constructor();

  /**
   * Imports the XSLT stylesheet.
   * @param style - The XSLT stylesheet to import (Document or Element)
   */
  importStylesheet(style: Node): void;

  /**
   * Transforms the node source and returns a document fragment.
   * @param source - The XML document to transform
   * @param output - The document that will own the generated fragment
   * @returns The transformed result as a DocumentFragment
   */
  transformToFragment(source: Node, output: Document): DocumentFragment | null;

  /**
   * Transforms the node source and returns a full XML document.
   * @param source - The XML document to transform
   * @returns The transformed result as an XMLDocument
   */
  transformToDocument(source: Node): XMLDocument | null;

  /**
   * Sets a parameter in the XSLT stylesheet.
   * @param namespaceURI - The namespace URI (use null for no namespace)
   * @param localName - The local name of the parameter
   * @param value - The value to set
   */
  setParameter(namespaceURI: string | null, localName: string, value: unknown): void;

  /**
   * Gets the value of a parameter from the XSLT stylesheet.
   * @param namespaceURI - The namespace URI
   * @param localName - The local name of the parameter
   * @returns The parameter value, or empty string if not set
   */
  getParameter(namespaceURI: string | null, localName: string): unknown;

  /**
   * Removes a parameter from the XSLT processor.
   * @param namespaceURI - The namespace URI
   * @param localName - The local name of the parameter
   */
  removeParameter(namespaceURI: string | null, localName: string): void;

  /**
   * Removes all set parameters from the XSLTProcessor.
   */
  clearParameters(): void;

  /**
   * Removes all parameters and stylesheets from the XSLTProcessor.
   */
  reset(): void;
}

/**
 * Check if native XSLTProcessor is available and functional.
 */
export function isNativeXSLTSupported(): boolean;

/**
 * Install as global XSLTProcessor replacement if native is not functional.
 * @param force - Force installation even if native is available
 * @returns True if installed as global
 */
export function installGlobal(force?: boolean): boolean;

/**
 * XPath evaluation result types.
 */
export const XPathResultType: {
  ANY_TYPE: 0;
  NUMBER_TYPE: 1;
  STRING_TYPE: 2;
  BOOLEAN_TYPE: 3;
  UNORDERED_NODE_ITERATOR_TYPE: 4;
  ORDERED_NODE_ITERATOR_TYPE: 5;
  UNORDERED_NODE_SNAPSHOT_TYPE: 6;
  ORDERED_NODE_SNAPSHOT_TYPE: 7;
  ANY_UNORDERED_NODE_TYPE: 8;
  FIRST_ORDERED_NODE_TYPE: 9;
};

/**
 * XPath evaluation context.
 */
export class XPathContext {
  constructor(
    node: Node,
    position?: number,
    size?: number,
    variables?: Record<string, unknown>,
    namespaces?: Record<string, string>
  );

  node: Node;
  position: number;
  size: number;
  variables: Record<string, unknown>;
  namespaces: Record<string, string>;

  clone(overrides?: Partial<XPathContext>): XPathContext;
}

/**
 * XPath evaluator.
 */
export class XPathEvaluator {
  constructor();

  evaluate(ast: unknown, context: XPathContext): unknown;
  toBoolean(value: unknown): boolean;
  toNumber(value: unknown): number;
  toString(value: unknown): string;
  getStringValue(node: Node): string;
}

/**
 * Evaluate an XPath expression against a node.
 */
export function evaluateXPath(
  expression: string,
  contextNode: Node,
  options?: { variables?: Record<string, unknown>; namespaces?: Record<string, string> }
): unknown;

/**
 * Select nodes matching an XPath expression.
 */
export function selectXPath(
  expression: string,
  contextNode: Node,
  options?: { variables?: Record<string, unknown>; namespaces?: Record<string, string> }
): Node[];

/**
 * Select first node matching an XPath expression.
 */
export function selectFirstXPath(
  expression: string,
  contextNode: Node,
  options?: { variables?: Record<string, unknown>; namespaces?: Record<string, string> }
): Node | null;

/**
 * Parse an XPath expression into an AST.
 */
export function parseXPath(expression: string): unknown;

/**
 * XSLT processing context.
 */
export class XsltContext {
  constructor(options?: {
    currentNode?: Node;
    currentNodeList?: Node[];
    position?: number;
    variables?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    outputDocument?: Document;
    stylesheet?: Document;
    namespaces?: Record<string, string>;
    templates?: unknown[];
    keys?: Record<string, unknown>;
    decimalFormats?: Record<string, unknown>;
    outputMethod?: string;
    xpathEvaluator?: XPathEvaluator;
  });

  clone(overrides?: Partial<XsltContext>): XsltContext;
  getVariable(name: string): unknown;
  setVariable(name: string, value: unknown): void;
}

/**
 * XSLT processing engine.
 */
export class XsltEngine {
  constructor();

  importStylesheet(stylesheetNode: Node): void;
  transform(sourceNode: Node, ownerDocument: Document): DocumentFragment;
  transformToDocument(sourceNode: Node): Document;
}

/**
 * Version information.
 */
export const VERSION: string;

/**
 * Check if running in a browser environment.
 */
export const isBrowser: boolean;

/**
 * Check if running in Node.js.
 */
export const isNode: boolean;

export default XSLTProcessor;
`;

  writeFileSync(join(distDir, 'xslt-processor.d.ts'), declarations);

  console.log('\nBuild complete! Output files:');
  console.log('  dist/xslt-processor.js         - ESM module');
  console.log('  dist/xslt-processor.cjs        - CommonJS module');
  console.log('  dist/xslt-processor.browser.js - Browser bundle');
  console.log('  dist/xslt-processor.browser.min.js - Minified browser bundle');
  console.log('  dist/xslt-processor.d.ts       - TypeScript declarations');
}

buildAll().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
