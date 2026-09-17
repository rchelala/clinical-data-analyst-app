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
// Each chunk gets its own Claude call in app/api/cmio-review/step/route.ts,
// budgeted to finish within Netlify's function timeout — growing the chunk
// size for long transcripts (as this used to do, up to ~10k chars) risked
// that budget. Chunk size is capped at TARGET_CHUNK_SIZE instead; transcripts
// just get more, evenly-sized chunks. The app's transcript cap is 400,000
// chars (see app/api/cmio-review/route.ts), which is ceil(400000 / 6000) =
// 67 chunks at this size — MAX_CHUNKS gives that comfortable headroom while
// still bounding a pathological transcript (e.g. thousands of tiny lines)
// from spinning up an unbounded number of job-steps.
const MAX_CHUNKS = 100;

// Splits one line into pieces no longer than `maxLen`, breaking at the last
// whitespace before the limit so words aren't cut mid-word when possible;
// falls back to a hard break when a single "word" itself exceeds maxLen.
// Without this, one oversized line (e.g. a wall-of-text transcript export
// with no line breaks) would become its own oversized chunk, regardless of
// TARGET_CHUNK_SIZE.
function splitLongLine(line: string, maxLen: number): string[] {
  if (line.length <= maxLen) return [line];
  const pieces: string[] = [];
  let rest = line;
  while (rest.length > maxLen) {
    let breakAt = rest.lastIndexOf(" ", maxLen);
    if (breakAt <= 0) breakAt = maxLen; // no whitespace to break on — hard split
    pieces.push(rest.slice(0, breakAt));
    rest = rest.slice(breakAt).replace(/^ /, "");
  }
  if (rest.length > 0) pieces.push(rest);
  return pieces;
}

function splitIntoChunks(text: string, targetSize: number): string[] {
  const lines = text.split("\n").flatMap((line) => splitLongLine(line, targetSize));
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
  const chunks = splitIntoChunks(normalized, TARGET_CHUNK_SIZE);

  if (chunks.length > MAX_CHUNKS) {
    // Shouldn't happen for any input within the app's transcript cap (see
    // above) — defense in depth if that cap is ever raised without updating
    // this file. Merge the excess trailing chunks together as a last resort
    // rather than growing chunk size, which would risk the per-chunk LLM
    // call no longer finishing within Netlify's function timeout.
    const head = chunks.slice(0, MAX_CHUNKS - 1);
    const tail = chunks.slice(MAX_CHUNKS - 1).join("\n");
    return [...head, tail];
  }

  return chunks.length > 0 ? chunks : [""];
}
