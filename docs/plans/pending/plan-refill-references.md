# 引用 chip 回填：撤回后把 @文件/目录引用以 chip 形式放回输入框

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：待实施
> 契机：dsh 0.2.1-alpha.1 引入结构化草稿（`DraftSnapshot`）并把 `SessionInputShell.setDraft` 参数放宽为 `DraftInput`——引用 chip 首次可被程序化写入（评估实证见 [upgrade-assessments/dsh-0.2.1-alpha.1.md](../../upgrade-assessments/dsh-0.2.1-alpha.1.md) §三观察项①）。
> 前置基线：现有回填链（文本 + 图片附件 + 队列清理，[src/client/recall-node.ts](../../../src/client/recall-node.ts) `fillDraft`）在 0.2.1-alpha.1 上零漂移，本计划是**增量包装**，不改其既有行为。

---

## 目标

被撤回消息的文本里若包含 `@文件/目录` 引用（模型形式即 `@path`），撤回后回填输入框时把它们重建为**可点击的引用 chip**，而不是现在的纯文本——让输入框回到与发送前一致的视觉与交互状态（点击可打开文件）。

边界（本期不做）：

- **只做 file / folder 引用**（`appearance: 'file' | 'folder'`）。session 引用（`appearance: 'session'`）的 mention 形态未经实测，留待后续按需评估。
- **不做存在性预校验**：引用目标文件可能已被 reset 恢复或删除，官方 chip 自带 `invalid` 失败态渲染，接受它作为反馈；不为此引入 `remote.fileReferences` 依赖。
- **不改附件链**：上传文件（`file` 块）仍无回读通道（官方 `readAttachment` 是 image 专用），维持现有 toast 降级。

## 背景与依据（0.2.1-alpha.1 实证）

- **引用模型**：`DraftSnapshot { text, references: DraftReference[] }`；`DraftReference = Omit<Occurrence, 'occurrenceId'>`，字段 `source` / `ref` / `offset` / `length` / `label` / `appearance` / `clipboardText`（外加可选 `invalid`）。硬约束：references 的 span 有序、互不重叠，且 `text[offset..offset+length)` 必须逐字等于 `clipboardText`。
- **chip 身份可复原**：官方 `@` 引用 source（`dsh-client-ui-reference`）的 file/folder 分支里 `ref` = `mention` = `@path` 文本、`clipboardText` 同值、codec 恒等（`serialize: (ref) => ref`）——即**消息文本里的 `@path` 就是完整重建信息**，无需外部状态。
- **写入面**：插件持有的 `conversation.input.shell(id)` 即 `SessionInputShell`，其 `setDraft(text: DraftInput)` 自 0.2.1-alpha.1 起接受结构化输入（旧版只有 `string`）。
- **旧版约束**：0.1.2 线至 0.2.0 线只吃 `string`；探测失败必须走现状路径（`shell.actions.setDraft(text)`）。
- **已知脆弱点**：`source: 'reference'` 是官方内部实现名（非公开契约）；`@path` 与用户手打 `@xxx`（邮箱等）在文本上不可区分——须按 mention grammar 严格判定并接受误判降级。

## 任务分解

### M1 能力探测与数据通路（骨架）

1. 探测点：`typeof shell.requestDraftInitialization === 'function'`（0.2.1-alpha.1 独有成员）或 `'draftSnapshot' in shell`——命中才允许结构化路径；探测失败零行为变化。
2. `fillDraft(targetSessionId, draftText, attachmentFiles)` 扩展为可携带 `draftInput`（结构化的 `{ text, references }`）；探测失败或构造为空引用时仍传 string。
3. 旧版分支保持现状：`shell.actions.setDraft(text)` → `shell.setDraft(text)`（fallback 顺序不变）。

### M2 mention 扫描器 + references 构造器（纯函数，单测直钉）

1. 新建纯函数模块（建议 `src/client/mention-scan.ts`，模块级导出，沿用项目「纯函数供单测」惯例）：
   - `scanMentions(text): MentionSpan[]`——扫描 `@path` / `@"path with spaces"` / 目录尾斜杠形态；`@` 前必须是行首或空白（排除邮箱等词内 `@`，与官方 `activeAtToken` 同款判据）。
   - `buildDraftReferences(text): DraftReference[]`——由 span 构造 references：`offset`/`length` 为 UTF-16 坐标；`label` 取末段（目录带尾 `/`）；`appearance` 按尾斜杠分 file/folder；`clipboardText` 必须与文本片段逐字相等（构造后自校验，不等即丢弃该条）。
2. 保守过滤：无法干净判定的片段一律保留纯文本（宁可少转，不可错转）。

### M3 写入路径与降级

1. 新版：`shell.setDraft({ text, references })`；旧版/探测失败/构造异常：现状 string 路径。
2. 全链 try/catch：chip 构造或结构化写入的任何异常 → 降级纯文本回填，不阻断撤回主流程。
3. 有界重试语义沿用 `fillDraft` 现状（8 次 × 150ms），结构化调用并入同一 `attempt`。

### M4 配置开关 + 文案 + 测试

1. 配置项 `refillReferences`（默认开；建议默认开——引用 chip 与纯文本的模型形式等价，失败自动降级）：`src/host/config.ts` 的 schema 与 `DEFAULTS` 镜像**两处同步**，`cordis.patch.yml` 不列（按 schema 下发默认值）；`init` / `config-get` / `config-set` 三处透传与 `config-card.ts` 开关行同步。
2. i18n 文案（`locales/zh.ts` 先落、`en.ts` 同步）：开关标签与一句话说明；不新增降级 toast（降级静默，避免噪音）。
3. 单测：扫描器矩阵（普通 `@`、邮箱/词内 `@`、quoted 空白路径、目录尾斜杠、多引用、`@` 在行首/行中、无引用）、构造器（offset/length 精确性、自校验丢弃、span 不重叠不越界）。
4. client 测试：mock shell 断言两分支载荷形态（新版 `setDraft(对象)` / 旧版 `setDraft(string)`）、探测失败的降级路径。

### M5 实弹验证（dsh 0.2.1-alpha.1 真宿主）

1. 发送含 `@文件`、`@目录/`、`@"含 空格路径"` 的消息 → 撤回 → 输入框出现对应 chip（可点击、打开正确目标、与发送前视觉一致）。
2. 回归：图片附件回填不受影响；纯文本消息回填与现状逐字一致；探测失败的旧版本行为不变（如无旧环境则以 mock 单测覆盖）。
3. 边界实弹：手打普通 `@` 文本不被误转（或误转后的 invalid 表现可接受并记录）。

## 改动落点

| 落点 | 内容 |
|---|---|
| `src/client/recall-node.ts` | `fillDraft` 探测与 DraftInput 组装；调用扫描器；`preloadAttachmentFiles` / `startAttachDrafts` 不动 |
| `src/client/mention-scan.ts`（新建） | 扫描器与构造器纯函数（含 span 自校验） |
| `src/types/client-contract.ts` | `shell.setDraft` 签名放宽为 `string \| DraftSnapshot` 双兼容；探测点声明（`requestDraftInitialization` / `draftSnapshot` 可选成员） |
| `src/types/config.ts` + `src/host/config.ts` | 新增 `refillReferences`（schema + DEFAULTS 镜像两处） |
| `src/host/routes-core.ts` / `routes-manage.ts` | `init` 与 `config-get/set` 的 config 子集透传新字段（沿用既有模式） |
| `src/client/config-card.ts` + `src/client/locales/{zh,en}.ts` | 开关行 + 文案（key 集合与占位符对齐由 locales-parity 测试钉） |
| `tests/unit/mention-scan.test.js`（新建）+ `tests/client/recall-node.test.ts` | 扫描/构造矩阵与双分支载荷断言 |
| `docs/` | 本计划状态流转；`AGENTS.md` 合规清单与 `docs/compat-audit.md` 对应条目（如新增探测点）按需同步 |

## 验收标准

- 新版实弹：含 `@文件` / `@目录/` / `@"空格路径"` 的消息撤回后，输入框出现**可点击且目标正确**的 chip；再次发送后模型收到的文本与撤回前逐字一致（`@path` 形态）。
- 降级为零破坏：探测失败、构造为空、写入异常三种情形下，回填行为与现状（纯文本）逐字一致；旧版本线（0.1.2–0.2.0）行为不变。
- 误判受控：单测矩阵覆盖 email/词内 `@` 排除；无法判定片段一律留纯文本；`invalid` chip 不产生控制台报错。
- 门禁全绿：`npm test`、`npm run test:client`、`npm run typecheck`、`npm run check:upgrade`；发版前活体冒烟含本特性的专门小节（并入 smoke-checklist 新批次）。

## 风险与回退

| 风险 | 等级 | 处置 |
|---|---|---|
| `source: 'reference'` 为官方内部实现名，改名即失效 | 中 | 探测 + 全链降级纯文本；chip 化失败不影响回填文本与撤回主流程；不在契约文档承诺该实现名 |
| `@path` 与手打 `@xxx` 不可区分（误判） | 中 | 严格 grammar（行首/空白前导）+ span 自校验 + 矩阵单测；配置开关可一键关闭 |
| 官方旧版本对结构化入参不识别（探测失效时误传对象） | 低 | 探测失败绝不传对象；降级路径有单测钉住 |
| 引用目标已不存在 → chip 渲染 invalid | 低 | 接受为反馈（官方自带失败态）；不引入存在性预校验依赖 |
| 官方草稿持久化把 chip 写入 storage 后的跨版本读取 | 低 | 官方 `parseStoredDraft` 自带 plain-string 兼容；插件不直接读写 storage |

**回退**：配置开关 `refillReferences` 关闭即回到纯文本回填；代码层所有失败分支收敛到现状路径，最坏情况等价于本计划未实施。
