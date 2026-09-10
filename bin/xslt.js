#!/usr/bin/env node

/**
 * XSLT Processor CLI
 *
 * Command-line interface for transforming XML using XSLT stylesheets.
 * The result is serialized according to the xsl:output element of the
 * stylesheet (XSLT 1.0 section 16).
 */

'use strict';

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  CLI_OPTIONS,
  parseParameters,
  printHelp,
  printVersion
} from './lib/options.js';
import { createDomEnvironment, runTransformation } from './lib/transform.js';

/**
 * Parse the command line, exiting on malformed input.
 *
 * @returns {object} The parseArgs result
 */
function readArguments() {
  try {
    return parseArgs({ options: CLI_OPTIONS, allowPositionals: true });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Write the transformation result to a file or to stdout.
 *
 * @param {string} output - Serialized transformation result
 * @param {string|undefined} target - Output file path, if any
 * @returns {Promise<void>} Resolves once the result has been written
 */
async function writeOutput(output, target) {
  if (target) {
    await writeFile(target, output, 'utf-8');
    console.error(`Output written to ${target}`);
    return;
  }
  console.log(output);
}

/**
 * CLI entry point.
 *
 * @returns {Promise<void>} Resolves once the CLI has finished
 */
async function main() {
  const args = readArguments();

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

  const dom = createDomEnvironment();

  try {
    const [xmlContent, xsltContent] = await Promise.all([
      readFile(xmlPath, 'utf-8'),
      readFile(xsltPath, 'utf-8')
    ]);

    const output = runTransformation({
      dom,
      xmlContent,
      xsltContent,
      params: parseParameters(args.values.param),
      values: args.values
    });

    await writeOutput(output, args.values.output);
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
