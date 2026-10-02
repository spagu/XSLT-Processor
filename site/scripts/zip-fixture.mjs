/**
 * Test helper: writes small zip archives by hand (local headers, central
 * directory, end record) for the online check's unzip, in the site tests and
 * the Playwright spec. Holds no tests of its own.
 *
 * @module zip-fixture
 */

import { Buffer } from "node:buffer";
import { crc32, deflateRawSync } from "node:zlib";

/**
 * @typedef {object} FixtureEntry
 * @property {string} name - Path in the archive ("dir/" for a directory)
 * @property {string|Uint8Array} [data] - Contents ("" by default)
 * @property {"store"|"deflate"|number} [method] - Compression ("deflate")
 * @property {boolean} [encrypted] - Set the encryption flag
 * @property {number} [size] - Declared size, to fake a damaged entry
 */

/**
 * Build a zip archive.
 *
 * @param {FixtureEntry[]} entries - The entries
 * @param {object} [options] - Options
 * @param {string} [options.comment] - Archive comment after the end record
 * @returns {Buffer} The archive
 */
export function makeZip(entries, { comment = "" } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const raw = Buffer.from(entry.data ?? "");
    const method =
      typeof entry.method === "number"
        ? entry.method
        : entry.method === "store"
          ? 0
          : 8;
    const stored = method === 8 ? deflateRawSync(raw) : raw;
    const fields = {
      flags: entry.encrypted ? 1 : 0,
      method,
      crc: crc32(raw),
      compressed: stored.length,
      size: entry.size ?? raw.length,
    };
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(fields.flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(fields.crc, 14);
    local.writeUInt32LE(fields.compressed, 18);
    local.writeUInt32LE(fields.size, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, stored);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(fields.flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(fields.crc, 16);
    central.writeUInt32LE(fields.compressed, 20);
    central.writeUInt32LE(fields.size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + stored.length;
  }
  const directory = Buffer.concat(centrals);
  const notes = Buffer.from(comment);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(notes.length, 20);
  return Buffer.concat([...locals, directory, end, notes]);
}
