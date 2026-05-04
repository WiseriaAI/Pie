import { describe, it, expect } from "vitest";
import { validateInputBounds, computeTargetSize, MAX_OUTPUT_EDGE_PX } from "./validate";

describe("validateInputBounds", () => {
  it("accepts a normal upload", () => {
    expect(validateInputBounds({ byteLength: 5_000_000, mediaType: "image/jpeg" }))
      .toEqual({ ok: true });
  });
  it("rejects > 25 MB byte size", () => {
    const r = validateInputBounds({ byteLength: 26_000_000, mediaType: "image/jpeg" });
    expect(r).toEqual({ ok: false, reason: "byte-too-large" });
  });
  it("rejects unsupported mime type", () => {
    expect(validateInputBounds({ byteLength: 100, mediaType: "image/svg+xml" }))
      .toEqual({ ok: false, reason: "unsupported-mime-type" });
  });
  it("accepts each supported mime", () => {
    for (const mt of ["image/jpeg", "image/png", "image/webp", "image/gif"] as const) {
      expect(validateInputBounds({ byteLength: 100, mediaType: mt }).ok).toBe(true);
    }
  });
});

describe("computeTargetSize", () => {
  it("uses MAX_OUTPUT_EDGE_PX = 1568 (R2 default)", () => {
    expect(MAX_OUTPUT_EDGE_PX).toBe(1568);
  });
  it("downscales landscape to fit max-edge", () => {
    expect(computeTargetSize(3000, 2000)).toEqual({ width: 1568, height: 1045 });
  });
  it("downscales portrait", () => {
    expect(computeTargetSize(2000, 3000)).toEqual({ width: 1045, height: 1568 });
  });
  it("passes through smaller-than-max images", () => {
    expect(computeTargetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
