import { describe, it, expect } from "vitest";
import { detectSensitive } from "./redact";

describe("detectSensitive", () => {
  it("returns redact=true for type='password'", () => {
    expect(detectSensitive({ type: "password" })).toEqual({
      redacted: true,
      placeholderName: "password",
    });
  });

  it("returns redact=true for autocomplete cc-number / cc-csc / cc-exp", () => {
    expect(detectSensitive({ type: "text", autocomplete: "cc-number" })).toEqual({
      redacted: true,
      placeholderName: "cc_number",
    });
    expect(detectSensitive({ type: "text", autocomplete: "cc-csc" })).toEqual({
      redacted: true,
      placeholderName: "cc_csc",
    });
    expect(detectSensitive({ type: "text", autocomplete: "cc-exp" })).toEqual({
      redacted: true,
      placeholderName: "cc_exp",
    });
  });

  it("returns redact=true for autocomplete current-password / new-password", () => {
    expect(detectSensitive({ type: "text", autocomplete: "current-password" })).toEqual({
      redacted: true,
      placeholderName: "password",
    });
    expect(detectSensitive({ type: "text", autocomplete: "new-password" })).toEqual({
      redacted: true,
      placeholderName: "password",
    });
  });

  it("redacts when aria-label / name / placeholder match keyword regex (case-insensitive)", () => {
    expect(detectSensitive({ type: "text", ariaLabel: "Password" })).toMatchObject({ redacted: true });
    expect(detectSensitive({ type: "text", name: "user_password" })).toMatchObject({ redacted: true });
    expect(detectSensitive({ type: "text", placeholder: "请输入 API Token" })).toMatchObject({ redacted: true });
    expect(detectSensitive({ type: "text", ariaLabel: "Secret" })).toMatchObject({ redacted: true });
    expect(detectSensitive({ type: "text", name: "auth_key" })).toMatchObject({ redacted: true });
    expect(detectSensitive({ type: "text", placeholder: "api.key" })).toMatchObject({ redacted: true });
  });

  it("does NOT redact ordinary text inputs", () => {
    expect(detectSensitive({ type: "text", placeholder: "Search" })).toEqual({ redacted: false });
    expect(detectSensitive({ type: "email", placeholder: "you@example.com" })).toEqual({ redacted: false });
  });

  it("placeholder name normalizes to snake_case ascii", () => {
    expect(detectSensitive({ type: "text", autocomplete: "cc-number" }).placeholderName).toBe("cc_number");
    expect(detectSensitive({ type: "password" }).placeholderName).toBe("password");
  });
});
