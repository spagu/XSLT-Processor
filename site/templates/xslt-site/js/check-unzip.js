/**
 * A small unzip for the online check, without a library: reads the central
 * directory of a .zip, copies stored entries and inflates DEFLATE entries
 * with the browser's DecompressionStream("deflate-raw"). Encrypted entries,
 * ZIP64 archives and other compression methods are reported, not read.
 * No DOM access, so the site tests run it in Node.js.
 *
 * @module check-unzip
 */

const END_SIGNATURE = 0x06054b50;
const ENTRY_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const END_SIZE = 22;
const MAX_COMMENT = 0xffff;
const ZIP64_MARK = 0xffffffff;
const STORED = 0;
const DEFLATED = 8;

const nameDecoder = new globalThis.TextDecoder();

/**
 * @typedef {object} ZipEntry
 * @property {string} name - Path inside the archive, `/` separators
 * @property {number} method - Compression method (0 stored, 8 DEFLATE)
 * @property {number} compressedSize - Bytes in the archive
 * @property {number} size - Bytes once extracted, as the archive declares
 * @property {number} localOffset - Offset of the entry's local header
 * @property {boolean} directory - The entry is a directory
 * @property {boolean} encrypted - The entry is encrypted
 */

/**
 * Find the end-of-central-directory record, searching back over a comment.
 *
 * @param {DataView} view - The archive
 * @returns {number} Its offset, or -1
 */
function findEnd(view) {
  const last = view.byteLength - END_SIZE;
  const first = Math.max(0, last - MAX_COMMENT);
  for (let offset = last; offset >= first; offset--) {
    if (view.getUint32(offset, true) === END_SIGNATURE) return offset;
  }
  return -1;
}

/**
 * List the entries of a zip archive from its central directory.
 *
 * @param {Uint8Array} bytes - The archive
 * @returns {ZipEntry[]} The entries, in archive order
 * @throws {Error} When it is not a zip, is damaged or is a ZIP64 archive
 */
export function listZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.byteLength >= END_SIZE ? findEnd(view) : -1;
  if (end < 0) throw new Error("not a zip archive");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (count === 0xffff || offset === ZIP64_MARK) {
    throw new Error("ZIP64 archives are not supported");
  }
  const entries = [];
  for (let index = 0; index < count; index++) {
    if (
      offset + 46 > bytes.byteLength ||
      view.getUint32(offset, true) !== ENTRY_SIGNATURE
    ) {
      throw new Error("the zip archive is damaged");
    }
    const nameLength = view.getUint16(offset + 28, true);
    const name = nameDecoder.decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    const entry = {
      name,
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      size: view.getUint32(offset + 24, true),
      localOffset: view.getUint32(offset + 42, true),
      directory: name.endsWith("/"),
      encrypted: (view.getUint16(offset + 8, true) & 1) === 1,
    };
    if (
      [entry.compressedSize, entry.size, entry.localOffset].includes(ZIP64_MARK)
    ) {
      throw new Error("ZIP64 archives are not supported");
    }
    entries.push(entry);
    offset +=
      46 +
      nameLength +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
  return entries;
}

/**
 * The compressed bytes of an entry, found through its local header.
 *
 * @param {Uint8Array} bytes - The archive
 * @param {ZipEntry} entry - The entry
 * @returns {Uint8Array} Its data as stored
 * @throws {Error} When the local header is missing
 */
function entryData(bytes, entry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = entry.localOffset;
  if (
    at + 30 > bytes.byteLength ||
    view.getUint32(at, true) !== LOCAL_SIGNATURE
  ) {
    throw new Error("the zip archive is damaged");
  }
  const start =
    at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  return bytes.subarray(start, start + entry.compressedSize);
}

/**
 * Inflate raw DEFLATE data with DecompressionStream.
 *
 * @param {Uint8Array} data - Compressed bytes
 * @returns {Promise<Uint8Array>} The inflated bytes
 */
export async function inflateRaw(data) {
  const stream = new globalThis.Response(data).body.pipeThrough(
    new globalThis.DecompressionStream("deflate-raw"),
  );
  return new Uint8Array(await new globalThis.Response(stream).arrayBuffer());
}

/**
 * Why an entry cannot be read, or null when it can.
 *
 * @param {ZipEntry} entry - The entry
 * @returns {string|null} The reason
 */
export function unreadableReason(entry) {
  if (entry.encrypted) return "encrypted";
  if (entry.method !== STORED && entry.method !== DEFLATED) {
    return `compression method ${entry.method} is not supported`;
  }
  return null;
}

/**
 * Read one file entry of a zip archive.
 *
 * @param {Uint8Array} bytes - The archive
 * @param {ZipEntry} entry - A file entry from listZipEntries
 * @returns {Promise<Uint8Array>} Its extracted bytes
 * @throws {Error} With the reason when it cannot be read
 */
export async function readEntry(bytes, entry) {
  const reason = unreadableReason(entry);
  if (reason) throw new Error(reason);
  const data = entryData(bytes, entry);
  let out = data;
  if (entry.method === DEFLATED) {
    try {
      out = await inflateRaw(data);
    } catch {
      throw new Error("damaged entry");
    }
  }
  if (out.byteLength !== entry.size) throw new Error("damaged entry");
  return out;
}
