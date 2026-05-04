const SUPPORTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_INPUT_BYTES = 25_000_000;
export const MAX_INPUT_EDGE_PX = 12000;

export type ValidateResult =
  | { ok: true }
  | { ok: false; reason: "byte-too-large" | "unsupported-mime-type" | "edge-too-large" | "decode-failed" };

export function validateInputBounds(input: {
  byteLength: number;
  mediaType: string;
}): ValidateResult {
  if (input.byteLength > MAX_INPUT_BYTES) return { ok: false, reason: "byte-too-large" };
  if (!SUPPORTED_MIME.has(input.mediaType)) return { ok: false, reason: "unsupported-mime-type" };
  return { ok: true };
}

export function validateDecodedDimensions(input: {
  width: number;
  height: number;
}): ValidateResult {
  if (input.width > MAX_INPUT_EDGE_PX || input.height > MAX_INPUT_EDGE_PX) {
    return { ok: false, reason: "edge-too-large" };
  }
  return { ok: true };
}

/** R2 — 1568 max-edge (Anthropic high tier). v1.1 may add a Settings toggle
 *  for 1092 (low tier, BYOK cost). */
export const MAX_OUTPUT_EDGE_PX = 1568;

export function computeTargetSize(w: number, h: number): { width: number; height: number } {
  const maxEdge = Math.max(w, h);
  if (maxEdge <= MAX_OUTPUT_EDGE_PX) return { width: w, height: h };
  const scale = MAX_OUTPUT_EDGE_PX / maxEdge;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}
