/**
 * The output buffer of the serializers: markup is appended piece by piece
 * and handed out in chunks of about `chunkSize` UTF-16 code units, so a
 * large result can be streamed without ever being held as one string.
 *
 * @module @tradik/xslt3/serialize/output/buffer
 */

/** Default chunk size of serializeChunks, in UTF-16 code units. */
export const DEFAULT_CHUNK_SIZE = 16384;

/** Collects output and releases it in chunks. */
export class OutputBuffer {
  /**
   * @param {number} [chunkSize] - Chunk size; Infinity keeps everything
   *   until the end
   */
  constructor(chunkSize = DEFAULT_CHUNK_SIZE) {
    this.chunkSize = chunkSize;
    /** @type {string[]} */
    this.parts = [];
    this.length = 0;
  }

  /** @param {string} text - Markup to append */
  write(text) {
    if (text) {
      this.parts.push(text);
      this.length += text.length;
    }
  }

  /** @returns {boolean} whether a chunk is ready */
  get full() {
    return this.length >= this.chunkSize;
  }

  /**
   * Takes the buffered output.
   * @returns {string} everything written since the last take ("" if none)
   */
  take() {
    const chunk = this.parts.join("");
    this.parts = [];
    this.length = 0;
    return chunk;
  }
}
