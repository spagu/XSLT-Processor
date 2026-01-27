#!/usr/bin/env node

/**
 * XSLT Processor CLI
 *
 * Command-line interface for transforming XML using XSLT stylesheets.
 */

'use strict';

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { JSDOM } from 'jsdom';
import { XSLTProcessor } from '../src/XSLTProcessor.js';

const VERSION = '1.0.5';

function printHelp() {
  console.log(`
xslt-processor - Transform XML documents using XSLT stylesheets

USAGE:
  xslt <xml-file> <xslt-file> [options]

ARGUMENTS:
  <xml-file>       Path to XML source document
  <xslt-file>      Path to XSLT stylesheet

OPTIONS:
  -o, --output <file>     Write output to file instead of stdout
  -p, --param <n>=<v>     Set XSLT parameter (can be used multiple times)
  -f, --format            Format output with indentation
  -h, --help              Show this help message
  -v, --version           Show version number

EXAMPLES:
  # Basic transformation
  xslt data.xml transform.xsl

  # Save output to file
  xslt data.xml transform.xsl -o result.html

  # With parameters
  xslt data.xml transform.xsl -p title="My Page" -p count=10

  # Multiple parameters with formatted output
  xslt data.xml transform.xsl -p lang=en -p debug=true -f -o output.html
`);
}

function printVersion() {
  console.log(`xslt-processor v${VERSION}`);
}

function parseParameters(params) {
  const result = {};

  if (!params || !Array.isArray(params)) {
    return result;
  }

  for (const param of params) {
    const equalIndex = param.indexOf('=');
    if (equalIndex === -1) {
      console.error(`Warning: Invalid parameter format "${param}". Expected name=value`);
      continue;
    }

    const name = param.substring(0, equalIndex);
    const value = param.substring(equalIndex + 1);
    result[name] = value;
  }

  return result;
}

function formatXml(xml) {
  let formatted = '';
  let indent = 0;
  const lines = xml.replace(/>\s*</g, '>\n<').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('</')) {
      indent = Math.max(0, indent - 1);
    }

    formatted += '  '.repeat(indent) + trimmed + '\n';

    if (trimmed.startsWith('<') && !trimmed.startsWith('</') &&
        !trimmed.startsWith('<?') && !trimmed.startsWith('<!') &&
        !trimmed.endsWith('/>') && !trimmed.includes('</')) {
      indent++;
    }
  }

  return formatted;
}

async function main() {
  const options = {
    output: { type: 'string', short: 'o' },
    param: { type: 'string', short: 'p', multiple: true },
    format: { type: 'boolean', short: 'f', default: false },
    help: { type: 'boolean', short: 'h', default: false },
    version: { type: 'boolean', short: 'v', default: false }
  };

  let args;
  try {
    args = parseArgs({ options, allowPositionals: true });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  if (args.values.help) {
    printHelp();
    process.exit(0);
  }

  if (args.values.version) {
    printVersion();
    process.exit(0);
  }

  const [xmlPath, xsltPath] = args.positionals;

  if (!xmlPath || !xsltPath) {
    console.error('Error: Both XML and XSLT file paths are required');
    console.error('Run "xslt --help" for usage information');
    process.exit(1);
  }

  // Setup JSDOM for DOM parsing
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    contentType: 'text/html'
  });
  const { DOMParser, XMLSerializer } = dom.window;

  try {
    // Read input files
    const [xmlContent, xsltContent] = await Promise.all([
      readFile(xmlPath, 'utf-8'),
      readFile(xsltPath, 'utf-8')
    ]);

    // Parse documents
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'application/xml');
    const xsltDoc = parser.parseFromString(xsltContent, 'application/xml');

    // Check for parsing errors
    const xmlError = xmlDoc.querySelector('parsererror');
    if (xmlError) {
      console.error(`Error parsing XML: ${xmlError.textContent}`);
      process.exit(1);
    }

    const xsltError = xsltDoc.querySelector('parsererror');
    if (xsltError) {
      console.error(`Error parsing XSLT: ${xsltError.textContent}`);
      process.exit(1);
    }

    // Create processor
    const processor = new XSLTProcessor();
    processor.importStylesheet(xsltDoc);

    // Set parameters
    const params = parseParameters(args.values.param);
    for (const [name, value] of Object.entries(params)) {
      processor.setParameter(null, name, value);
    }

    // Transform
    const fragment = processor.transformToFragment(xmlDoc, dom.window.document);

    // Serialize result
    const serializer = new XMLSerializer();
    let output = serializer.serializeToString(fragment);

    // Format if requested
    if (args.values.format) {
      output = formatXml(output);
    }

    // Output result
    if (args.values.output) {
      await writeFile(args.values.output, output, 'utf-8');
      console.error(`Output written to ${args.values.output}`);
    } else {
      console.log(output);
    }

  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`Error: File not found: ${err.path}`);
    } else {
      console.error(`Error: ${err.message}`);
    }
    process.exit(1);
  }
}

main();
