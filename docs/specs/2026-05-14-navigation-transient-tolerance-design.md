---
date: 2026-05-14
topic: navigation-transient-tolerance
status: brainstormed
related:
  - src/lib/agent/loop.ts                          # 顶部 origin check (~L912) + isRestrictedUrl (L319)
  - src/lib/agent/tools/tabs.ts                    # openUrlTool handler (~L1085-1191)
  - src/lib/agent/wait-for-settle.ts               # 现有 withActionSettle (issue #27)，本期不动
  - src/background/index.ts                        # webNavigation listener 已注册（recording v1 引入）
  - manifest.json                                  # webNavigation permission 已就位，无 manifest 改动
  - docs/ROADMAP.md                                # §10 v1.5.1 backlog 提及 "R11 click-induced nav false-positive"，本期一并收敛
demo: docs/specs/2026-05-14-nav-transient-tolerance-demo.html
---

# Navigation Transient Tolerance

## Problem Frame

Loop 顶部 origin check (`loop.ts:912`) 每轮起手读 `chrome.tabs.get(pinnedTabId)`，命中 `isRestrictedUrl(url)` 即 hard-stop（summary = "Page navigated to a restricted URL, agent stopped"）。`isRestrictedUrl` 把 `about:` 前缀一律视为 restricted（loop.ts:319-333）—— 但 navigation in-flight 期间 tab.url 短暂为 `about:blank`，被误判。

受影响的 navigation 触发路径（按用户感知频度排）：

1. **`open_url` 创建新 tab** —— handler 调用 `chrome.tabs.create` 立即返回，tab.url 此时为 `about:blank` / `""`、status="loading"。同轮 LLM 若 batch `focus_tab(newTabId)`，下一轮顶部 check 直接撞 restricted。这是用户报告的主要场景。
2. **click 触发 cross-doc navigation** —— 现有 `withActionSettle`（quietMs=500, maxMs=3000）已包 click handler，但慢站 quietMs 不够时仍漏掉。ROADMAP §10 标记 "R11 click-induced nav false-positive 是用户最常见痛点"。
3. **`type` + Enter 触发 form submit** —— 同 click 场景。
4. **页面 JS 自跳 / meta refresh** —— navigation 不经过任何 agent tool，无 handler 可挂 settle。
5. **用户手动操作 pinned tab**（刷新 / 回退 / 前进） —— 同上。
6. **`focus_tab` 切到加载中 tab** —— focus_tab 是 always-low 纯指针更新；切焦点的下一轮顶部 check 读到 transient tab 撞 restricted。

**结构性原因**：`isRestrictedUrl` 不区分 "navigation 未 commit 的初始 sentinel" vs "页面真停在 chrome:// / data: / file:// 等无法操作的 origin"。现有 `withActionSettle`（issue #27）只 cover **action-side**（click/type/keyboard handler 内等 quiet window），**observation-side**（loop 顶部）和 **navigation-side**（open_url handler）没 cover。

## Decisions Locked During Brainstorm

| Q | Decision | Rationale |
|---|---|---|
| **Scope 边界** | 双保险：loop 顶部 + open_url handler 同改 | loop 顶部是所有 navigation transient 的统一收敛点；open_url 内 wait 提升 handler 错误清晰度（commit 失败时给 LLM 明确 observation 而非"创建成功但下轮 STOP"的矛盾反馈）。代价：代码量 x2 但语义对称 |
| **Wait 机制** | 新独立 helper `waitForUrlSettle`，复用 `chrome.webNavigation.onCommitted`（frameId=0） | 不重构现有 `withActionSettle`（语义不同：现有是"action 后等 page 安静一段"，新的是"等 url commit 到目标 origin"）。共享 webNavigation API 但不互相依赖 |
| **Timeout** | 5000 ms | 现有 `withActionSettle` max=3000ms 是为 click 后 settle 设的；新 tab 全量加载（Gmail / GitHub / 飞书 冷启）通常 1–3s，需要 5s 兜底。timeout 后 fall-through，不会让 LLM 哑等过久 |
| **pendingUrl 利用** | fast-fail | `chrome.tabs.Tab.pendingUrl` 存在且解析 origin 不匹配 pinnedOrigin → 立刻 STOP（节省 5s wait）。其他情况（undefined / origin 匹配）→ wait + timeout。安全语义同"完全忽略"，但漂洗场景出错信息更快 |
| **Transient 触发条件** | `url === "about:blank"` 或 `url === ""` / `undefined` | `status === "loading"` 不作为 trigger（SPA 大站子资源加载会让 status=loading 持续很久，但 url 已 commit 到目标 → 应走标准 check）。只有 url sentinel 才进 transient 路径 |
| **Timeout 后文案** | 复用 "Page navigated to a restricted URL, agent stopped" | 不引入新 user-visible 错误类型；最小改动。用户从 panel 视角行为一致（真 timeout 与真 restricted 在 panel 上显示同一文案） |
| **Open_url commit 失败处理** | handler-level fail，**不** STOP task；不撤销失败的 tab | 让 LLM 自决重试 / 调 close_tabs。tab 留存便于用户手动 debug。STOP task 会让 LLM 失去重试机会 |
| **不复活 confirm 路径** | 严守 | confirm 层 2026-05-08 已删；transient 容忍纯属 observation timing 问题，无 user approval 维度 |
| **不动 isRestrictedUrl** | 保持现有 `about:` 拦截语义 | transient 容忍在调用前判断；保留 isRestrictedUrl 作为 settle 成功后的 defense-in-depth |
| **不动 withActionSettle** | click/type/keyboard 现有 settle 不重构 | 二者语义独立；loop 顶部 settle 已能接住 withActionSettle 漏掉的 race（quietMs=500 不够的慢站场景） |

## Architecture

### 1. 模块组织

| 路径 | 状态 | 责任 |
|---|---|---|
| `src/lib/agent/wait-for-url-settle.ts` | **NEW** | navigation-commit 等待 helper（独立模块） |
| `src/lib/agent/loop.ts:912` | **MODIFIED** | 顶部 origin check 之前加 transient 容忍 |
| `src/lib/agent/tools/tabs.ts` openUrlTool | **MODIFIED** | chrome.tabs.create 之后 await settle |
| `src/lib/agent/wait-for-settle.ts` | 不动 | 现有 `withActionSettle` 稳定，不重构 |
| `src/lib/agent/loop.ts:319` `isRestrictedUrl` | 不动 | 保持 `about:` 拦截语义 |
| `src/lib/agent/tools/tabs.ts` focusTabTool | 不动 | 仍是 always-low 指针更新；下一轮顶部 settle 接住 |
| `manifest.json` | 不动 | webNavigation permission 已就位（recording v1 引入） |

### 2. `waitForUrlSettle` 接口

```ts
// src/lib/agent/wait-for-url-settle.ts

export type UrlSettleResult =
  | { committed: true; url: string }
  | {
      committed: false;
      reason: "timeout" | "origin-mismatch" | "tab-gone";
      observedUrl?: string;
    };

export async function waitForUrlSettle(
  tabId: number,
  expectedOrigin: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<UrlSettleResult>;
```

**实现要点**：

- 注册 `chrome.webNavigation.onCommitted` listener（filter `details.tabId === tabId && details.frameId === 0`）—— 不挂 `onHistoryStateUpdated`，因为 transient → settle 关心的是 cross-doc commit，SPA pushState 不从 about:blank 触发
- listener 触发时 `await chrome.tabs.get(tabId)`，`safeParseOrigin` 解析：
  - origin === expectedOrigin → resolve `{committed: true, url}`
  - origin !== expectedOrigin → resolve `{committed: false, reason: "origin-mismatch", observedUrl}`
  - tabs.get reject → resolve `{committed: false, reason: "tab-gone"}`
- `setTimeout(timeoutMs)` → resolve `{committed: false, reason: "timeout"}`
- `signal?.aborted` 已为 true，或 abort listener 触发 → reject `new DOMException("aborted", "AbortError")`。helper 不引入 "aborted" reason union 分支（避免污染 callsite 的 switch）；外层 loop 已有 `if (signal.aborted) return` 接管 finally 标准 abort emit 路径。callsite 用 `try/catch` 接 AbortError，re-throw 给上层
- `try/finally` 始终 `chrome.webNavigation.onCommitted.removeListener` + `clearTimeout` + 解绑 signal listener
- 并发安全：多次调用各自独立 listener，不互相影响

### 3. Loop 顶部改造（`loop.ts:912`）

```ts
const currentTab = await chrome.tabs.get(pinnedTabId);

// NEW: transient detection
if (!currentTab.url || currentTab.url === "about:blank") {
  // fast-fail: pendingUrl 已暗示目标 origin 不匹配
  if (currentTab.pendingUrl) {
    const pendingOrigin = safeParseOrigin(currentTab.pendingUrl);
    if (pendingOrigin && pendingOrigin !== pinnedOrigin) {
      await emitDone({
        type: "agent-done-task",
        success: false,
        summary: `Page origin changed from ${pinnedOrigin} to ${pendingOrigin}, agent stopped`,
        stepCount: stepIndex - 1,
      }, "abort");
      return;
    }
  }
  // wait for commit
  const r = await waitForUrlSettle(pinnedTabId, pinnedOrigin, 5000, signal);
  if (!r.committed) {
    let summary: string;
    if (r.reason === "origin-mismatch") {
      const observed = r.observedUrl ? safeParseOrigin(r.observedUrl) ?? "unknown" : "unknown";
      summary = `Page origin changed from ${pinnedOrigin} to ${observed}, agent stopped`;
    } else if (r.reason === "tab-gone") {
      summary = "Tab was closed, agent stopped";
    } else {
      summary = "Page navigated to a restricted URL, agent stopped"; // 复用现有文案
    }
    await emitDone({
      type: "agent-done-task",
      success: false,
      summary,
      stepCount: stepIndex - 1,
    }, "abort");
    return;
  }
  currentUrl = r.url;
  // fall through 到现有 isRestrictedUrl + origin check —— defense-in-depth
}

// existing isRestrictedUrl / safeParseOrigin / origin === pinnedOrigin checks
```

**控制流要点**：

- settle 成功后 `currentUrl = r.url`，但仍走下方现有 `isRestrictedUrl` + `safeParseOrigin` + `currentOrigin !== pinnedOrigin` 标准 check（defense-in-depth；settle 内已检验 origin，再走一次冗余但 safe）
- settle 期间 `signal.aborted` 通过 helper 的 signal 参数传播；helper resolve 后外层 loop 已有的 `if (signal.aborted) return` 接管
- 不动现有的 `chrome.tabs.get` catch 路径（tab.get reject → "Tab was closed"）—— settle 内的 tab-gone 与外层 catch 在不同时间点触发，二者并存

### 4. open_url handler 改造（`tabs.ts:1158`）

```ts
newTab = await chrome.tabs.create({ url: a.url, active });
if (typeof newTab.id !== "number" || newTab.id < 0) {
  return { success: false, error: "open_url: chrome returned no tab id" };
}

// NEW: wait for navigation commit
const r = await waitForUrlSettle(newTab.id, parsed.origin, 5000);
if (!r.committed) {
  return {
    success: false,
    error:
      `open_url: tab ${newTab.id} created but navigation did not commit to ${parsed.origin} ` +
      `within 5s (${r.reason}). The tab is left open — use close_tabs([${newTab.id}]) to clean up ` +
      `or retry with a different URL.`,
  };
}

// existing appendPinnedTab + success
```

**handler 失败语义**：

- handler 不 STOP task，仅返回 `{success: false, error}`；LLM 收到 observation 自决
- 不调 `chrome.tabs.remove(newTab.id)` —— 保留 tab 便于用户 debug；LLM 可显式 `close_tabs` 清理
- error message 携带 reason + 清理提示，让 LLM 有结构化决策依据
- `appendPinnedTab` 仅在 commit 成功后调用 —— pinnedTabs[] 不残留 transient 失败的 tab

## Data Flow

### 正常路径（用户报告的场景修复版）

```
T0          LLM: open_url("https://docs.example.com")
T0+5ms      SW:  chrome.tabs.create → tab.id=42, url=about:blank
T0+8ms      SW:  waitForUrlSettle(42, "https://docs.example.com", 5000)
                 → 注册 onCommitted listener (frameId=0, tabId=42)
T0+1.2s     Chrome: onCommitted 触发
                 → tabs.get(42).url = "https://docs.example.com/..."
                 → origin 匹配 → resolve {committed: true, url}
T0+1.2s     SW:  appendPinnedTab + 返回 success observation
T1          SW:  下一轮起手 → tab.url 已是目标 URL
T1+2ms      SW:  标准 origin check 通过 → snapshot → 继续 ReAct
```

### Fast-fail 路径（transient 期间 navigation 漂去别的 origin）

```
T0          (任意触发) → tab pinned 在 https://A.com
T1          下一轮起手 → tabs.get(pinnedTabId)
                 → url=about:blank, pendingUrl="https://B.com/..."
T1+1ms      safeParseOrigin(pendingUrl)="https://B.com"
                 → !== pinnedOrigin "https://A.com"
T1+2ms      emitDone STOP "Page origin changed from https://A.com to https://B.com"
            （不走 5s wait，直接出错）
```

### Timeout 路径（极端慢站 / 真停 about:blank）

```
T0+8ms      waitForUrlSettle 注册 listener
T0+5s       setTimeout 触发
                 → resolve {committed: false, reason: "timeout"}
T0+5s+1ms   loop / handler 各自走 fall-through:
            - loop 顶部: emitDone STOP "Page navigated to a restricted URL, agent stopped"
            - open_url handler: return {success: false, error: "did not commit within 5s"}
```

## Error Handling Matrix

| wait 结果 | loop 顶部行为 | open_url handler 行为 |
|---|---|---|
| `committed: true, url` | 更新 currentUrl，fall-through 到现有 origin check | `success: true` + appendPinnedTab |
| pendingUrl fast-fail（origin 不匹配） | STOP "origin changed" — 不走 wait | 理论不到此分支（handler 内传的 expectedOrigin = LLM 给的 URL origin） |
| `committed: false, reason: "origin-mismatch"` | STOP "origin changed from X to Y" | `success: false` + error |
| `committed: false, reason: "timeout"` | STOP "restricted URL"（复用现有文案） | `success: false` + "did not commit within 5s" |
| `committed: false, reason: "tab-gone"` | STOP "Tab was closed" | `success: false` + "tab gone" |
| signal aborted（user Stop / external abort） | helper resolve 后外层 `if (signal.aborted) return` 接管 finally 标准 abort emit | handler ctx 的 signal 协作 |

## Coverage Matrix

| navigation 触发路径 | 谁接住 | 备注 |
|---|---|---|
| `open_url` 创建新 tab | open_url handler settle | 主要场景；用户报告的原 race |
| open_url + 同轮 focus_tab + 慢站 | open_url handler 已等到 → loop 顶部不再 transient | 双保险都不需要触发 |
| **click** 触发 cross-doc nav | 现有 `withActionSettle` + loop 顶部 settle | quietMs=500 不够时顶部接住（顺手 close R11 false-positive backlog） |
| `type` + Enter 触发 form submit | 同上 | 同上 |
| 页面 JS 自跳 / `<meta http-equiv="refresh">` | loop 顶部 settle | 无 handler 可挂 |
| 用户手动操作 pinned tab（刷新 / 回退 / 前进） | loop 顶部 settle | 同上 |
| `focus_tab` 切到加载中 tab | loop 顶部 settle | focus_tab handler 仍是指针更新，不挂 wait |

## Testing Strategy

### 新增 unit tests — `src/lib/agent/wait-for-url-settle.test.ts`

- onCommitted 触发 origin 匹配 → `{committed: true, url}`
- onCommitted 触发 origin 不匹配 → `{committed: false, reason: "origin-mismatch", observedUrl}`
- 5s 内无 onCommitted 事件 → `{committed: false, reason: "timeout"}`
- tabs.get reject → `{committed: false, reason: "tab-gone"}`
- signal abort → reject `AbortError`（不污染 reason union；外层 loop 的 abort 路径接管）
- listener cleanup 验证 —— commit / timeout / abort / tab-gone 四条路径都断言 `removeListener` 调用
- 并发安全 —— 两个 tabId 并发 settle，各自 listener 不互相串扰
- frameId !== 0 的 onCommitted 事件不触发 resolve（sub-frame 不影响顶层 commit 判定）

### 扩 `src/lib/agent/loop.test.ts`

- transient url + commit ≤5s + origin 匹配 → 继续 snapshot 正常路径
- pendingUrl 解析 origin 不匹配 → STOP "origin changed"（断言文案）+ 不调 settle（节流断言）
- 5s timeout → STOP "restricted URL"（断言文案沿用现有，与真 restricted 一致）
- 非 transient url（http/https）→ 不调 settle，直接走现有路径（节流断言）
- settle 内 origin-mismatch → STOP "origin changed"（区别于 fast-fail，summary 内 observed origin 来自 r.observedUrl）

### 扩 `src/lib/agent/tools/tabs.test.ts` (openUrlTool)

- chrome.tabs.create + commit 成功 → 现有 success path 不变（appendPinnedTab 调用、observation 文案）
- chrome.tabs.create 成功 + waitForUrlSettle timeout → handler fail with 描述性 error（断言 close_tabs 提示 + reason 提及）
- chrome.tabs.create reject → 现有 path 不动（不进 waitForUrlSettle）
- commit 失败时 `appendPinnedTab` 不调用（pinnedTabs[] 不残留）

### Cross-layer regression

- panel 端收到 done summary：
  - 慢站 + commit 成功路径不再出现 "restricted URL" 误报
  - 5s timeout 路径与真 restricted 路径在 panel 显示同一文案（决策 4 设计）
- 现有 `withActionSettle` 测试套件全部沿用，不修改
- 现有 `isRestrictedUrl` 单测沿用（验证 about: 拦截行为不变）

## Out of Scope

- **不动 `isRestrictedUrl`** —— `about:` 拦截语义不变；transient 容忍在调用前判断
- **不动 `withActionSettle`** —— click/type/keyboard 现有 settle 不重构；二者语义独立
- **不引入新 user-visible 错误文案** —— timeout 复用 "restricted URL"（决策 4）
- **不撤销 commit 失败的 tab** —— LLM 自决 `close_tabs`
- **不动 manifest** —— webNavigation permission 已就位
- **不复活 confirm 路径** —— confirm 层 2026-05-08 已删，本期严守
- **不动 `focus_tab` handler** —— always-low 指针更新；下一轮顶部 settle 接住
- **不挂 `onHistoryStateUpdated`** —— transient → settle 仅关心 cross-doc commit，SPA pushState 不从 about:blank 触发
- **不抽出共用 listener 基类** —— `withActionSettle` 与 `waitForUrlSettle` 语义独立；强行抽公共会污染稳定模块
- **`status === "loading"` 不作为 transient trigger** —— SPA 大站子资源加载会让 status=loading 持续很久，但 url 已 commit 到目标；只 trigger on url sentinel

## Acceptance Gates

- 现有 700+ 测试全过
- 新增 `wait-for-url-settle.test.ts` 全过
- 扩 `loop.test.ts` 节流断言通过（非 transient 路径不调 settle）
- 扩 `tabs.test.ts` openUrlTool 双路径（commit / fail）通过
- Cross-layer regression：慢站手动 open_url 验证不再撞 restricted（manual smoke + 至少 1 个集成测试覆盖 onCommitted timing）
- ROADMAP §10 中 "R11 click-induced nav false-positive" 标记为已收敛（顺手 close）

## Trace Doc Target

ship 后写 `docs/solutions/<ship-date>-navigation-transient-tolerance-invariant-trace.md`，包含：

- T-nav-1：transient trigger 仅在 `url === "about:blank" || !url` 时启动（不在 status=loading）
- T-nav-2：fast-fail 仅在 pendingUrl 存在且 origin 不匹配时触发
- T-nav-3：5s timeout 复用 "restricted URL" 文案（与真 restricted 在 panel 无视觉差异）
- T-nav-4：open_url commit 失败不 STOP task、不撤销 tab、不写 pinnedTabs
- T-nav-5：confirm 层不复活（settle 不引入 user-approval 维度）
- T-nav-6：`withActionSettle` / `isRestrictedUrl` / `focus_tab` / manifest 各自不动的 build-time / runtime 断言
