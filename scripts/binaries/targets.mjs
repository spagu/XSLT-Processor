/**
 * Standalone binaries - build targets
 *
 * The platforms a standalone `xslt` executable is built for, how they map to
 * the official Node.js distribution files and to release asset names.
 * Asset names follow `xslt-<os>-<arch>[.exe]`, with `os` one of linux,
 * darwin, windows and `arch` one of x64, arm64.
 */

import { join, resolve } from "node:path";

/** Repository root (scripts/binaries/../..). */
export const ROOT_DIR = resolve(import.meta.dirname, "..", "..");

/** Default output directory of the executables. */
export const DIST_BIN_DIR = join(ROOT_DIR, "dist-bin");

/**
 * @typedef {Object} Target
 * @property {string} id - Target identifier, `<os>-<arch>`
 * @property {"linux"|"darwin"|"windows"} os - Operating system
 * @property {"x64"|"arm64"} arch - CPU architecture
 * @property {string} platform - Matching `process.platform`
 * @property {string} nodeDist - Directory name in the Node.js distribution
 * @property {string} archive - Distribution file holding the node binary,
 *   relative to https://nodejs.org/dist/<version>/
 * @property {string} member - Path of the node binary inside that file
 *   (empty when the file is the binary itself)
 */

/** Operating system names used in asset names, by `process.platform`. */
const OS_BY_PLATFORM = { linux: "linux", darwin: "darwin", win32: "windows" };

/** Every supported target, in release order. */
export const TARGETS = Object.freeze(
  [
    ["linux", "x64"],
    ["linux", "arm64"],
    ["darwin", "x64"],
    ["darwin", "arm64"],
    ["windows", "x64"],
  ].map(([os, arch]) => Object.freeze(describeTarget(os, arch))),
);

/**
 * Describe one target.
 *
 * @param {string} os - linux, darwin or windows
 * @param {string} arch - x64 or arm64
 * @returns {Target} The target description
 */
function describeTarget(os, arch) {
  if (os === "windows") {
    return {
      id: `${os}-${arch}`,
      os,
      arch,
      platform: "win32",
      nodeDist: `win-${arch}`,
      archive: `win-${arch}/node.exe`,
      member: "",
    };
  }
  const nodeDist = `${os}-${arch}`;
  return {
    id: nodeDist,
    os,
    arch,
    platform: os,
    nodeDist,
    archive: `node-{version}-${nodeDist}.tar.gz`,
    member: `node-{version}-${nodeDist}/bin/node`,
  };
}

/**
 * The target matching a platform and architecture, if supported.
 *
 * @param {string} [platform] - `process.platform` value
 * @param {string} [arch] - `process.arch` value
 * @returns {Target|undefined} The target, undefined when unsupported
 *
 * @example
 * hostTarget("linux", "x64").id; // 'linux-x64'
 */
export function hostTarget(platform = process.platform, arch = process.arch) {
  const os = OS_BY_PLATFORM[platform];
  return TARGETS.find((target) => target.os === os && target.arch === arch);
}

/**
 * Resolve a comma separated target list.
 *
 * @param {string|undefined} spec - `host`, `all` or ids such as
 *   `linux-x64,windows-x64`; undefined means `host`
 * @returns {Target[]} The selected targets
 * @throws {Error} When an id is unknown or the host is unsupported
 *
 * @example
 * parseTargets("linux-x64,darwin-arm64").map((t) => t.id);
 * // ['linux-x64', 'darwin-arm64']
 */
export function parseTargets(spec = "host") {
  return spec.split(",").flatMap((raw) => {
    const id = raw.trim();
    if (id === "all") return [...TARGETS];
    if (id === "host") {
      const host = hostTarget();
      if (!host) {
        throw new Error(`Unsupported host ${process.platform}-${process.arch}`);
      }
      return [host];
    }
    const target = TARGETS.find((candidate) => candidate.id === id);
    if (!target) {
      const known = TARGETS.map((candidate) => candidate.id).join(", ");
      throw new Error(`Unknown target "${id}" (expected host, all, ${known})`);
    }
    return [target];
  });
}

/**
 * Release asset name of a target's executable.
 *
 * @param {Target} target - Build target
 * @returns {string} `xslt-<os>-<arch>`, with `.exe` on Windows
 *
 * @example
 * binaryName(parseTargets("windows-x64")[0]); // 'xslt-windows-x64.exe'
 */
export function binaryName(target) {
  return `xslt-${target.id}${target.os === "windows" ? ".exe" : ""}`;
}

/**
 * Whether a target runs natively on the current machine, which enables the
 * (platform specific) V8 code cache and macOS signing.
 *
 * @param {Target} target - Build target
 * @returns {boolean} True when target is the host
 */
export function isHost(target) {
  return hostTarget()?.id === target.id;
}
