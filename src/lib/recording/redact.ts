/**
 * Recording v1 — 敏感字段检测。capture 注入函数在每次 user input 时调用此函数；
 * redacted=true 时 value 不发回 SW，placeholderName 用于 promptTemplate 占位。
 *
 * **必须保持与本仓库其他 redact 路径一致**：
 *   - lib/dom-actions/type.ts 的 isSensitive (高敏 input dispatch 检测)
 *   - lib/agent/risk.ts 的 isSensitiveInputTarget (risk classifier)
 *
 * 三处共享同一组关键词；任一处补关键词时同步更新。
 */

interface ElementMeta {
  type?: string;
  autocomplete?: string;
  ariaLabel?: string;
  name?: string;
  placeholder?: string;
  /** label 元素的 textContent（含 for= 关联和祖先 label）。capture 端预先解析后传入。 */
  labelText?: string;
}

interface RedactResult {
  redacted: boolean;
  placeholderName?: string;
}

const SENSITIVE_TEXT_PATTERN = /password|密码|secret|token|api[._-]?key|auth|cvv|cvc|otp|验证码/i;
const CC_AUTOCOMPLETE_PATTERN = /^cc-(number|cvc|exp|csc)$/i;
const PASSWORD_AUTOCOMPLETE_PATTERN = /^(new-password|current-password)$/i;

export function detectSensitive(meta: ElementMeta): RedactResult {
  if (meta.type === "password") {
    return { redacted: true, placeholderName: "password" };
  }

  if (meta.autocomplete && CC_AUTOCOMPLETE_PATTERN.test(meta.autocomplete)) {
    const kind = meta.autocomplete.toLowerCase().slice(3); // "number" / "cvc" / "exp" / "csc"
    return { redacted: true, placeholderName: `cc_${kind}` };
  }

  if (meta.autocomplete && PASSWORD_AUTOCOMPLETE_PATTERN.test(meta.autocomplete)) {
    return { redacted: true, placeholderName: "password" };
  }

  for (const field of [meta.ariaLabel, meta.name, meta.placeholder, meta.labelText]) {
    if (field && SENSITIVE_TEXT_PATTERN.test(field)) {
      return { redacted: true, placeholderName: inferPlaceholderName(field) };
    }
  }

  return { redacted: false };
}

function inferPlaceholderName(text: string): string {
  const lower = text.toLowerCase();
  if (/password|密码/.test(lower)) return "password";
  if (/cvv|cvc/.test(lower)) return "card_security_code";
  if (/otp|验证码/.test(lower)) return "verification_code";
  if (/token/.test(lower)) return "token";
  if (/api[._-]?key/.test(lower)) return "api_key";
  if (/secret/.test(lower)) return "secret";
  if (/auth/.test(lower)) return "auth_value";
  return "sensitive_value";
}
