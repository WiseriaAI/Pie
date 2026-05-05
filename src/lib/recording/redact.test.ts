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

  it("does NOT redact common 'auth' false-positives like Author / Authority / Authentic", () => {
    expect(detectSensitive({ type: "text", ariaLabel: "Author name" })).toEqual({ redacted: false });
    expect(detectSensitive({ type: "text", placeholder: "Authority" })).toEqual({ redacted: false });
    expect(detectSensitive({ type: "text", name: "authentic_review" })).toEqual({ redacted: false });
    expect(detectSensitive({ type: "text", ariaLabel: "Authorize purchase" })).toEqual({ redacted: false });
  });

  it("does redact genuine 'auth' fields (auth_token / auth key / auth.token)", () => {
    expect(detectSensitive({ type: "text", name: "auth_token" })).toMatchObject({ redacted: true, placeholderName: "auth_value" });
    expect(detectSensitive({ type: "text", ariaLabel: "Auth key" })).toMatchObject({ redacted: true });
    expect(detectSensitive({ type: "text", placeholder: "auth.token" })).toMatchObject({ redacted: true });
  });

  it("redacts 'API key' with space between (natural-language form)", () => {
    expect(detectSensitive({ type: "text", ariaLabel: "API key" })).toMatchObject({ redacted: true, placeholderName: "api_key" });
    expect(detectSensitive({ type: "text", placeholder: "API Key" })).toMatchObject({ redacted: true, placeholderName: "api_key" });
  });
});
