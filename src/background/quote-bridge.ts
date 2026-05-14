import { cropBboxToJpegDataUrl } from "@/lib/images/crop-bbox";
import type {
  QuoteTextCapturedMessage,
  QuoteElementCapturedMessage,
  QuoteAddedMessage,
  Quote,
} from "@/types";

function newId(): string {
  return crypto.randomUUID();
}

export async function handleQuoteTextCaptured(
  sender: chrome.runtime.MessageSender,
  payload: QuoteTextCapturedMessage["payload"],
): Promise<QuoteAddedMessage | null> {
  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") return null;
  const quote: Quote = {
    id: newId(),
    kind: "text",
    text: payload.text,
    sourceUrl: payload.sourceUrl,
    sourceTabId: tabId,
  };
  return { type: "quote-added", quote };
}

export async function handleQuoteElementCaptured(
  sender: chrome.runtime.MessageSender,
  payload: QuoteElementCapturedMessage["payload"],
): Promise<QuoteAddedMessage | null> {
  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") return null;

  let imageDataUrl: string | null = null;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (typeof tab.windowId === "number") {
      const visibleDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: "png",
      });
      imageDataUrl = await cropBboxToJpegDataUrl({
        sourceDataUrl: visibleDataUrl,
        bbox: payload.bbox,
        devicePixelRatio: payload.devicePixelRatio,
      });
    }
  } catch {
    imageDataUrl = null;
  }

  const quote: Quote = {
    id: newId(),
    kind: "element",
    role: payload.role,
    accessibleName: payload.accessibleName,
    textContent: payload.textContent,
    outerHTMLTruncated: payload.outerHTMLTruncated,
    imageDataUrl,
    sourceUrl: payload.sourceUrl,
    sourceTabId: tabId,
  };
  return { type: "quote-added", quote };
}

export async function broadcastPickerEnter(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "picker:enter" });
  } catch {
    // tab no longer alive — silent
  }
}

export async function broadcastPickerExit(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "picker:exit" });
  } catch {
    // tab no longer alive — silent
  }
}
