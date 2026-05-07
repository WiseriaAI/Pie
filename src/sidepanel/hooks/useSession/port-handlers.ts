import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { DisplayMessage, PortMessageToPanel } from "@/types";
import { withSlot, type SessionRuntimeSlot } from "./runtime-map";

export interface CreatePortHandlersDeps {
  slotsRef: MutableRefObject<Map<string, SessionRuntimeSlot>>;
  setSlots: Dispatch<SetStateAction<Map<string, SessionRuntimeSlot>>>;
  persistMessages: (sessionId: string, messages: DisplayMessage[]) => Promise<void>;
}

export interface PortHandlers {
  /** Single instance, attached to every port. Routes by `message.sessionId`. */
  handleMessage: (msg: PortMessageToPanel) => void;
  /** Per-port closure capturing sessionId. Created fresh in connectPortFor. */
  makeDisconnectHandler: (sessionId: string) => () => void;
}

export function createPortHandlers(deps: CreatePortHandlersDeps): PortHandlers {
  const { slotsRef, setSlots, persistMessages } = deps;

  /** Sync write to slotsRef (Bug-fix-A truth source) + setSlots for React commit. */
  function patchSlot(
    id: string,
    patch:
      | Partial<SessionRuntimeSlot>
      | ((s: SessionRuntimeSlot) => Partial<SessionRuntimeSlot>),
  ) {
    slotsRef.current = withSlot(slotsRef.current, id, patch);
    setSlots(slotsRef.current);
  }

  const handleMessage = (msg: PortMessageToPanel) => {
    const id = msg.sessionId;

    if (msg.type === "chat-chunk") {
      patchSlot(id, (prev) => {
        const accumulated = prev.accumulated + msg.text;
        return { accumulated, streamingText: accumulated };
      });
      return;
    }
    if (msg.type === "chat-done") {
      const prev = slotsRef.current.get(id);
      const accumulated = prev?.accumulated ?? "";
      const baseMessages = prev?.messages ?? [];
      const next: DisplayMessage[] = accumulated.trim()
        ? [...baseMessages, { role: "assistant", content: accumulated }]
        : baseMessages;
      patchSlot(id, {
        messages: next,
        accumulated: "",
        streamingText: "",
        streaming: false,
        streamFinished: true,
      });
      void persistMessages(id, next);
      return;
    }

    // Subsequent branches added in Tasks 2b–2g.
  };

  const makeDisconnectHandler = (_sessionId: string) => {
    return () => {
      // Implemented in Task 2h.
    };
  };

  return { handleMessage, makeDisconnectHandler };
}
