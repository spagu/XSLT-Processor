/**
 * What the visitor gave the online check, as sources for check-files.js:
 * the files of a file input (with their folder paths when a folder was
 * chosen) or of a drop, walking dropped folders with webkitGetAsEntry.
 *
 * @module check-drop
 */

/**
 * A source that reads a File.
 *
 * @param {File} file - The file
 * @param {string} path - Its path in the project
 * @returns {import("./check-files.js").Source} The source
 */
function fileSource(file, path) {
  return {
    path,
    size: file.size,
    read: async () => new Uint8Array(await file.arrayBuffer()),
  };
}

/**
 * The sources of a file input's list.
 *
 * @param {FileList|File[]} list - Chosen files
 * @returns {import("./check-files.js").Source[]} One source per file
 */
export function fromFileList(list) {
  return Array.from(list, (file) =>
    fileSource(file, file.webkitRelativePath || file.name),
  );
}

/**
 * Every entry left in a directory reader. readEntries returns them in
 * batches and must be called again, one call after the other, until it
 * returns an empty one; each call is a step of the recursion.
 *
 * @param {object} reader - A FileSystemDirectoryReader
 * @param {object[]} [entries] - Entries read so far
 * @returns {Promise<object[]>} The entries
 */
async function readAll(reader, entries = []) {
  const batch = await new Promise((resolve, reject) =>
    reader.readEntries(resolve, reject),
  );
  if (batch.length === 0) return entries;
  return readAll(reader, [...entries, ...batch]);
}

/**
 * The file sources below a dropped entry, skipping directories the
 * command line never scans (below the dropped folder itself).
 *
 * @param {object} entry - A FileSystemEntry
 * @param {string} path - Its path
 * @param {(name: string) => boolean} isIgnoredDir - Directory names to skip
 * @returns {Promise<import("./check-files.js").Source[]>} The sources
 */
async function walk(entry, path, isIgnoredDir) {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) =>
      entry.file(resolve, reject),
    );
    return [fileSource(file, path)];
  }
  const children = await readAll(entry.createReader());
  const nested = await Promise.all(
    children
      .filter((child) => !(child.isDirectory && isIgnoredDir(child.name)))
      .map((child) => walk(child, `${path}/${child.name}`, isIgnoredDir)),
  );
  return nested.flat();
}

/**
 * Take the dropped items out of a drop's DataTransfer. Call it in the drop
 * event handler itself: the browser empties the DataTransfer once the
 * handler returns, so entries and files cannot be taken after an await.
 *
 * @param {DataTransfer} dataTransfer - The drop's data
 * @returns {Array<{entry: object|null, file: File|null}>} Each dropped item
 *   as a file system entry (null where the browser has none) and a file
 */
export function takeDropped(dataTransfer) {
  return Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => ({
      entry: item.webkitGetAsEntry?.() ?? null,
      file: item.getAsFile(),
    }));
}

/**
 * The sources of a drop: files as they are, folders walked.
 *
 * @param {ReturnType<typeof takeDropped>} dropped - The dropped items
 * @param {(name: string) => boolean} isIgnoredDir - Directory names to skip
 * @returns {Promise<import("./check-files.js").Source[]>} The sources
 */
export async function droppedSources(dropped, isIgnoredDir) {
  const nested = await Promise.all(
    dropped.map(({ entry, file }) => {
      if (entry?.isDirectory) return walk(entry, entry.name, isIgnoredDir);
      return file ? [fileSource(file, file.name)] : [];
    }),
  );
  return nested.flat();
}
