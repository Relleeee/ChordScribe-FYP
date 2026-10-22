/** Parse a newline-delimited JSON byte stream, one value per line. */
export async function* readNdjson<T>(stream: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield JSON.parse(line) as T;
    }
    if (done) break;
  }
  if (buffer.trim()) yield JSON.parse(buffer) as T;
}

/** Encode values as an NDJSON byte stream — the writer side of `readNdjson`. */
export function ndjsonStream<T>(source: AsyncIterable<T>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const it = source[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await it.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
    },
    async cancel() {
      await it.return?.();
    },
  });
}
