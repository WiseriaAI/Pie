---
title: Project Archive HTML — design
date: 2026-05-13
status: spec
audience: self / future maintainer of the project
deliverable: docs/archive/index.html (single static file, zero deps)
---

# Chrome AI Agent — Project Archive HTML 设计

一个**给作者自己未来回顾**用的、单文件静态 HTML 知识库。
内容轴 = 子系统；视觉同谱 = Pie sidepanel。
不进 Vite 构建链，不属于扩展产物。

## 1. 范围与非范围

**做**：
- 12 个内容面板（10 个子系统 + 2 个横切：Confirm 删除变迁 / Phase 时间线）
- 左侧子系统索引 + 右侧多面板布局
- 全局 `/` 搜索 · invariants 折叠 · 深/浅主题 · SVG 流程图 hover 联动 · 右下 Phase 时间线小卡

**不做**：
- 不是对外产品介绍页（无营销文案、无"什么是 Agent"科普）
- 不上 CI / 不绑 build / 不嵌进扩展
- 不接外部资源（无 CDN、无字体下载、无埋点）
- 不做多语言版本（中文为主，关键术语保留英文原词）

## 2. 文件与产物

```
docs/archive/index.html    ← 唯一交付物，约 1500–2000 行
                            包含：HTML 骨架 + 内嵌 <style> + 内嵌 <script> + 数据
```

- 双击打开即可，不需要起服务
- 字体走系统 stack，不引外部资源
- 所有 SVG 内联

## 3. 视觉系统

直接复用 `src/sidepanel/index.css` 的 `--c-*` token，**同名同值**，深浅两套同步：

| token | 用法 |
|---|---|
| `--c-canvas` | 页面底色 |
| `--c-surface` | 面板/卡片底色 |
| `--c-field` | 输入框/被动元素 |
| `--c-line` | 1px 分割线 |
| `--c-fg-1..4` | 文字四档对比度 |
| `--c-accent` / `--c-accent-tint` / `--c-accent-line` | 选中/hover/链接 |
| `--c-warning` / `--c-warning-tint` | "已撤回 / 已删除" 标记 |
| `--c-dot-grid` | 全局 dot-grid 背景，4px 点 / 14px 间距 |
| `--c-pending` / `--c-danger` | **不使用**（按 brand 资产限定原则） |

- 圆角 ≤ 4px
- 字体 = 系统 stack；正文 14–15px，标题 18–22px，路径/标识 13px mono
- 所有分割线 1px

## 4. 布局

```
顶栏（48px）
┌──────────────────────────────────────────────────────────────┐
│ Pie · Project Archive    v0.8.0 · 2026-05-13    [☼/☾]  [/]  │
├────────────┬─────────────────────────────────────────────────┤
│            │                                                 │
│  SUBSYSTEMS│   <Panel: 当前选中子系统>                       │
│            │                                                 │
│ ►Agent Loop│   ┌─ what ─────────────────────────────────┐   │
│  Provider..│   │ 一句话定义 + ≤80 字描述                │   │
│  Multi-Ins │   └────────────────────────────────────────┘   │
│  Skills    │                                                 │
│  Sessions  │   ┌─ how ──────────────────────────────────┐   │
│  DOM + CDP │   │ • 关键文件 path:line                    │   │
│  Cross-Tab │   │ • 关键函数 / 数据结构                   │   │
│  Multimodal│   │ • 关键 wire / IO                        │   │
│  Untrusted │   └────────────────────────────────────────┘   │
│  Streaming │                                                 │
│  Record    │   ┌─ flow（内联 SVG，≤6 节点）─────────────┐   │
│ ─cross─cuts│   │       hover 节点 → 联动右侧 bullet     │   │
│  Confirm✕  │   └────────────────────────────────────────┘   │
│  Phases    │                                                 │
│            │   ┌─ why ──────────────────────────────────┐   │
│ ─phases ─  │   │ 3–4 条设计决策 + "本来可能怎么走"      │   │
│ 0·1·2·2.5· │   └────────────────────────────────────────┘   │
│ 2.6·3·4·   │                                                 │
│ 5·v1.5     │   ┌─ invariants（▾ 折叠，标 phase tag）────┐   │
│            │   │ P3-A / M3-U1 / R7 ...                  │   │
└────────────┴───┴────────────────────────────────────────┘   │
                                                               │
                                            ┌───────────┐      │
                                            │ Phase     │      │
                                            │ Timeline  │ ←右下│
                                            └───────────┘      │
                                                               │
```

- 左栏：固定 220px；主面板：fluid
- 移动端 / 窄屏（<960px）：左栏折成顶部抽屉
- 每个 panel 路由 = `#<slug>`（hash routing，零依赖）

## 5. 子系统面板 schema

每个子系统的数据结构（注入到 `<script>` 里的 JS 对象）：

```js
{
  slug: 'agent-loop',
  title: 'Agent Loop (ReAct)',
  phaseTags: ['P2', 'P2.6'],
  what: '一句话定义。',
  whatLong: '≤80 字描述。',
  how: [
    { label: '入口', code: 'src/lib/agent/loop.ts → runAgentLoop()' },
    { label: 'prompt', code: 'src/lib/agent/prompt.ts' },
    // ...
  ],
  why: [
    { decision: '为什么 ReAct 而不是 plan-and-execute', rationale: '...' },
    // ...
  ],
  flow: {
    nodes: [{ id, label, x, y }],
    edges: [{ from, to, label? }],
    bulletMap: { node1: 'how[0]', node2: 'how[1]' }  // hover 联动
  },
  invariants: [
    { tag: 'P3-A', text: 'tabId+origin pinned at task start', src: 'docs/solutions/...' },
    // ...
  ]
}
```

## 6. 12 个面板清单与内容来源

| # | slug | 标题 | 主要 content source |
|---|---|---|---|
| 1 | agent-loop | Agent Loop (ReAct) | `src/lib/agent/` + ROADMAP §1 |
| 2 | provider-router | Provider × Model Router | `src/lib/model-router/` + custom-providers spec |
| 3 | multi-instance | Multi-Instance Config | `src/lib/instances.ts` + `migration-v2.ts` + provider-config-center spec |
| 4 | skills | Skills 框架 | `src/lib/skills/` + skill-scope-and-skip-permissions spec |
| 5 | sessions | Sessions / per-session sandbox | `src/lib/sessions/` + M1/M2/M3 solution trace docs |
| 6 | dom-cdp | DOM Actions + CDP Keyboard | `src/lib/dom-actions/` + cdp-keyboard solution trace |
| 7 | cross-tab | Cross-Tab (Pinned + Origin) | `src/lib/agent/tools/tabs.ts` + cross-tab-trust-model solution |
| 8 | multimodal | Multimodal (Vision) | multimodal-image-input v1 spec + acceptance bugs solution |
| 9 | untrusted | Prompt Injection 防御 | `src/lib/agent/untrusted-wrappers.ts` + tool-names invariant |
| 10 | streaming | Streaming / Wire 协议 | `src/background/` port + sidepanel chat port |
| 11 | record-replay | Record & Replay | record-and-replay v1 solution trace |
| 12 | confirm-removed | [横切] Confirm 层删除变迁 | 73d6d84 commit + ROADMAP confirm-removed note |
| 13 | phases | [横切] Phase 时间线 | ROADMAP.md 完整 phase list |

12 是去重后的内容面板数（confirm-removed + phases = 2 横切）。

## 7. 交互细节

### 7.1 全局搜索（`/`）
- 按 `/` 弹一个 80% 宽 omni 框，固定屏幕上半部
- 实时匹配 `slug` / `title` / `what` / `invariants[].text`
- 命中项展示 "标题 · 命中片段"，Enter 跳转，Esc 退出
- ≤ 80 行 JS，不引 fuzzy 库（字符串 includes 够用）

### 7.2 invariants 折叠
- 默认收起，标题显示数量：`▸ invariants (12)`
- 点击展开，再点收起；状态不持久化（每次进面板重置）

### 7.3 深/浅主题
- 顶栏 `☼/☾` icon button
- toggle `<html data-theme="dark|light">`，CSS variable 切换
- `localStorage.archiveTheme` 持久化；首次按 `prefers-color-scheme`

### 7.4 SVG flow hover 联动
- 每个节点带 `data-bullet="how-0"` 等属性
- hover 节点 → 同步给对应 bullet 加 `.is-flow-hover` 类（accent-tint 背景）
- 反向：hover bullet 同样高亮节点
- 无 hover 时全部恢复

### 7.5 Phase 时间线小卡
- 右下角永久浮卡，宽 200px，高 80px
- 显示 9 个 phase 圆点，当前选中子系统涉及的 phase 高亮
- 点小卡 → 打开 Phase 横切面板（也就是第 13 个 panel）
- 在 Phase 面板时小卡换为"返回上一个面板"

### 7.6 路由
- hash 路由：`#agent-loop` / `#sessions` / `#phases`
- 进站默认 `#agent-loop`
- 浏览器前进/后退正常工作

## 8. JS 总量预算

|  模块 | 行数预算 |
|---|---|
| 数据（12 panel × ~50 行） | ~600 |
| 渲染（panel render + 流程图） | ~200 |
| 路由 + 主题 + 折叠 | ~80 |
| 搜索 | ~80 |
| SVG hover 联动 | ~40 |
| **合计** | **~1000 行 JS** |

+ ~300 行 CSS + ~100 行 HTML 骨架 = 单文件 ~1500 行。

## 9. 测试与验收

无单元测试。靠肉眼 + 浏览器手动验收：

- [ ] 双击 `docs/archive/index.html` 可看，无 404 / 无 console error
- [ ] 12 个面板都点得到，内容齐
- [ ] `/` 搜索弹框 → 输入 "untrusted" 命中 → Enter 跳转 panel
- [ ] invariants 折叠收/展正常
- [ ] 深/浅 toggle 正常，刷新后保持
- [ ] SVG flow 节点 hover 高亮对应 bullet
- [ ] 右下 Phase 小卡显示当前 panel 关联的 phase
- [ ] 窄屏（<960px）左栏折叠为顶部抽屉

## 10. 后续 backlog（不进 v1）

- 不做：搜索高亮命中字、面板间深链接（除 hash）、打印样式、JSON 数据外置成 `data.js`、动画过渡
- 如需更新内容：直接改 HTML 里的 data 数组，无 build step

---

## 仍未确定的事项

无。设计已闭环。

## 自审 checklist

- [x] Placeholder：无 TBD/TODO
- [x] 内部一致：layout 图与 schema 字段对得上；12 = 10 + 2 横切
- [x] Scope：单文件、无 build、无外链；不上 CI
- [x] 歧义：双"#" panel slug 已与 hash 路由对齐；invariants 命名沿用 docs/solutions/ 现有 tag
