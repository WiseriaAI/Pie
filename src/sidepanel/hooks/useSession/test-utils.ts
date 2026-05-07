import { chromeMock } from "@/test/setup";
import type { FakePort } from "@/test/setup";

export type { FakePort };

export function lastConnectedPort() {
  return chromeMock.runtime.__ports.at(-1)!;
}

export function simulateMessage(port: unknown, msg: Record<string, unknown>) {
  const portTyped = port as FakePort;
  if (portTyped.__onMessageListeners.length > 0) {
    portTyped.__onMessageListeners[portTyped.__onMessageListeners.length - 1]!(msg);
  }
}
