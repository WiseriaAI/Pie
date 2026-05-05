import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
import SaveSkillDialog from "./SaveSkillDialog";
import type { RecordedAction } from "@/lib/recording/types";

const sampleActions: RecordedAction[] = [
  { type: "click", label: "按钮 'Login'", url: "https://x.com/login", region: "main", timestamp: 1 },
  {
    type: "type",
    label: "输入框 'Email'",
    value: "user@x.com",
    url: "https://x.com/login",
    region: "main",
    timestamp: 2,
  },
  {
    type: "type",
    label: "输入框 'Password'",
    value: "password",
    redacted: true,
    placeholderName: "password",
    url: "https://x.com/login",
    region: "main",
    timestamp: 3,
  },
];

describe("SaveSkillDialog — capability review invariant (decision 2)", () => {
  it("renders all 4 review elements on mount: step list, allowedTools chips, parameters list, byte counter", () => {
    render(<SaveSkillDialog actions={sampleActions} onSave={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.getByText(/第 1 步/)).toBeTruthy();
    expect(screen.getByText(/第 2 步/)).toBeTruthy();
    expect(screen.getByText(/第 3 步/)).toBeTruthy();
    expect(screen.getByTestId("allowed-tool-chip-click")).toBeTruthy();
    expect(screen.getByTestId("allowed-tool-chip-type")).toBeTruthy();
    expect(screen.getByTestId("allowed-tool-chip-done")).toBeTruthy();
    expect(screen.getByTestId("param-row-password")).toBeTruthy();
    expect(screen.getByTestId("byte-counter")).toBeTruthy();
  });

  it("save button is disabled until name + description filled in", () => {
    render(<SaveSkillDialog actions={sampleActions} onSave={vi.fn()} onDiscard={vi.fn()} />);
    const save = screen.getByTestId("save-skill-button") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("skill-name-input"), { target: { value: "Login flow" } });
    fireEvent.change(screen.getByTestId("skill-description-input"), { target: { value: "logs in" } });
    expect(save.disabled).toBe(false);
  });

  it("delete-step button removes the step + updates byte counter", () => {
    render(<SaveSkillDialog actions={sampleActions} onSave={vi.fn()} onDiscard={vi.fn()} />);
    const beforeBytes = parseInt(
      screen.getByTestId("byte-counter").getAttribute("data-bytes")!,
      10,
    );
    fireEvent.click(screen.getByTestId("delete-step-1"));
    const afterBytes = parseInt(
      screen.getByTestId("byte-counter").getAttribute("data-bytes")!,
      10,
    );
    expect(afterBytes).toBeLessThan(beforeBytes);
    expect(screen.queryByText(/第 3 步/)).toBeNull();
  });

  it("removing an allowedTool chip excludes it from save payload", () => {
    const onSave = vi.fn();
    render(<SaveSkillDialog actions={sampleActions} onSave={onSave} onDiscard={vi.fn()} />);
    fireEvent.change(screen.getByTestId("skill-name-input"), { target: { value: "Login" } });
    fireEvent.change(screen.getByTestId("skill-description-input"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("remove-tool-click"));
    fireEvent.click(screen.getByTestId("save-skill-button"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        finalAllowedTools: expect.not.arrayContaining(["click"]),
      }),
    );
  });

  it("save button stays disabled when all steps deleted (no empty-skill save)", () => {
    render(<SaveSkillDialog actions={sampleActions} onSave={vi.fn()} onDiscard={vi.fn()} />);
    fireEvent.change(screen.getByTestId("skill-name-input"), { target: { value: "X" } });
    fireEvent.change(screen.getByTestId("skill-description-input"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("delete-step-0"));
    fireEvent.click(screen.getByTestId("delete-step-0"));
    fireEvent.click(screen.getByTestId("delete-step-0"));
    const save = screen.getByTestId("save-skill-button") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it("byte counter shows red over-limit warning when promptTemplate > 8KB", () => {
    const longLabel = "x".repeat(500);
    const big = Array.from({ length: 50 }, (_, i): RecordedAction => ({
      type: "click",
      label: longLabel,
      url: "u",
      region: "main",
      timestamp: i,
    }));
    render(<SaveSkillDialog actions={big} onSave={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.getByTestId("byte-counter").getAttribute("data-over-limit")).toBe("true");
    const save = screen.getByTestId("save-skill-button") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });
});
