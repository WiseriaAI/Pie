# Record & Replay v1 — Invariant Trace

落地的所有 invariant + 验证点，给后续维护参考。

## Invariant 列表

| Code | 描述 | 验证点 |
|---|---|---|
| REC-A | 录制 skill 必为 author='user'，绝不 'agent'（防 R10 误触发） | recording-orchestrator.test.ts case "handleRecordingFinish writes user-authored skill" |
| REC-B | promptTemplate ≤ 8KB（复用 Phase 2.6 P0-D） | serialize.test.ts "throws PromptTooLargeError" + SaveSkillDialog.test.tsx "byte counter shows red over-limit" |
| REC-B2 | parameters schema strings ≤ 2KB（复用 Phase 2.6 P0-B） | recording-orchestrator.ts handleRecordingFinish countAllStringChars 校验 |
| REC-C | allowedTools ⊂ ALL_KNOWN_NON_SKILL_TOOL_NAMES（复用 Phase 2.6 P1-G） | recording-orchestrator.ts handleRecordingFinish loop |
| REC-D | 录制 SW state in-memory only — 绝不 chrome.storage.set | storage-invariant.test.ts grep 检测 |
| REC-E | Save dialog = capability review surface（4 必备元素） | SaveSkillDialog.test.tsx case "renders all 4 review elements on mount" |
| REC-F | Multi-session sandbox：sender.tab.id 决定归属 session，panel 仿造 sessionId 不生效 | recording-orchestrator.test.ts case "rejects action from non-recorded tabId" |
| REC-G | Sensitive 字段绝不带 selectorHint（即使有 id/name） | selector.test.ts case "NEVER attaches selectorHint for sensitive fields" |
| REC-H | 录制中点链接（hard nav）→ webNavigation.onCommitted 重 inject + record navigate action | recording-orchestrator.test.ts case "handleRecordingNavCommitted records navigate + re-injects" |
| REC-I | session 切换 / panel disconnect / SW restart / tab close → 自动 abort + 无残留 state | useRecording.test.ts case "session change while recording fires discard automatically" + recording-orchestrator.test.ts cases for tabClosed / abortRecording。**测试覆盖 panel-side 主动 discard，production 主路径其实是 SW onDisconnect 触发 abortRecordingForSession(panel-disconnect)**——重构 useSession.port 生命周期时注意这块由两条腿撑着 |
| REC-J | 重录覆盖时（user 在 SkillsList 编辑录制 skill）走 saveSkill (delete-then-create), 不走 update_skill（保 author='user'） | 注：v1 不暴露"重录覆盖"快捷入口；用户先 delete 再录新的。Future improvement Backlog 里 |
| REC-K | promptTemplate 中文（决议 3）；i18n 切换只动 STEP_TEMPLATES | serialize.ts 顶部 `STEP_TEMPLATES` 常量 |
| REC-L | Agent task streaming 时 reject 录制（双层 gate：panel RecordButton disabled + SW handleRecordingStart 校验 inFlightSessionIds） | recording-orchestrator.test.ts case "rejects start when active session is streaming agent task (SW-side gate)" |
| REC-M | capture.ts ↔ selector.ts label 双实现 parity | capture.integration.test.ts PARITY case，比对 describeElement 输出 |
| REC-N | capture.ts ↔ redact.ts redact parity | capture.integration.test.ts PARITY case `redacted` / `placeholderName` 断言 |
| REC-O | installCaptureListener idempotent（防 SW 重启 / 二次 inject 双倍 capture） | capture.integration.test.ts case "idempotent install: a second installCaptureListener() does not double-attach listeners" |

## 复用现有 invariant 列表

录制 v1 不引入新的 risk / capability / dispatch 路径——以下既有 invariant 自动覆盖回放：

- Phase 2 dom-actions 整套（click/type/scroll/select 工具签名 + 风险等级）
- Phase 2.5 CDP keyboard（canvas editor 录制中如果走 type 工具，依然走 CDP path）
- Phase 2.6 R10 first-run-confirm（**仅** author='agent' fire，录制 skill 不 fire——决议 2）
- Phase 2.6 capability-grant 8 项（P0-A...P1-H 全适用）
- Phase 3 cross-tab + Phase 5 screenshot risk classifier（回放期 LLM 调 cross-tab 工具自然走 confirm card）
- M1 paused/resume（录制 session 不进 paused/resume，因为不持久化）
- M3 multi-session sandbox（每 RecordingSession 绑 sessionId + tabId，跨 session 不串味）
- v1.5 multi-pin（开新 tab/cross-origin nav 录制依赖 webNavigation；回放期开 url 走 open_url 工具）

## v1 显式不做（v1.1+）

- Cross-tab 录制（用户在录制中开新 tab 也录入）
- 数据循环（N 行 csv → 跑 N 次同一步骤）
- 重录覆盖快捷入口（保 author='user' 路径）
- promptTemplate i18n（仅切换 STEP_TEMPLATES 即可）
- selector.ts 与 capture.ts 之间的 ambiguous-region disambiguation parity（capture 没有 snapshot 上下文计算 regionSiblingCount）
