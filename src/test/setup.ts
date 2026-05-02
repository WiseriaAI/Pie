import { beforeEach, vi } from "vitest";

// chrome.storage.local mock — backed by a single in-memory record reset
// between tests. Mirrors the subset of chrome.storage.local API actually
// used by src/lib/sessions/storage.ts and other M1+ surfaces:
//   - get(key | string[] | null)  → returns { [key]: value }
//   - set(items)                  → atomic batch; setting value=undefined removes
//   - remove(key | string[])      → bulk remove
//   - getBytesInUse(key | null)   → JSON-length approximation (real Chrome counts
//                                   utf-16 lengths; our approximation is good
//                                   enough for quota-threshold tests, which is the
//                                   only thing we're checking)
//
// `__store` is exposed for tests that want to seed state directly without going
// through the public API.

interface StorageRecord {
  [key: string]: unknown;
}

const local = {
  __store: {} as StorageRecord,

  get(
    keys?: string | string[] | null,
  ): Promise<Record<string, unknown>> {
    if (keys === null || keys === undefined) {
      return Promise.resolve({ ...local.__store });
    }
    if (typeof keys === "string") {
      return Promise.resolve(
        keys in local.__store ? { [keys]: local.__store[keys] } : {},
      );
    }
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      if (k in local.__store) out[k] = local.__store[k];
    }
    return Promise.resolve(out);
  },

  set(items: Record<string, unknown>): Promise<void> {
    for (const [k, v] of Object.entries(items)) {
      if (v === undefined) {
        delete local.__store[k];
      } else {
        local.__store[k] = v;
      }
    }
    return Promise.resolve();
  },

  remove(keys: string | string[]): Promise<void> {
    const arr = typeof keys === "string" ? [keys] : keys;
    for (const k of arr) delete local.__store[k];
    return Promise.resolve();
  },

  getBytesInUse(keys?: string | string[] | null): Promise<number> {
    let total = 0;
    const targets =
      keys === null || keys === undefined
        ? Object.keys(local.__store)
        : typeof keys === "string"
          ? [keys]
          : keys;
    for (const k of targets) {
      if (!(k in local.__store)) continue;
      total += k.length + JSON.stringify(local.__store[k]).length;
    }
    return Promise.resolve(total);
  },

  clear(): Promise<void> {
    local.__store = {};
    return Promise.resolve();
  },
};

const chromeMock = {
  storage: { local },
  runtime: {
    // Stubs for surfaces that storage.ts doesn't touch but other M1+ code might
    // pull in transitively. Tests that need real behavior should override.
    getPlatformInfo: vi.fn().mockResolvedValue({ os: "mac" }),
    onStartup: { addListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
    onConnect: { addListener: vi.fn() },
  },
};

// Install on globalThis so `chrome.storage.local.get(...)` works in src code.
// Cast through unknown to avoid clashing with the official @types/chrome shape.
(globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;

beforeEach(() => {
  local.__store = {};
});

export { chromeMock };
