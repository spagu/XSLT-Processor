/**
 * Streaming Output
 *
 * Serializes a transformation result as a WHATWG `ReadableStream<string>`.
 * XSLT 1.0 builds the result tree in memory (templates can read anything
 * they wrote into variables, and the whole source tree), so the tree is built
 * first; what streams is the serialization: chunks are produced on demand
 * (`pull`), one at a time, so the output is never held as one string and a
 * consumer that reads slowly holds serialization back (backpressure).
 *
 * @module async/stream
 */

import { serializeChunks } from "../xslt/serializer.js";
import { throwIfAborted } from "./abort.js";

/**
 * Serialize the transformation of a source node in chunks, as
 * `engine.transformToString` does in one piece.
 *
 * @param {import('../xslt/engine.js').XsltEngine|import('../bridge/engine.js').Xslt3Engine} engine -
 *   Engine with an imported stylesheet
 * @param {Node} sourceNode - Source document or element
 * @param {{chunkSize?: number}} [options] - Chunk size in UTF-16 code units
 * @returns {Iterator<string>} The chunks; the result tree is built by this
 *   call, serialization happens as the iterator is consumed
 *
 * @example
 * for (const chunk of transformToChunks(engine, xmlDoc)) out.write(chunk);
 */
export function transformToChunks(engine, sourceNode, options = {}) {
  // The @tradik/xslt3 engine (xsltVersion "auto") serializes on its own
  if (engine.transformToChunks) {
    return engine.transformToChunks(sourceNode, options);
  }
  const fragment = engine.buildResultTree(
    sourceNode,
    engine.createDocument(sourceNode),
  );
  return serializeChunks(fragment, engine.outputSettings, options);
}

/**
 * Expose lazily produced chunks as a ReadableStream.
 *
 * @param {() => (Iterator<string>|Promise<Iterator<string>>)} start - Called
 *   once, on the first pull, to produce the chunk iterator (may be async, e.g.
 *   to read the input first)
 * @param {{signal?: AbortSignal}} [options] - Aborting errors the stream with
 *   the abort reason and stops the serialization
 * @returns {ReadableStream<string>} The stream; errors of `start` or of the
 *   serialization error the stream
 * @throws {TypeError} When the runtime has no ReadableStream
 *
 * @example
 * const stream = chunkStream(() => serializeChunks(doc, settings));
 */
export function chunkStream(start, options = {}) {
  const { signal } = options;
  const Stream = globalThis.ReadableStream;
  if (typeof Stream !== "function") {
    throw new TypeError("ReadableStream is not available in this runtime");
  }

  let chunks = null;
  const stop = () => chunks?.return?.();
  let onAbort = null;

  return new Stream(
    {
      start(controller) {
        if (signal?.aborted) {
          controller.error(signal.reason);
          return;
        }
        onAbort = () => {
          stop();
          controller.error(signal.reason);
        };
        signal?.addEventListener("abort", onAbort, { once: true });
      },
      async pull(controller) {
        try {
          chunks ??= await start();
          throwIfAborted(signal);
          const { done, value } = chunks.next();
          if (done) {
            signal?.removeEventListener("abort", onAbort);
            controller.close();
          } else {
            controller.enqueue(value);
          }
        } catch (error) {
          signal?.removeEventListener("abort", onAbort);
          throw error;
        }
      },
      cancel() {
        signal?.removeEventListener("abort", onAbort);
        stop();
      },
    },
    { highWaterMark: 1 },
  );
}

/**
 * Transform a source node and stream the serialized result.
 *
 * @param {import('../xslt/engine.js').XsltEngine} engine - Engine with an imported stylesheet
 * @param {Node} sourceNode - Source document or element
 * @param {{signal?: AbortSignal, chunkSize?: number}} [options] - Options
 * @returns {ReadableStream<string>} The serialized result
 *
 * @example
 * const response = new Response(
 *   transformToStream(engine, xmlDoc).pipeThrough(new TextEncoderStream()),
 * );
 */
export function transformToStream(engine, sourceNode, options = {}) {
  return chunkStream(
    () => transformToChunks(engine, sourceNode, options),
    options,
  );
}
