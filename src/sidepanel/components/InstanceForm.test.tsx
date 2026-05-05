import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import InstanceForm from "./InstanceForm";

afterEach(() => {
  cleanup();
});

describe("InstanceForm", () => {
  it("does NOT render a BaseURL field", () => {
    render(
      <InstanceForm
        mode="create"
        provider="anthropic"
        initialNickname="Anthropic"
        onSave={() => {}}
        onTest={() => {}}
      />,
    );
    expect(screen.queryByText(/base url/i)).toBeFalsy();
  });

  it("provider field is read-only in edit mode", () => {
    render(
      <InstanceForm
        mode="edit"
        provider="openai"
        initialNickname="Work"
        initialModel="gpt-4o"
        onSave={() => {}}
        onTest={() => {}}
        onDelete={() => {}}
      />,
    );
    const providers = screen.getAllByText(/openai/i);
    expect(providers.length).toBeGreaterThan(0);
    // No combobox / button for provider
    expect(screen.queryByRole("combobox", { name: /provider/i })).toBeFalsy();
  });

  it("fires onSave with form payload", () => {
    const onSave = vi.fn();
    render(
      <InstanceForm
        mode="create"
        provider="anthropic"
        initialNickname="Anthropic"
        initialModel="claude-opus-4-7"
        onSave={onSave}
        onTest={() => {}}
      />,
    );
    // getByLabelText finds multiple because Field uses <label> wrapping; grab the input explicitly
    const apiKeyInput = screen.getAllByLabelText(/api key/i).find(
      (el) => el.tagName === "INPUT",
    )!;
    fireEvent.change(apiKeyInput, { target: { value: "sk-ant-test" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "sk-ant-test" }));
  });
});
