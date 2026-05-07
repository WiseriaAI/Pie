import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("SW keep-alive — scoped to in-flight tasks (#30)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ensureKeepAlive starts the interval; maybeStopKeepAlive clears it when no in-flight", async () => {
    const { createKeepAlive } = await import("./keep-alive");
    const tick = vi.fn();
    const inFlight = new Set<string>();
    const ka = createKeepAlive({ tick, inFlight, intervalMs: 1000 });

    // No interval yet
    vi.advanceTimersByTime(2000);
    expect(tick).not.toHaveBeenCalled();

    // Start: interval runs while in-flight
    inFlight.add("s1");
    ka.ensure();
    vi.advanceTimersByTime(2000);
    expect(tick).toHaveBeenCalledTimes(2);

    // Drop session, but try to stop while another is in-flight: still runs
    inFlight.add("s2");
    inFlight.delete("s1");
    ka.maybeStop();
    vi.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(3);

    // Drop last session; maybeStop should now clear
    inFlight.delete("s2");
    ka.maybeStop();
    vi.advanceTimersByTime(2000);
    expect(tick).toHaveBeenCalledTimes(3); // unchanged — interval cleared

    // Re-arm via ensure
    inFlight.add("s3");
    ka.ensure();
    vi.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(4);

    // Cleanup
    ka.stop();
  });

  it("ensure is idempotent — does not stack intervals", () => {
    return import("./keep-alive").then(({ createKeepAlive }) => {
      const tick = vi.fn();
      const inFlight = new Set<string>(["s1"]);
      const ka = createKeepAlive({ tick, inFlight, intervalMs: 1000 });
      ka.ensure();
      ka.ensure();
      ka.ensure();
      vi.advanceTimersByTime(1000);
      expect(tick).toHaveBeenCalledTimes(1);
      ka.stop();
    });
  });
});
