/**
 * A cursor over the codepoints of a regular expression.
 *
 * @module @tradik/xslt3/functions/regex/reader
 */

/** Reads a pattern codepoint by codepoint. */
export class RegexReader {
  /**
   * @param {string} pattern
   * @param {boolean} [caseless=false] - Whether the i flag is set and JS
   *   supports the (?-i:...) modifier, so categories can ignore it
   */
  constructor(pattern, caseless = false) {
    this.chars = Array.from(pattern);
    this.pos = 0;
    this.caseless = caseless;
  }

  /**
   * @param {number} [offset=0]
   * @returns {string|undefined} the character at the cursor plus offset
   */
  peek(offset = 0) {
    return this.chars[this.pos + offset];
  }

  /** @returns {string|undefined} the character at the cursor, consumed */
  next() {
    return this.chars[this.pos++];
  }

  /** @returns {boolean} whether the whole pattern has been read */
  atEnd() {
    return this.pos >= this.chars.length;
  }
}
