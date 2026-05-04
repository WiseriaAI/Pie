import { describe, it, expect, beforeEach } from "vitest";
import {
  setPreCapture, consumePreCapture, discardPreCapture, _resetForTests,
  PRE_CAPTURE_STALE_MS,
} from "./screenshot-precapture";

const okOutcome = {
  ok: true as const,
  value: {
    kind: "image" as const, id: "i1", mediaType: "image/jpeg" as const,
    data: "AAAA", width: 100, height: 100, byteLength: 3,
  },
};

const failOutcome = {
  ok: false as const,
  reason: "capture-failed" as const,
};

beforeEach(() => _resetForTests());

describe("screenshot-precapture", () => {
  it("returns hit:false when no entry", () => {
    expect(consumePreCapture("c1")).toEqual({ hit: false });
  });

  it("returns image when consumed within 5 s", () => {
    setPreCapture("c1", okOutcome);
    const r = consumePreCapture("c1", Date.now() + 1_000);
    expect(r).toEqual({ hit: true, stale: false, image: okOutcome.value });
  });

  it("returns stale=true when consumed > 5 s after pre-capture", () => {
    setPreCapture("c1", okOutcome);
    const r = consumePreCapture("c1", Date.now() + PRE_CAPTURE_STALE_MS + 1);
    expect(r).toEqual({ hit: true, stale: true, image: null });
  });

  it("consume is one-shot — second call returns hit:false", () => {
    setPreCapture("c1", okOutcome);
    consumePreCapture("c1");
    expect(consumePreCapture("c1")).toEqual({ hit: false });
  });

  it("discardPreCapture drops the entry without consuming", () => {
    setPreCapture("c1", okOutcome);
    discardPreCapture("c1");
    expect(consumePreCapture("c1")).toEqual({ hit: false });
  });

  it("a failed outcome is cached but consumed returns image:null", () => {
    setPreCapture("c1", failOutcome);
    const r = consumePreCapture("c1");
    expect(r).toEqual({ hit: true, stale: false, image: null });
  });

  it("multiple confirmations cache independently", () => {
    setPreCapture("c1", okOutcome);
    setPreCapture("c2", okOutcome);
    discardPreCapture("c1");
    expect(consumePreCapture("c1")).toEqual({ hit: false });
    const r2 = consumePreCapture("c2");
    expect(r2).toMatchObject({ hit: true, stale: false });
  });
});
