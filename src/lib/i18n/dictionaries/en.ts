import type { DictNode } from "../types";

export const enDict = {
  common: {
    cancel: "Cancel",
    save: "Save",
    confirm: "Confirm",
    delete: "Delete",
    refresh: "Refresh",
    back: "Back",
    copy: "Copy",
    copyFailed: "Copy failed",
  },
} as const satisfies DictNode;

export type EnDict = typeof enDict;
