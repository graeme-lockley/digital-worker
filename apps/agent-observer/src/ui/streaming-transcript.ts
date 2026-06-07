/** Max incomplete tail kept in Ink's dynamic (non-Static) region before flushing to Static. */
export const LIVE_TAIL_MAX_CHARS = 120;

export type StreamingDrainResult = {
  buffer: string;
  committed: string[];
};

/**
 * Append a streaming delta and return any complete lines to commit to `<Static>`.
 * Commits on newline boundaries and when the tail exceeds {@link LIVE_TAIL_MAX_CHARS}
 * so the dynamic Ink region stays small (log-update only clears a few lines).
 */
export function drainStreamingDelta(
  buffer: string,
  delta: string,
  maxTailChars = LIVE_TAIL_MAX_CHARS,
): StreamingDrainResult {
  let next = buffer + delta;
  const committed: string[] = [];

  while (next.length > 0) {
    const newlineIndex = next.indexOf("\n");
    if (newlineIndex >= 0) {
      committed.push(next.slice(0, newlineIndex));
      next = next.slice(newlineIndex + 1);
      continue;
    }

    if (next.length > maxTailChars) {
      let splitAt = next.lastIndexOf(" ", maxTailChars);
      if (splitAt <= 0) {
        splitAt = maxTailChars;
      }
      committed.push(next.slice(0, splitAt));
      next = next.slice(splitAt);
      if (next.startsWith(" ")) {
        next = next.trimStart();
      }
      continue;
    }

    break;
  }

  return { buffer: next, committed };
}

/** Flush any remaining buffered streaming text when a job segment ends. */
export function flushStreamingBuffer(buffer: string): {
  buffer: string;
  committed: string[];
} {
  const trimmed = buffer.trimEnd();
  if (trimmed.length === 0) {
    return { buffer: "", committed: [] };
  }
  return { buffer: "", committed: [trimmed] };
}
