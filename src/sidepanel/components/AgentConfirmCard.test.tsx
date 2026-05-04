import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import AgentConfirmCard from "./AgentConfirmCard";

const REQUIRED_PROPS = {
  tool: "capture_visible_tab",
  args: {},
  resolvedElement: { text: "", tag: "div" },
  riskReason: "Screenshot captures the current tab",
  onApprove: vi.fn(),
  onReject: vi.fn(),
};

afterEach(() => cleanup());

describe("AgentConfirmCard — Phase 5 screenshot preview", () => {
  it("renders screenshot preview when screenshotPreview prop is present", () => {
    render(
      <AgentConfirmCard
        {...REQUIRED_PROPS}
        screenshotPreview={{
          thumbnail: "AAAA",
          mediaType: "image/jpeg",
          width: 200,
          height: 100,
          capturedAt: Date.now(),
        }}
      />,
    );
    const img = screen.getByAltText(/screenshot preview/i);
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toContain("data:image/jpeg;base64,AAAA");
  });

  it("does not render screenshot preview when screenshotPreview is absent", () => {
    render(<AgentConfirmCard {...REQUIRED_PROPS} />);
    expect(screen.queryByAltText(/screenshot preview/i)).toBeNull();
  });
});
