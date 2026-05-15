export type TextQuote = {
  id: string;
  kind: "text";
  text: string;
  sourceUrl: string;
  sourceTabId: number;
};

export type ElementQuote = {
  id: string;
  kind: "element";
  role: string;
  accessibleName: string;
  textContent: string;
  outerHTMLTruncated: string;
  imageDataUrl: string | null;
  sourceUrl: string;
  sourceTabId: number;
};

export type Quote = TextQuote | ElementQuote;

// --- content → SW ---
export type QuoteTextCapturedMessage = {
  type: "quote-text-captured";
  payload: { text: string; sourceUrl: string };
};

export type QuoteElementCapturedMessage = {
  type: "quote-element-captured";
  payload: {
    bbox: { x: number; y: number; width: number; height: number };
    devicePixelRatio: number;
    role: string;
    accessibleName: string;
    textContent: string;
    outerHTMLTruncated: string;
    sourceUrl: string;
  };
};

// --- SW → panel ---
// sessionId 由 SW 派发时填入（每个 port 绑定一个 sessionId），panel 用它路由到对应 slot。
export type QuoteAddedMessage = {
  type: "quote-added";
  sessionId: string;
  quote: Quote;
};

// --- panel → SW ---
export type PickerStartMessage = { type: "picker:start"; tabId: number };
export type PickerStopMessage = { type: "picker:stop"; tabId: number };

// --- SW → content (chrome.tabs.sendMessage) ---
export type PickerEnterMessage = { type: "picker:enter" };
export type PickerExitMessage = { type: "picker:exit" };
