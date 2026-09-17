// Shared chunker for the CMIO Review pipeline. Splits a transcript into
// ~character-sized windows on line ("\n") boundaries, splitting a line only
// when that single line itself exceeds the target chunk size (at the last
// run of whitespace before the limit, or a hard break if it has none) — with
// no overlap between chunks.
//
// Both app/api/cmio-review/route.ts (which decides chunks_total at job
// creation, and rejects transcripts that would need more than MAX_CHUNKS) and
// app/api/cmio-review/step/route.ts (which re-derives the chunk to process on
// each call) call this SAME function on the SAME transcript, so the chunking
// must be a pure, deterministic function of its input with no external state.

const TARGET_CHUNK_SIZE = 6000;
// Each chunk gets its own Claude call in app/api/cmio-review/step/route.ts,
// budgeted to finish within Netlify's function timeout — growing the chunk
// size for long transcripts (as this used to do, up to ~10k chars) risked
// that budget. Chunk size is capped at TARGET_CHUNK_SIZE instead; transcripts
// just get more, evenly-sized chunks.
//
// MAX_CHUNKS bounds how many steps (Claude calls) a job can take. The app's
// transcript cap is 400,000 chars (see app/api/cmio-review/route.ts). For
// average-length lines, packing is efficient and gives close to
// ceil(400000 / 6000) = 67 chunks — but greedy line-packing can leave chunks
// half-full when lines are long relative to TARGET_CHUNK_SIZE: a line longer
// than TARGET_CHUNK_SIZE / 2 = 3000 chars gets a whole chunk to itself, since
// a second such line wouldn't also fit. Worst case, every line is just over
// 3000 chars: 400000 / 3001 ≈ 134 one-line chunks. MAX_CHUNKS = 140 covers
// that worst case with a small margin. Job creation
// (app/api/cmio-review/route.ts) rejects any transcript whose chunk count
// would exceed this, rather than this file silently merging/truncating
// chunks to fit.
export const MAX_CHUNKS = 140;

// Splits one line into pieces no longer than `maxLen`, breaking at the last
// run of whitespace (space, tab, etc. — not just " ") before the limit so
// words aren't cut mid-word when possible; falls back to a hard break when a
// single "word" itself exceeds maxLen. Without this, one oversized line
// (e.g. a wall-of-text transcript export with no line breaks) would become
// its own oversized chunk, regardless of TARGET_CHUNK_SIZE.
function splitLongLine(line: string, maxLen: number): string[] {
  if (line.length <= maxLen) return [line];
  const pieces: string[] = [];
  let rest = line;
  while (rest.length > maxLen) {
    const window = rest.slice(0, maxLen + 1);
    const wsMatches = [...window.matchAll(/\s/g)];
    const lastWs = wsMatches.length > 0 ? wsMatches[wsMatches.length - 1].index! : -1;
    const breakAt = lastWs > 0 ? lastWs : maxLen; // no whitespace to break on — hard split
    pieces.push(rest.slice(0, breakAt));
    rest = rest.slice(breakAt).replace(/^\s/, "");
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

/**
 * Splits a transcript into ordered, non-overlapping chunks (always at least
 * one). Does NOT enforce MAX_CHUNKS — a transcript that would need more than
 * MAX_CHUNKS chunks must be rejected at job creation
 * (app/api/cmio-review/route.ts), since merging/truncating chunks here would
 * silently drop content from whatever chunk it lands on.
 */
export function chunkTranscript(text: string): string[] {
  const normalized = text ?? "";
  const chunks = splitIntoChunks(normalized, TARGET_CHUNK_SIZE);
  return chunks.length > 0 ? chunks : [""];
}
