/**
 * happy-dom provides HTMLCanvasElement but the 2D context is a no-op stub.
 * We inject hand-rolled fakes for Image / canvas / FileReader so we can
 * test the orchestration logic (validate → decode → downscale → encode)
 * without bringing in vitest-canvas-mock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resizePanel } from "./resize-panel";

beforeEach(() => {
  // Fake Image with deterministic dimensions
  (globalThis as any).Image = class FakeImage {
    onload: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    set src(_v: string) {
      Promise.resolve().then(() => this.onload?.());
    }
    width = 3000;
    height = 2000;
  };
  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toBlob: (cb: (b: Blob) => void) => {
      const buf = new Uint8Array(245678);
      cb(new Blob([buf], { type: "image/jpeg" }));
    },
  };
  (globalThis as any).document = {
    createElement: (tag: string) => (tag === "canvas" ? fakeCanvas : {}),
  };
  (globalThis as any).FileReader = class FakeFileReader {
    onload: (() => void) | null = null;
    result: ArrayBuffer | string | null = null;
    readAsArrayBuffer(_b: Blob) {
      this.result = new ArrayBuffer(245678);
      Promise.resolve().then(() => this.onload?.());
    }
    readAsDataURL(_b: Blob) {
      this.result = "data:image/jpeg;base64,AAAA";
      Promise.resolve().then(() => this.onload?.());
    }
  };
});

describe("resizePanel", () => {
  it("downscales 3000x2000 to 1568x1045 jpeg", async () => {
    const file = new File([new Uint8Array(5_000_000)], "x.jpg", { type: "image/jpeg" });
    const res = await resizePanel(file);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.width).toBe(1568);
      expect(res.value.height).toBe(1045);
      expect(res.value.mediaType).toBe("image/jpeg");
      expect(res.value.byteLength).toBe(245678);
      expect(res.value.data.length).toBeGreaterThan(0);
    }
  });
  it("rejects > 25 MB file at validation step", async () => {
    const big = new File([new Uint8Array(26_000_000)], "big.jpg", { type: "image/jpeg" });
    const res = await resizePanel(big);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("byte-too-large");
  });
});
