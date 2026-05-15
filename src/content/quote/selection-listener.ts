import { showBubble, hideBubble } from "./floating-bubble";

let attached = false;

function handleSelection(): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    hideBubble();
    return;
  }
  const text = sel.toString().trim();
  if (text.length === 0) {
    hideBubble();
    return;
  }
  const range = sel.getRangeAt(sel.rangeCount - 1);
  // getBoundingClientRect 返回整个 range 的并集 bbox，多行/跨段时 right/top 会飘到最右上角
  // 而不是结束 cursor 那行。用 getClientRects() 最后一个 rect = end cursor 所在行。
  const rects = range.getClientRects();
  const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
  showBubble({
    anchorTop: rect.top,
    anchorLeft: rect.right,
    onClick: () => {
      void chrome.runtime.sendMessage({
        type: "quote-text-captured",
        payload: { text, sourceUrl: location.href },
      });
    },
  });
}

function onMouseUp(): void {
  setTimeout(handleSelection, 0);
}

function onSelectionChange(): void {
  handleSelection();
}

export function attachSelectionListener(): void {
  if (attached) return;
  window.addEventListener("mouseup", onMouseUp);
  document.addEventListener("selectionchange", onSelectionChange);
  attached = true;
}

export function detachSelectionListener(): void {
  window.removeEventListener("mouseup", onMouseUp);
  document.removeEventListener("selectionchange", onSelectionChange);
  hideBubble();
  attached = false;
}
