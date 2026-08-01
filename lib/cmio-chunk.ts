// Shared chunker for the CMIO Review pipeline. Splits a transcript into
// ~character-sized windows on line ("\n") boundaries — never mid-line, since
// a speaker turn shouldn't be cut in half — with no overlap between chunks.
//
// Both app/api/cmio-review/route.ts (which decides chunks_total at job
// creation) and app/api/cmio-review/step/route.ts (which re-derives the
// chunk to process on each call) call this SAME function on the SAME
// transcript, so the chunking must be a pure, deterministic function of its
// input with no external state.

const TARGET_CHUNK_SIZE = 6000;
// A pathological transcript (e.g. one giant line, or thousands of tiny
// lines) shouldn't be able to spin up hundreds of job-steps. If the target
// size would produce more than this many chunks, we grow the window instead.
const MAX_CHUNKS = 40;

function splitIntoChunks(text: string, targetSize: number): string[] {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const line of lines) {
    const lineLen = line.length + 1; // +1 for the "\n" that joins lines back together
    if (current.length > 0 && currentLen + lineLen > targetSize) {
      chunks.push(current.join("\n"));
      current = [];
      currentLen = 0;
    }
    current.push(line);
    currentLen += lineLen;
  }
  if (current.length > 0) {
    chunks.push(current.join("\n"));
  }
  return chunks;
}

/** Splits a transcript into ordered, non-overlapping chunks (always at least one). */
export function chunkTranscript(text: string): string[] {
  const normalized = text ?? "";
  let chunks = splitIntoChunks(normalized, TARGET_CHUNK_SIZE);

  if (chunks.length > MAX_CHUNKS) {
    // Grow the window so the whole transcript fits within MAX_CHUNKS, then
    // rebuild once with the larger target.
    const targetSize = Math.max(TARGET_CHUNK_SIZE, Math.ceil(normalized.length / MAX_CHUNKS));
    chunks = splitIntoChunks(normalized, targetSize);

    // A handful of individually oversized lines (each forced into its own
    // chunk regardless of target size) can still push the count over the
    // cap — merge any excess trailing chunks together as a last resort.
    if (chunks.length > MAX_CHUNKS) {
      const head = chunks.slice(0, MAX_CHUNKS - 1);
      const tail = chunks.slice(MAX_CHUNKS - 1).join("\n");
      chunks = [...head, tail];
    }
  }

  return chunks.length > 0 ? chunks : [""];
}
