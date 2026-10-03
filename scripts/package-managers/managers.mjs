/**
 * The package managers of scripts/package-managers.mjs: how each one is
 * started, installs a project without a lockfile, runs a script of the
 * project and runs an installed bin.
 *
 * Yarn and pnpm run at the pinned versions through `npx --yes`, which works
 * on every Node.js (corepack is no longer bundled from Node.js 25). bun is
 * taken from ~/.bun/bin or the PATH.
 *
 * @module scripts/package-managers/managers
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Pinned versions (latest stable releases); bun's is pinned in CI by
 * oven-sh/setup-bun (.github/workflows/test.yml).
 */
export const PINNED = Object.freeze({
  yarnClassic: "1.22.22",
  yarnBerry: "4.18.1",
  pnpm: "12.8.1",
});

const bunBin = [join(homedir(), ".bun", "bin", "bun"), "bun"].find(
  (candidate) => candidate === "bun" || existsSync(candidate),
);
const yarn1 = ["npx", "--yes", `yarn@${PINNED.yarnClassic}`];
const yarn4 = ["npx", "--yes", "-p", `@yarnpkg/cli-dist@${PINNED.yarnBerry}`];

/**
 * @typedef {Object} Manager
 * @property {string[]} cli - Command that starts the manager
 * @property {string[]} install - Arguments of a lockfile-free install
 * @property {string[]} node - Command that runs a script of the project
 * @property {string[]} exec - Command prefix that runs an installed bin
 * @property {Object<string, string>} [files] - Extra project files
 */

/** @type {Object<string, Manager>} */
export const MANAGERS = Object.freeze({
  npm: {
    cli: ["npm"],
    install: ["install", "--no-audit", "--no-fund"],
    node: ["node"],
    exec: ["npm", "exec", "--no", "--"],
  },
  "yarn-classic": {
    cli: yarn1,
    // Yarn 1 alone fails on engines: jsdom 30 excludes Node.js 25 (the
    // others warn), which says nothing about this package
    install: [
      "install",
      "--no-lockfile",
      "--ignore-engines",
      "--cache-folder",
      ".yarn-cache",
    ],
    node: ["node"],
    exec: [...yarn1, "run"],
  },
  "yarn-berry-pnp": {
    cli: [...yarn4, "yarn"],
    install: ["install"],
    node: [...yarn4, "yarn", "node"],
    exec: [...yarn4, "yarn", "run"],
    files: {
      ".yarnrc.yml":
        "nodeLinker: pnp\nenableGlobalCache: false\nenableTelemetry: false\n",
      "yarn.lock": "",
    },
  },
  pnpm: {
    cli: ["npx", "--yes", `pnpm@${PINNED.pnpm}`],
    install: ["install", "--no-frozen-lockfile"],
    node: ["node"],
    exec: ["npx", "--yes", `pnpm@${PINNED.pnpm}`, "exec"],
  },
  bun: {
    cli: [bunBin],
    install: ["install"],
    node: [bunBin, "run"],
    exec: [bunBin, "x"],
  },
});

/** Environment of every command: no prompts, lockfiles may be written. */
const ENV = {
  ...process.env,
  YARN_ENABLE_IMMUTABLE_INSTALLS: "false",
  npm_config_update_notifier: "false",
};

/**
 * Run a command; never throws.
 *
 * @param {string[]} command - Program and arguments
 * @param {string} cwd - Working directory
 * @returns {{ok: boolean, out: string}} Success and the combined output
 */
export function run([program, ...args], cwd) {
  // Programs come from PATH on purpose: the point is to exercise the package
  // managers the developer or the CI runner has installed. NOSONAR
  const result = spawnSync(program, args, {
    // NOSONAR
    cwd,
    env: { ...ENV, BUN_INSTALL_CACHE_DIR: join(cwd, ".bun-cache") },
    encoding: "utf8",
    timeout: 600_000,
  });
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`;
  return { ok: result.status === 0, out: out.trim() };
}
