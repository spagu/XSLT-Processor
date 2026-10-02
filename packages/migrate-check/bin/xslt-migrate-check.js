#!/usr/bin/env node

/**
 * xslt-migrate-check: scans a project directory for XSLT that will stop
 * working when Chrome removes native XSLT, and prints the risk and the
 * one-line migration. All the logic lives in ../src/cli.js.
 */

import { runCli } from "../src/cli.js";

process.exitCode = await runCli(process.argv.slice(2));
