/**
 * XSLT Processor CLI - Option Handling
 *
 * Command line option definitions, help/version banners and parameter parsing.
 */

'use strict';

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Version of the CLI, read from the package manifest.
 * @type {string}
 */
export const VERSION = require('../../package.json').version;

/**
 * parseArgs option definitions.
 * @type {object}
 */
export const CLI_OPTIONS = {
  output: { type: 'string', short: 'o' },
  param: { type: 'string', short: 'p', multiple: true },
  format: { type: 'boolean', short: 'f', default: false },
  indent: { type: 'boolean', default: false },
  method: { type: 'string' },
  'no-declaration': { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
  version: { type: 'boolean', short: 'v', default: false }
};

/**
 * Print the usage banner.
 * @returns {void}
 */
export function printHelp() {
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
  -f, --format            Format output with indentation (same as --indent)
      --indent            Override xsl:output to indent="yes"
      --method <m>        Override xsl:output method (xml|html|xhtml|text)
      --no-declaration    Override xsl:output to omit the XML declaration
  -h, --help              Show this help message
  -v, --version           Show version number

The output is serialized according to the xsl:output element of the
stylesheet; the options above override individual xsl:output settings.

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

/**
 * Print the version banner.
 * @returns {void}
 */
export function printVersion() {
  console.log(`xslt-processor v${VERSION}`);
}

/**
 * Parse `name=value` parameter arguments.
 *
 * @param {string[]|undefined} params - Raw `--param` values
 * @returns {Record<string, string>} Parsed parameters
 */
export function parseParameters(params) {
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

    result[param.substring(0, equalIndex)] = param.substring(equalIndex + 1);
  }

  return result;
}
