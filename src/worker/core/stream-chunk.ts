// ============================================================
// Stream chunking — split an already-generated reply into pieces
// for a typewriter-style delivery, WITHOUT re-calling the model.
// ------------------------------------------------------------
// Background: the final-answer branch used to throw away the answer
// the agent loop had already produced (finalContent) and re-call the
// LLM with a history that did NOT contain that answer, streaming the
// second call's tokens straight into channel.stream. When the second
// call yielded no usable prose (empty content, or DSML tool-call
// markup stripped to nothing) the channel received zero appends and
// its terminal handler wrote the placeholder "(no content)". These
// helpers let the runtime stream the ALREADY-GENERATED text locally
// instead, so what the log records and what Feishu receives are
// guaranteed to be the same string.
// ============================================================

/** Default upper bound on a single streamed piece (characters). */
const DEFAULT_MAX_CHARS = 40;

/** Promise-based sleep. Injected into streamTextInChunks by callers so the
 *  coordinator stays pure and unit-testable without real timers. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Split `text` into pieces no longer than `maxChars`, preferring line
 *  boundaries so a markdown table streams roughly row-by-row.
 *
 *  Invariant: `chunkMarkdownForStream(text).join('') === text` for every
 *  non-empty `text` (empty text → []). The runtime relies on this — the
 *  streamed concatenation must reproduce the source exactly.
 *
 *  Pure. */
export function chunkMarkdownForStream(
  text: string,
  maxChars: number = DEFAULT_MAX_CHARS
): string[] {
  if (!text) return [];
  const pieces: string[] = [];
  const lines = text.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const isLast = li === lines.length - 1;

    if (line.length <= maxChars) {
      pieces.push(isLast ? line : line + '\n');
    } else {
      for (let i = 0; i < line.length; i += maxChars) {
        pieces.push(line.slice(i, i + maxChars));
      }
      if (!isLast) pieces.push('\n');
    }
  }
  return pieces;
}

/** Drive an `append` sink piece-by-piece with an optional `sleep` between
 *  pieces, simulating a typewriter stream from text that is already in hand.
 *
 *  - The concatenation of every chunk passed to `append` equals `text`.
 *  - `sleep` runs BETWEEN pieces (never after the last one) and only when
 *    `delayMs > 0`, so the fast path (delayMs 0) never awaits a timer.
 *  - An `append` rejection propagates to the caller (the runtime wraps this
 *    in a channel.stream whose outer try/catch falls back to a plain send).
 *
 *  Both `append` and `sleep` are injected, so this is pure and testable. */
export async function streamTextInChunks(
  text: string,
  append: (chunk: string) => Promise<void>,
  doSleep: (ms: number) => Promise<void>,
  opts: { maxChars?: number; delayMs?: number } = {}
): Promise<void> {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const delayMs = opts.delayMs ?? 20;
  const pieces = chunkMarkdownForStream(text, maxChars);
  for (let i = 0; i < pieces.length; i++) {
    await append(pieces[i]);
    if (delayMs > 0 && i < pieces.length - 1) {
      await doSleep(delayMs);
    }
  }
}
