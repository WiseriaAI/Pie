import { describe, it, expect, beforeEach } from "vitest";
import { hydrateAttachments } from "./image-hydration";
import { _resetForTests, getImages, addImage } from "@/background/image-cache";
import type { ChatMessage } from "@/lib/model-router";

beforeEach(() => _resetForTests());

describe("hydrateAttachments", () => {
  it("fresh ImageAttachment is written to cache + hasImageContent=true", () => {
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: "what is this?",
        attachments: [
          {
            kind: "image",
            id: "i1",
            mediaType: "image/jpeg",
            data: "AAAA",
            width: 100,
            height: 100,
            byteLength: 3,
          },
        ],
      },
    ];
    const r = hydrateAttachments("s1", messages);
    expect(r.hasImageContent).toBe(true);
    expect(getImages("s1").map((x) => x.id)).toEqual(["i1"]);
  });

  it("placeholder with cache hit re-inflates to ImageAttachment", () => {
    addImage("s1", {
      id: "i1",
      userTurnId: "turn_0",
      mediaType: "image/jpeg",
      data: "BBBB",
      width: 100,
      height: 100,
      byteLength: 3,
      addedAt: 0,
    });
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: "what is this?",
        attachments: [
          {
            kind: "image_placeholder",
            id: "i1",
            mediaType: "image/jpeg",
            width: 100,
            height: 100,
          },
        ],
      },
    ];
    const r = hydrateAttachments("s1", messages);
    expect(r.hasImageContent).toBe(true);
    expect(r.messages[0].attachments?.[0].kind).toBe("image");
  });

  it("placeholder with cache miss stays as placeholder; hasImageContent=false", () => {
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: "follow up",
        attachments: [
          {
            kind: "image_placeholder",
            id: "i_missing",
            mediaType: "image/jpeg",
            width: 100,
            height: 100,
          },
        ],
      },
    ];
    const r = hydrateAttachments("s1", messages);
    expect(r.hasImageContent).toBe(false);
    expect(r.messages[0].attachments?.[0].kind).toBe("image_placeholder");
  });

  it("non-user / no-attachment messages pass through unchanged", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "plain" },
      { role: "assistant", content: "ok" },
    ];
    const r = hydrateAttachments("s1", messages);
    expect(r.messages).toEqual(messages);
    expect(r.hasImageContent).toBe(false);
  });
});
