import { describe, expect, it } from "vitest";
import { ndjsonStream, readNdjson } from "./ndjson";

/** A byte stream delivered in the given chunks — network packets split anywhere. */
function chunked(text: string, sizes: number[]): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  const parts: Uint8Array[] = [];
  let at = 0;
  for (const n of sizes) {
    parts.push(bytes.slice(at, at + n));
    at += n;
  }
  if (at < bytes.length) parts.push(bytes.slice(at));
  return new ReadableStream({
    start(c) {
      parts.forEach((p) => c.enqueue(p));
      c.close();
    },
  });
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of it) out.push(v);
  return out;
}

describe("readNdjson", () => {
  it("reassembles lines split across chunks, including multi-byte characters", async () => {
    const text = '{"stage":"fetch"}\n{"label":"F♯m"}\n\n{"n":3}';
    const values = await collect(readNdjson(chunked(text, [5, 13, 9, 1, 2])));
    expect(values).toEqual([{ stage: "fetch" }, { label: "F♯m" }, { n: 3 }]);
  });
});

describe("ndjsonStream", () => {
  it("round-trips through readNdjson", async () => {
    async function* source() {
      yield { type: "stage", stage: "chords" };
      yield { type: "result", ok: true };
    }
    expect(await collect(readNdjson(ndjsonStream(source())))).toEqual([
      { type: "stage", stage: "chords" },
      { type: "result", ok: true },
    ]);
  });
});
