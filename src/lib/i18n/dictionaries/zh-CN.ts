import type { EnDict } from "./en";

// `satisfies EnDict` enforces that the shape matches en exactly: missing keys
// or wrong-typed values = compile error. Cannot use direct `: EnDict` because
// that loses literal types for the resolver.
export const zhCNDict = {
  common: {
    cancel: "取消",
    save: "保存",
    confirm: "确认",
    delete: "删除",
    refresh: "刷新",
    back: "返回",
    copy: "复制",
    copyFailed: "复制失败",
  },
} as const satisfies EnDict;
