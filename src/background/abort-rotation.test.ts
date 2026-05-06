import { describe, expect, it, vi } from "vitest";
import {
  createAbortRotation,
  rotateAbortController,
} from "./abort-rotation";

describe("abort-rotation", () => {
  it("createAbortRotation starts with an unaborted controller", () => {
    const rotation = createAbortRotation();
    expect(rotation.current.signal.aborted).toBe(false);
  });

  it("rotate replaces the controller after a Stop / abort cycle (Issue #24 Bug 1)", () => {
    // The bug: a `const` AbortController, once aborted by chat-abort, stays
    // aborted forever. The next chat-start would inherit the aborted signal
    // and runAgentLoop would bail at line 887. Rotation must hand back a
    // fresh, unaborted controller.
    const rotation = createAbortRotation();
    const drain = vi.fn();

    // Simulate Stop button: abort the current controller.
    rotation.current.abort();
    expect(rotation.current.signal.aborted).toBe(true);

    // Next chat-start dispatches via rotate — the new controller must be
    // unaborted so the loop runs the new task.
    rotateAbortController(rotation, drain);
    expect(rotation.current.signal.aborted).toBe(false);
    // Already-aborted prior — nothing to drain.
    expect(drain).not.toHaveBeenCalled();
  });

  it("rotate aborts a still-running prior controller and fires drain (panel-desync defense)", () => {
    // Defense-in-depth: panel `streaming` guard normally prevents stacked
    // chat-starts, but if it ever desyncs, rotate must abort the prior
    // task's controller AND drain pending agent-confirm resolvers so the
    // K-10 fatigue counter doesn't see them as user-rejects.
    const rotation = createAbortRotation();
    const prior = rotation.current;
    const drain = vi.fn();

    rotateAbortController(rotation, drain);

    expect(prior.signal.aborted).toBe(true);
    expect(drain).toHaveBeenCalledTimes(1);
    expect(rotation.current).not.toBe(prior);
    expect(rotation.current.signal.aborted).toBe(false);
  });

  it("rotate yields a controller distinct from the prior reference", () => {
    // Callers (handleChatStream, handleResumeRequest) close over the
    // specific controller instance they were dispatched with. Rotation
    // must not mutate that instance in place; it must hand back a new
    // object so the prior instance's signal state is preserved for the
    // in-flight call's finally / signal.aborted checks.
    const rotation = createAbortRotation();
    const first = rotation.current;
    rotateAbortController(rotation, () => {});
    const second = rotation.current;
    rotateAbortController(rotation, () => {});

    expect(first).not.toBe(second);
    expect(second).not.toBe(rotation.current);
  });
});
