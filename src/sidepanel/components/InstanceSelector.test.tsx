import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import InstanceSelector from "./InstanceSelector";
import type { DecryptedInstance } from "@/lib/instances";

afterEach(() => {
  cleanup();
});

const sampleInstances: DecryptedInstance[] = [
  { id: "1", provider: "anthropic", nickname: "Anthropic", apiKey: "sk", model: "claude-opus-4-7", createdAt: 0 },
  { id: "2", provider: "openai", nickname: "Work", apiKey: "sk", model: "gpt-4o", createdAt: 0 },
];

describe("InstanceSelector", () => {
  it("renders chip with shortened model name (no border)", () => {
    render(
      <InstanceSelector
        instances={sampleInstances}
        currentId="1"
        locked={false}
        onChange={() => {}}
        onManage={() => {}}
      />,
    );
    const chip = screen.getByRole("button", { name: /anthropic/i });
    // chip shows shortened model "opus-4-7" (drops "claude-" prefix)
    expect(chip.textContent?.includes("opus-4-7")).toBeTruthy();
    // chip is borderless: className does not contain standalone "border" word
    expect(/\bborder\b(?!-)/.test(chip.className)).toBeFalsy();
  });

  it("opens dropdown listing all instances; clicking switches selection", () => {
    const onChange = vi.fn();
    render(
      <InstanceSelector instances={sampleInstances} currentId="1" locked={false} onChange={onChange} onManage={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /anthropic/i }));
    fireEvent.click(screen.getByText(/work/i));
    expect(onChange).toHaveBeenCalledWith("2");
  });

  it("locked: chip is disabled and dropdown won't open", () => {
    render(
      <InstanceSelector instances={sampleInstances} currentId="1" locked={true} onChange={() => {}} onManage={() => {}} />,
    );
    const chip = screen.getByRole("button", { name: /anthropic/i });
    expect((chip as HTMLButtonElement).disabled).toBeTruthy();
  });
});
