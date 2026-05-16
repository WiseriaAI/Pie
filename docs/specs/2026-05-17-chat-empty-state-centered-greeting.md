# Chat 空状态居中招呼语 — Design

**Status**: Draft · 待用户确认
**Date**: 2026-05-17
**Scope**: `src/sidepanel/components/Chat.tsx` 的 `EmptyState` 子组件 + i18n 字典

## Goal

把 Chat 页空状态从「顶部对齐 · ready 标签 · 介绍文 · 推荐 skill 列表」改为「垂直居中 · 随机招呼语 · 副标题」，让进入空 session 时第一眼更像被朋友招呼，而不是被任务面板招呼。

## Non-Goals

- 不动 SkillSlashPopover（用户在输入 `/` 时仍能看到 skill 候选）
- 不动 `getEnabledSkills()` 数据流（其它地方还在用）
- 不动 header / composer 排版
- 不引入新依赖

## Visual Reference

Paper 原型已定稿于 artboard `1PO-0`「01 — Agent · Empty · Dark (copy)」。布局摘要：

```
┌─ scroll container (flex-1) ────────────────────┐
│                                                 │
│                                                 │
│           嘿，想去哪儿？我陪你。                  │  H1 24px / -0.015em
│                                                 │     text-fg-1, text-center
│   我可以阅读内容、点击操作、填写表单、             │  13px / leading-5
│   管理标签页。任何有风险的操作都会等你批准。       │     text-fg-2, text-center
│                                                 │     max-w-[280px]
│                                                 │
└─────────────────────────────────────────────────┘
```

容器：`flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center`

## 招呼语候选（双语，温度版方向 C）

`zh-CN`：

```
1. 嗨，今天我们看点什么？
2. 来呀，今天想做点什么？
3. 我在呢，想做点什么？
4. 今天我能帮上什么忙？
5. 嘿，想去哪儿？我陪你。
6. 想到什么了？跟我说说。
7. 看看这页有什么好玩的？
```

`en`：

```
1. Hey, what are we looking at today?
2. So, what's the plan?
3. I'm here — what's up?
4. What can I do for you today?
5. Hey there — where to?
6. Got something on your mind?
7. Anything fun on this page?
```

副标题（不随机，保持原文案）：

- `zh-CN`：我可以阅读内容、点击操作、填写表单、管理标签页。任何有风险的操作都会等你批准。
- `en`：I can read it, click around, fill forms, manage tabs. Anything risky waits for your approval.

## 随机策略

- **何时抽**：`EmptyState` 组件 mount 时用 `useMemo(() => greetings[Math.floor(Math.random() * greetings.length)], [])` 抽一条，session 内稳定不会闪烁
- **多语言**：从当前 locale 的字典 `chat.greetings: string[]` 数组里抽（数组长度=7）
- **离开重进**：当 session 从「空 → 有消息」再回到「重新空」（极少见，只会在 newTask 后发生），组件重新 mount，会重新抽

## i18n 改动

`src/lib/i18n/dictionaries/zh-CN.ts` + `src/lib/i18n/dictionaries/en.ts`：

| key | 处理 |
|---|---|
| `chat.ready` | **删除**（caps 标签去掉） |
| `chat.readyHeadline` | **删除**（被 `chat.greetings` 替代） |
| `chat.readyDescription` | **保留**（作为副标题） |
| `chat.suggested` | **删除**（skill 推荐区去掉） |
| `chat.forAll` | **删除**（skill 推荐区去掉） |
| `chat.greeting1` … `chat.greeting7` | **新增** — 7 个独立 string key，对应上面 7 条（i18n helper `t()` 只返回 string，不能返数组） |

## 代码改动概览

文件：`src/sidepanel/components/Chat.tsx`

1. `EmptyState` 组件：
   - 去掉 `skills` / `onPickSkill` props（caller 也同步删）
   - 删整个 skill 列表 JSX（1244–1276 行）
   - 删 `caps text-fg-3「READY」` span（1235 行）
   - 把根容器 className 从 `flex flex-col gap-8 px-6 pb-6 pt-14` 改为 `flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center`
   - 内部 `<h1>` + `<p>` 加 `text-center`，外层包一个 `max-w-[280px]` 限宽
   - 用 `useMemo` 抽一条 greeting：
     ```ts
     const greeting = useMemo(() => {
       const keys = ["greeting1","greeting2","greeting3","greeting4","greeting5","greeting6","greeting7"] as const;
       const pick = keys[Math.floor(Math.random() * keys.length)];
       return t(`chat.${pick}` as const);
     }, [t]);
     ```
     依赖 `t` 是为了切语言后下次 mount 重新抽（同一 mount 内不会重抽 — locale 切换时整个 sidepanel 会重渲染，EmptyState 也跟着重建）

2. caller (899–902 行)：
   - `<EmptyState skills={enabledSkills.slice(0, 3)} onPickSkill={…} />` → `<EmptyState />`
   - **不删** `enabledSkills` state / `getEnabledSkills()` 调用 — SkillSlashPopover 还在用（`filterAndSortSkillsForSlash(query, enabledSkills)` line ~597）

3. i18n 字典：按上表增删 key

## 兼容性 / 风险

- 副标题 `max-w-[280px]` 在最窄 320px 侧边栏下仍有 20px 左右 safe area，应该够
- 删 i18n key 前 `grep -r "chat.ready\b\|chat.readyHeadline\|chat.suggested\|chat.forAll" src` 确认无其它引用
- 没有 build-time invariant 卡这些 key（不是 risk classifier / tool-names 那种 throw 范畴），删 key 不会 break 构建

## 测试

- `Chat.test.tsx`：现有空状态相关 test 如果断言了 "What should I do on this page?" / "READY" / "SUGGESTED" 等文本，需更新为 "断言 7 条 greeting 之一存在"（用 `Math.random` mock 或 `screen.getByText(/嗨|来呀|我在呢|今天我能|嘿|想到什么|看看这页/)`）
- 手动：开发者模式装扩展 → 新开 session → 看居中招呼语 → 切语言到 EN → 再开新 session → 看英文招呼语 → 多开几次确认随机生效

## Open Questions

无。

