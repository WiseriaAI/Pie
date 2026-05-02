import { describe, expect, it } from "vitest";
import { chromeMock } from "@/test/setup";
import {
  createSession,
  getSessionAgent,
  getSessionMeta,
  setPendingConfirm,
  setSessionAgent,
  setSessionMeta,
} from "@/lib/sessions/storage";
import { detectAndMarkPaused } from "./session-recovery";

// detectAndMarkPaused is the SW-side cold-start recovery routine.
// Its three-step ordering (markFailed-then-scrub for sessions with
// pendingConfirm; mark-paused for the remaining stepIndex>0 sessions;
// bump the recoveryGuard) is the M1-U5 invariant — these tests pin
// each step + the order between them.

const samplePending = {
  confirmationId: "c1",
  kind: "agent-tool" as const,
  payload: { tool: "click", args: {}, resolvedElement: { text: "", tag: "" }, riskReason: "x" },
};

describe("detectAndMarkPaused — happy paths", () => {
  it("transitions an in-flight session (stepIndex>0) to paused", async () => {
    const meta = await createSession({ now: 1000 });
    await setSessionAgent(meta.id, {
      agentMessages: [{ role: "user", content: "task" }],
      stepIndex: 3,
      skillExecutionScopeStack: [],
    });

    const stats = await detectAndMarkPaused({ now: 5000, skipGuard: true });

    expect(stats.paused).toBe(1);
    expect(stats.failed).toBe(0);
    const refreshed = await getSessionMeta(meta.id);
    expect(refreshed!.status).toBe("paused");
  });

  it("transitions a session with pendingConfirm to failed (resolver dead post-restart)", async () => {
    const meta = await createSession();
    await setSessionAgent(meta.id, {
      agentMessages: [{ role: "user", content: "task" }],
      stepIndex: 2,
      skillExecutionScopeStack: [],
    });
    await setPendingConfirm(meta.id, samplePending);

    const stats = await detectAndMarkPaused({ skipGuard: true });

    expect(stats.failed).toBe(1);
    expect(stats.paused).toBe(0);
    const refreshed = await getSessionMeta(meta.id);
    expect(refreshed!.status).toBe("failed");
    // Scrub happened — pendingConfirm cleared.
    const agent = await getSessionAgent(meta.id);
    expect(agent!.pendingConfirm).toBeUndefined();
  });

  it("leaves a tombstone session (stepIndex=0) alone", async () => {
    const meta = await createSession();
    // Default agent state has stepIndex=0 — the tombstone shape M1-U3
    // writes when a task is done.
    const stats = await detectAndMarkPaused({ skipGuard: true });

    expect(stats.paused).toBe(0);
    expect(stats.failed).toBe(0);
    const refreshed = await getSessionMeta(meta.id);
    expect(refreshed!.status).toBe("active");
  });

  it("step ordering: markFailed runs BEFORE markPaused (no double-mark)", async () => {
    // Session A: in-flight (stepIndex=3, no pending) → should be paused.
    // Session B: in-flight + pending confirm → should be failed.
    // The Step 1 scan must mark B as failed FIRST so the Step 2 scan
    // sees it as `failed` and skips it. Otherwise Step 2 might
    // overwrite B's status to `paused`.
    const a = await createSession();
    const b = await createSession();
    await setSessionAgent(a.id, {
      agentMessages: [{ role: "user", content: "task-a" }],
      stepIndex: 3,
      skillExecutionScopeStack: [],
    });
    await setSessionAgent(b.id, {
      agentMessages: [{ role: "user", content: "task-b" }],
      stepIndex: 5,
      skillExecutionScopeStack: [],
    });
    await setPendingConfirm(b.id, samplePending);

    const stats = await detectAndMarkPaused({ skipGuard: true });

    expect(stats.paused).toBe(1);
    expect(stats.failed).toBe(1);
    expect((await getSessionMeta(a.id))!.status).toBe("paused");
    expect((await getSessionMeta(b.id))!.status).toBe("failed");
  });
});

describe("detectAndMarkPaused — recoveryGuard", () => {
  it("skips re-entry within the 30s guard window", async () => {
    const meta = await createSession();
    await setSessionAgent(meta.id, {
      agentMessages: [{ role: "user", content: "task" }],
      stepIndex: 2,
      skillExecutionScopeStack: [],
    });

    const first = await detectAndMarkPaused({ now: 1000 });
    expect(first.paused).toBe(1);
    expect(first.skippedDueToGuard).toBe(false);

    // Rewind/restore the session as if it never got marked, then call
    // again 5 seconds later. The guard should skip even though there's
    // an "in-flight" session ready to mark.
    await setSessionMeta({
      ...(await getSessionMeta(meta.id))!,
      status: "active",
    });

    const second = await detectAndMarkPaused({ now: 6000 });
    expect(second.skippedDueToGuard).toBe(true);
    expect(second.paused).toBe(0);
    // Status not touched.
    expect((await getSessionMeta(meta.id))!.status).toBe("active");
  });

  it("does NOT skip past the 30s guard window", async () => {
    const meta = await createSession();
    await setSessionAgent(meta.id, {
      agentMessages: [{ role: "user", content: "task" }],
      stepIndex: 2,
      skillExecutionScopeStack: [],
    });

    const first = await detectAndMarkPaused({ now: 1000 });
    expect(first.paused).toBe(1);

    await setSessionMeta({
      ...(await getSessionMeta(meta.id))!,
      status: "active",
    });

    // 31 seconds later — guard expired.
    const second = await detectAndMarkPaused({ now: 32_000 });
    expect(second.skippedDueToGuard).toBe(false);
    expect(second.paused).toBe(1);
    expect((await getSessionMeta(meta.id))!.status).toBe("paused");
  });

  it("skipGuard: true bypasses the window (used by tests + first-install)", async () => {
    const meta = await createSession();
    await setSessionAgent(meta.id, {
      agentMessages: [{ role: "user", content: "task" }],
      stepIndex: 2,
      skillExecutionScopeStack: [],
    });

    await detectAndMarkPaused({ now: 1000 });
    await setSessionMeta({
      ...(await getSessionMeta(meta.id))!,
      status: "active",
    });
    const second = await detectAndMarkPaused({ now: 1500, skipGuard: true });
    expect(second.skippedDueToGuard).toBe(false);
    expect(second.paused).toBe(1);
  });
});

describe("detectAndMarkPaused — guard storage", () => {
  it("writes recovery_guard timestamp to its own key (NOT inside SessionMeta)", async () => {
    await createSession();
    await detectAndMarkPaused({ now: 12345, skipGuard: true });
    const guard = chromeMock.storage.local.__store.recovery_guard;
    expect(guard).toBe(12345);
  });
});
