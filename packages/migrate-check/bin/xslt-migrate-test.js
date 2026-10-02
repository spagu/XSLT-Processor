#!/usr/bin/env node

/**
 * xslt-migrate-test: runs every XML + XSLT pair of a project on a reference
 * engine (Chromium or xsltproc) and on @tradik/xslt-processor, and reports
 * how many give the same output. All the logic lives in
 * ../src/compat/cli.js.
 */

import { runTestCli } from "../src/compat/cli.js";

process.exitCode = await runTestCli(process.argv.slice(2));
