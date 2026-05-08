import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSession } from "@/sidepanel/hooks/useSession";
import { chromeMock } from "@/test/setup";
import { getSessionMeta } from "@/lib/sessions/storage";

/**
 * Cross-layer regression (#30 + memory feedback_cross_layer_integration_tests):
 * verify the agent-done-task wire transit lands at the panel's
 * DisplayMessage[] correctly even when the session is backgrounded at
 * the moment the SW emits.
 */
describe("cross-layer: concurrent agent-done-task transit (#30)", () => {
  it("SW-emitted agent-done-task on a backgrounded session lands in messages on switch-back", async () => {
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.ready).toBe(true));
    const idA = result.current.sessionId!;
    const portA = chromeMock.runtime.__ports.at(-1)!;

    // User starts a task on A (simulate sendMessage flow)
    act(() => {
      result.current.sendMessage({ content: "do thing" });
    });
    // chat-start was posted with sessionId: idA
    expect(portA.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "chat-start", sessionId: idA }),
    );

    // User switches to a freshly created session B
    let idB: string | null = null;
    await act(async () => {
      idB = await result.current.createAndActivate();
    });

    // SW emits agent-done-task with the EXACT payload shape produced by
    // loop.ts emitDone
    act(() => {
      portA.__emit({
        type: "agent-done-task",
        sessionId: idA,
        success: true,
        summary: "task complete",
        stepCount: 5,
      } as never);
    });

    // Active session is B — its messages should not contain the summary
    expect(
      result.current.messages.some((m: any) => m.role === "agent-summary"),
    ).toBe(false);

    // Wait for async persist to land before setActive re-hydrates
    await waitFor(async () => {
      const meta = await getSessionMeta(idA);
      expect(meta?.messages.at(-1)).toMatchObject({ role: "agent-summary" });
    });

    // Switch back to A — derive view from slots
    await act(async () => {
      await result.current.setActive(idA);
    });

    // Wire→DisplayMessage transit: agent-done-task emitted by SW
    // arrives as agent-summary DisplayMessage at the tail of messages.
    const tail = result.current.messages[result.current.messages.length - 1];
    expect(tail).toEqual({
      role: "agent-summary",
      success: true,
      summary: "task complete",
      stepCount: 5,
    });
    expect(result.current.streaming).toBe(false);
  });

  it("SW-emitted agent-confirm-request on a backgrounded session is recoverable", async () => {
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.ready).toBe(true));
    const idA = result.current.sessionId!;
    const portA = chromeMock.runtime.__ports.at(-1)!;

    // Start a task on A so streaming=true before the confirm arrives
    act(() => {
      result.current.sendMessage({ content: "start task" });
    });
    expect(result.current.streaming).toBe(true);

    // SW emits confirm-request on A mid-task
    act(() => {
      portA.__emit({
        type: "agent-confirm-request",
        sessionId: idA,
        confirmationId: "cx",
        tool: "click",
        args: { selector: "#submit" },
        riskReason: "submit-button",
      } as never);
    });

    // Switch away to new session B (A is backgrounded but still streaming)
    await act(async () => {
      await result.current.createAndActivate();
    });

    // Switch back — slot preserved because streaming=true
    await act(async () => {
      await result.current.setActive(idA);
    });

    const card = result.current.messages.find(
      (m: any) => m.role === "agent-confirm" && m.confirmationId === "cx",
    );
    expect(card).toBeDefined();
    expect(card).toMatchObject({ tool: "click", riskReason: "submit-button" });
  });
});
