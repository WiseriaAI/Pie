import { describe, it, expect, beforeEach, vi } from "vitest";
import { cleanupLegacySkipPermissions } from "./cleanup-migration";

describe("skip_permissions_enabled storage cleanup", () => {
  beforeEach(() => {
    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
    } as any;
  });

  it("removes legacy skip_permissions_enabled key on startup", async () => {
    await cleanupLegacySkipPermissions();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith("skip_permissions_enabled");
  });
});
