/**
 * Wait for something that happens asynchronously: an event worker applying a change, an event
 * arriving. Retries `probe` until it returns a value other than undefined (or stops throwing),
 * instead of sleeping for a guessed time.
 */
export async function eventually<T>(
  probe: () => T | undefined | Promise<T | undefined>,
  opts: { timeoutMs?: number; intervalMs?: number; what?: string } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const intervalMs = opts.intervalMs ?? 250;
  const end = Date.now() + timeoutMs;
  let last: unknown;
  for (;;) {
    try {
      const value = await probe();
      if (value !== undefined) return value;
    } catch (e) {
      last = e;
    }
    if (Date.now() >= end) {
      const why = last instanceof Error ? `: ${last.message}` : "";
      throw new Error(`${opts.what ?? "condition"} not met within ${timeoutMs}ms${why}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
