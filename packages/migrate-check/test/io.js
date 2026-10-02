/**
 * Shared test helper: a CliIo that records what was written. Holds no
 * tests of its own.
 */

/**
 * Create a recording CliIo.
 *
 * @param {boolean} [isTTY] - Whether to pretend stdout is a terminal
 * @returns {{out: string, err: string, isTTY: boolean, write: Function,
 *   writeError: Function}} The io
 */
export function fakeIo(isTTY = false) {
  const io = { out: "", err: "", isTTY };
  io.write = (text) => {
    io.out += text;
  };
  io.writeError = (text) => {
    io.err += text;
  };
  return io;
}
