/**
 * Output Chunking
 *
 * The serializers write markup into a {@link ChunkBuffer}, which hands it out
 * in chunks of a bounded size: the streaming API (`serializeChunks`,
 * `transformToStream`) yields each chunk as soon as it is full, while
 * `serializeResult` uses an unbounded buffer and joins everything once. One
 * writer implementation serves both.
 *
 * @module xslt/serializer/chunks
 */

/** Default chunk size, in UTF-16 code units (16 KiB of ASCII). */
export const DEFAULT_CHUNK_SIZE = 16384;

/**
 * Validate a chunk size.
 *
 * @param {number} [size] - Requested size, {@link DEFAULT_CHUNK_SIZE} when absent
 * @returns {number} A positive integer, or Infinity (one chunk)
 * @throws {RangeError} For anything else
 *
 * @example
 * toChunkSize(undefined); // 16384
 */
export function toChunkSize(size) {
  if (size === undefined) return DEFAULT_CHUNK_SIZE;
  if (size === Infinity || (Number.isInteger(size) && size > 0)) return size;
  throw new RangeError(
    `chunkSize must be a positive integer or Infinity, got ${size}`,
  );
}

/**
 * Whether a UTF-16 code unit is a high (leading) surrogate.
 *
 * @param {number} unit - The code unit
 * @returns {boolean} True for U+D800..U+DBFF
 */
function isHighSurrogate(unit) {
  return unit >= 0xd800 && unit <= 0xdbff;
}

/**
 * End of the next chunk of `text` starting at `start`, moved so that a
 * surrogate pair is never split (a chunk encoded on its own, e.g. with
 * TextEncoder, would otherwise turn each half into U+FFFD).
 *
 * @param {string} text - The buffered text
 * @param {number} start - Start of the chunk
 * @param {number} size - Chunk size
 * @returns {number} End of the chunk (exclusive)
 */
function chunkEnd(text, start, size) {
  const end = start + size;
  if (!isHighSurrogate(text.charCodeAt(end - 1))) return end;
  return end - 1 > start ? end - 1 : end + 1;
}

export class ChunkBuffer {
  /**
   * @param {number} [chunkSize] - Chunk size in code units; Infinity keeps
   *   everything for one final chunk
   */
  constructor(chunkSize = Infinity) {
    this.chunkSize = toChunkSize(chunkSize);
    this.parts = [];
    this.length = 0;
  }

  /**
   * Append text.
   *
   * @param {string} text - Markup or character data
   * @returns {void}
   */
  write(text) {
    this.parts.push(text);
    this.length += text.length;
  }

  /**
   * Whether at least one full chunk is buffered.
   *
   * @returns {boolean} True when {@link ChunkBuffer#take} would yield
   */
  get full() {
    return this.length >= this.chunkSize;
  }

  /**
   * Yield the buffered text as chunks of `chunkSize` code units (one more
   * when a surrogate pair straddles the boundary). The last partial chunk is
   * kept for later unless `final` is set.
   *
   * @param {boolean} [final] - Also yield the partial last chunk
   * @yields {string} Non-empty chunks
   * @returns {Generator<string, void, void>} The chunks
   *
   * @example
   * const buffer = new ChunkBuffer(2);
   * buffer.write("abcde");
   * [...buffer.take(true)]; // ["ab", "cd", "e"]
   */
  *take(final = false) {
    const text = this.parts.length === 1 ? this.parts[0] : this.parts.join("");
    this.parts = [];
    this.length = 0;
    let start = 0;
    while (text.length - start >= this.chunkSize) {
      const end = chunkEnd(text, start, this.chunkSize);
      yield text.slice(start, end);
      start = end;
    }
    const rest = text.slice(start);
    if (!rest) return;
    if (final) yield rest;
    else this.write(rest);
  }
}
