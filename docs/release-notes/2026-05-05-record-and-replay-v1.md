# Record & Replay v1 — 网页操作录制 + AI 回放

**版本**：0.5.3 (录制 v1)
**日期**：2026-05-05

## 用户视角

- Top bar 新加 **Record** 按钮（在 Settings 旁）
- 点 Record → sidepanel 进入 RecordingMode：实时显示你在当前 tab 的每步操作
  （click / type / scroll / select / submit / 翻页）
- 完成后点 **Finish** → 弹出 Save dialog：检查所有步骤、可逐条删除、给 skill
  起名、保存
- 保存后该 skill 出现在 SkillsList，下次用 `/skillname` 在 chat 调用
- 回放时 LLM 看 promptTemplate 跟着步骤走，每步重新 snapshot 找元素，调用
  现有 click/type 工具——所有 risk 与 cross-origin invariant 不变

## 安全 / 隐私

- 密码 / cc-* / API token / 验证码 字段**绝不**写入 promptTemplate；统一替换
  成 `{{password}}` 等占位
- 录制 SW state 完全在内存中，绝不持久化；SW 重启 / panel 关闭 / 切到别的
  session 都会自动 abort
- Save dialog 是**唯一**的 capability review surface —— 用户保存前能看到全部
  步骤、推断的 allowedTools、推断的 parameters、实时字节数

## 已知限制（v1.1+）

- v1 只录单 tab：用户在录制中开新 tab / `open_url` 创建的 tab 不被记录。
  跨 tab 录制 deferred 到 v1.1
- v1 不录数据循环（"对每行记录都做这一组操作"）—— 固定步骤序列，没有 N
  行循环
- 录制 SPA route change 依赖 `history.pushState`/`replaceState`；某些自定义
  router 跳过这俩 API 时不被记录（fallback：用户手动 demo 一个 click 触发跳转）

## Trace

- Plan: `docs/superpowers/plans/2026-05-05-record-and-replay.md`
- Spec: `docs/superpowers/specs/2026-05-04-record-and-replay-design.md`
- Invariant trace: `docs/solutions/2026-05-05-record-and-replay-v1-invariant-trace.md`
