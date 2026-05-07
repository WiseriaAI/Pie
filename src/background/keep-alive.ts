/**
 * Per-port keep-alive controller (#30). MV3 service workers idle out
 * after ~30s of no activity; while a task is in flight we ping
 * `chrome.runtime.getPlatformInfo()` every 25s to keep the SW alive.
 * When no tasks are in flight (all done / aborted), we stop the
 * interval so the SW can idle out naturally.
 *
 * Scope: ONE controller per port (mirrors the existing per-port closure
 * in chrome.runtime.onConnect). The `inFlight` Set is the port's
 * inFlightSessionIds — controller queries it inside maybeStop().
 */
export interface KeepAlive {
  /** Start the interval if not already running. Idempotent. */
  ensure: () => void;
  /** Stop the interval if and only if `inFlight.size === 0`. */
  maybeStop: () => void;
  /** Unconditionally stop. Called on port disconnect. */
  stop: () => void;
}

export function createKeepAlive(deps: {
  tick: () => void;
  inFlight: { size: number };
  intervalMs?: number;
}): KeepAlive {
  const intervalMs = deps.intervalMs ?? 25_000;
  let handle: ReturnType<typeof setInterval> | null = null;
  return {
    ensure() {
      if (handle !== null) return;
      handle = setInterval(deps.tick, intervalMs);
    },
    maybeStop() {
      if (deps.inFlight.size > 0) return;
      if (handle === null) return;
      clearInterval(handle);
      handle = null;
    },
    stop() {
      if (handle === null) return;
      clearInterval(handle);
      handle = null;
    },
  };
}
