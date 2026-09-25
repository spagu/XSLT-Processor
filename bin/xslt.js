#!/usr/bin/env node

/**
 * XSLT Processor CLI
 *
 * Command-line interface for transforming XML using XSLT stylesheets.
 * The result is serialized according to the xsl:output element of the
 * stylesheet (XSLT 1.0 section 16).
 */

"use strict";

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  CLI_OPTIONS,
  parseParameters,
  printHelp,
  printVersion,
} from "./lib/options.js";
import { createDomEnvironment, runTransformation } from "./lib/transform.js";
import { decodeXml } from "./lib/decode.js";
import { writeResult } from "./lib/output.js";
import {
  resolveBaseDir,
  resolveInputPath,
  resolveOutputPath,
} from "./lib/paths.js";

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
    console.error("Error: Both XML and XSLT file paths are required");
    console.error('Run "xslt --help" for usage information');
    process.exit(1);
  }

  try {
    const dom = await createDomEnvironment();
    const baseDir = resolveBaseDir();
    const xmlFile = resolveInputPath(xmlPath, "XML", baseDir);
    const xsltFile = resolveInputPath(xsltPath, "XSLT", baseDir);
    const outputFile = args.values.output
      ? resolveOutputPath(args.values.output, baseDir)
      : undefined;

    const [xmlBytes, xsltBytes] = await Promise.all([
      readFile(xmlFile),
      readFile(xsltFile),
    ]);

    const output = runTransformation({
      dom,
      xmlContent: decodeXml(xmlBytes, xmlFile),
      xsltContent: decodeXml(xsltBytes, xsltFile),
      params: parseParameters(args.values.param),
      values: args.values,
      xsltFile,
      baseDir,
    });

    await writeResult(output, outputFile);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
