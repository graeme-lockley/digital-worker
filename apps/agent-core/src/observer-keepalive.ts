/** SSE comment interval for idle observer connections. */
export const OBSERVER_SSE_PING_INTERVAL_MS = 15_000;

export const OBSERVER_SSE_PING_COMMENT = ": ping\n\n";

export function startObserverKeepalive(
  write: (chunk: string) => Promise<void>,
  intervalMs: number,
  signal: AbortSignal,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (): void => {
    timer = setTimeout(() => {
      void write(OBSERVER_SSE_PING_COMMENT)
        .then(schedule)
        .catch(() => {
          // client disconnected; abort will clean up
        });
    }, intervalMs);
  };

  schedule();

  const stop = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  signal.addEventListener("abort", stop, { once: true });

  return () => {
    signal.removeEventListener("abort", stop);
    stop();
  };
}
