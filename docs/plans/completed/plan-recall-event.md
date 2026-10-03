# plan-recall-event：撤回完成事件/回调（issue #19）落地方案

关联：GitHub issue #19（feat：撤回成功后发出事件/回调，供同宿主插件监听，如 Hindsight 长时记忆清理）。
定位：P2 feature，纯增量 opt-in，目标下一个 minor 版本。

> 实施注（2026-10-03 归档）：M1–M5 全部完成并验收通过（M5 实弹见 smoke-checklist-records.md 第十节）；实际按领导拍板以 **patch 2.4.8** 发布（非 M4 原定的 minor 2.5.0）——纯增量 opt-in、零默认行为变更按 patch 口径。

## 一、问题确认结果

对分析报告中「需进一步确认的问题」逐项确认如下，结论即本方案的契约形态，后续实施不再变更（如需变更回到本节修订并注明日期）。

### Q1 事件形态：单事件带 status vs 双事件

- **具体内容**：下游订阅的是一个带 `status` 字段的 `recall:complete`，还是 `complete` / `failed` 两个独立事件。
- **涉及范围**：`src/types/events.ts`（新建契约文件）、host emit 点、下游插件订阅代码、文档示例。
- **影响因素**：两分支 payload 形状差异大（failed 多 `stage`/`code`/`error`）；cordis 事件为字符串名，下游多注册一次仅一行成本；issue 提议的 `recall:complete` 直觉即「完成」语义，把失败塞进去会使 `childSessionId` 等字段语义模糊。
- **决策**：**双事件**——`dsh-recall/complete` 与 `dsh-recall/failed`。命名取 cordis 斜杠惯例 + 插件名命名空间防冲突（不用 issue 提议的 `recall:` 冒号式）。

### Q2 失败分支覆盖：execute 失败是否发事件

- **具体内容**：execute 返回 `ok:false`（AGENT_BUSY / NO_SNAPSHOT 等护栏拒绝）与 execute 抛异常，是否发 `failed(stage:'execute')`。
- **涉及范围**：client 上报分支数量、下游过滤负担、事件语义纯度。
- **影响因素**：execute 失败 = 未产生任何变更（一致态，下游本无需动作）；但 issue 原话要求「覆盖失败分支」；client 侧分支已存在，实现成本极低；护栏拒绝频率低，不构成事件风暴。
- **决策**：**覆盖**。统一走 `dsh-recall/failed` + `stage:'execute'`，透传 host 错误 `code`，下游按 `stage`/`code` 自行过滤。**唯一例外**：STALE 自动重预览是中间态（面板回到 confirm，用户可再次确认），不上报——文档显式注明。

### Q3 payload 是否带 root 及 null 容许

- **具体内容**：事件 payload 是否携带工作区根路径；`resolveRoot` 失败时的字段形态。
- **涉及范围**：host notify 端点 enrich 逻辑、payload 类型定义、下游按工作区过滤的能力。
- **影响因素**：报告者的记忆清理场景需要按工作区过滤记忆条目；notify 上报时原会话归档是 fire-and-forget，且「归档只隐藏列表、对象在内存」（routes-core.ts 既有注释），解析大概率成功；但 `archiveOriginal` 可关闭、`resolveRoot` 本身可返空。
- **决策**：**带 `root: string | null`**。host 端 `rt.resolveRoot(sessionId)` 尽力解析，异常或返空即 `null`，不阻断事件发送。

### Q4 是否标记 experimental

- **具体内容**：事件契约首发的稳定性承诺级别。
- **涉及范围**：文档措辞、semver 策略、报告者的集成信心。
- **影响因素**：报告者有生产集成需求，experimental 标签等于不给承诺；payload 已含 `version` 字段留出演进空间；事件纯增量 opt-in，受影响方只有主动订阅者。
- **决策**：**不标 experimental**，首发即稳定公共契约。演进规则：新增字段（additive）走 minor；破坏性变更走 major 且 `version` 升 2（下游可按 version 分流）。

### 补充语义决策（实施前锁定）

| 场景 | 事件 | 关键字段 |
| --- | --- | --- |
| execute 成功 + fork 成功 | `complete` | `chatReverted:true`、`childSessionId=<childId>` |
| execute 成功 + cutSeq 为 null（纯文件回退） | `complete` | `chatReverted:false`、`childSessionId:null` |
| execute 成功 + fork 抛错/返空 | `failed` | `stage:'fork'`——对话未回退，若发 complete 会导致下游误清记忆 |
| execute 返 `ok:false`（非 STALE） | `failed` | `stage:'execute'`、透传 `code` |
| execute 抛异常 | `failed` | `stage:'execute'`——此时文件是否已回退不确定，文档注明 |
| STALE 自动重预览 | 不发 | 中间态 |

## 二、处理目标

1. 同宿主任意 cordis 插件可通过 `ctx.on('dsh-recall/complete' | 'dsh-recall/failed', cb)` 获知撤回的终态，payload 足以支撑「撤销该回合写入的长时记忆」类下游动作（含 `sessionId`/`cutSeq`/`root`/`messageId`）。
2. 零行为变更：不发事件的撤回链路与现状逐字节一致；事件发送失败、监听器抛错、下游慢执行均不影响撤回主流程。
3. 契约文档化：README 给出事件名、payload 字段表、监听示例与版本演进规则，替代「第三方只能靠猜」的现状（同时覆盖 issue 的备选诉求）。
4. 非目标：不改 fork/archive 机制本身；不公开 `/api/recall/*` 路由注册表（exact 路由重复注册即抛错，包装不可行）；不提供撤回前的拦截/veto 能力。

## 三、方案设计

### 3.1 事件契约（新文件 `src/types/events.ts`，单一事实源）

```ts
export const RECALL_EVENT_COMPLETE = 'dsh-recall/complete'
export const RECALL_EVENT_FAILED = 'dsh-recall/failed'
export const RECALL_EVENT_VERSION = 1

export interface RecallCompleteEvent {
  version: 1
  sessionId: string             // 被撤回的原会话
  childSessionId: string | null // fork 出的新会话；纯文件回退时为 null
  scope: 'both' | 'session-only'
  cutSeq: number | null
  messageId: string             // 被撤回消息 ID（快照主键）
  root: string | null           // host enrich，解析失败为 null
  count: number                 // 回退文件数（session-only 恒 0）
  chatReverted: boolean
  archiveRequested: boolean     // 归档为 fire-and-forget，仅表示已发起
  time: number                  // host 收到上报的时间（ms）
}

export interface RecallFailedEvent {
  version: 1
  stage: 'execute' | 'fork'
  sessionId: string | null
  messageId: string
  scope: 'both' | 'session-only'
  cutSeq: number | null
  root: string | null
  code?: string                 // stage='execute' 时透传 host 端点错误码
  error: string
  time: number
}
```

### 3.2 Host：`notify` 端点（routes-core.ts）

- 不进串行队列（无 git 操作）、不依赖 store（避开 lineage-record 的 NO_STORE 早退缺陷）。
- 流程：校验 `status`/`sessionId`/`messageId`（缺失 → 复用现有 `RECALL_BAD_TYPE`，不新增错误码）→ `rt.resolveRoot` enrich（catch → null）→ 组装 payload（`version`、`time: Date.now()`）→ `queueMicrotask(() => { try { deps.emitEvent(name, payload) } catch { /* warn 留痕 */ } })` → 恒 `{ ok: true }`。
- `RoutesCoreDeps` 新增 `emitEvent(event: string, payload: unknown): void`；index.ts 装配处以闭包注入 `(event, payload) => ctx.emit(event, payload)`（保持 ctx 不解构纪律，且单测可注入桩）。`HostContext` 接口补 `emit(event: string, ...args: unknown[]): unknown`。
- 异步化 + try/catch 是硬要求：同步 emit 时下游抛错或慢执行会直接反噬端点响应与撤回链路。

### 3.3 Client：终态上报（recall-node.ts `executeRecall`）

- 抽纯函数 `buildRecallNotify(...)`（模块级导出或入 util.ts）负责按 execute/fork 结果组装 `RecallNotifyArgs`，便于单测覆盖 Q1-Q3 的全部场景矩阵。
- 上报点与第一节「补充语义决策」表一一对应；统一 `api('notify', payload).catch(() => {})` fire-and-forget——版本错位（新 client + 旧 host）时 exact 路由未命中返 404 或 `RECALL_UNKNOWN_ENDPOINT`，静默忽略即可，旧 host 只是永远不发事件。
- 行数预算：recall-node.ts 当前有效行数 ~552，预计 +50 行内，无拆分压力；routes-core.ts ~165，同理。

### 3.4 版本错位矩阵

| client | host | 行为 |
| --- | --- | --- |
| 新 | 新 | 正常发事件 |
| 新 | 旧 | notify 404/未知端点，client 静默忽略，撤回不受影响 |
| 旧 | 新 | 从不调用 notify，事件永不触发（文档注明） |

## 四、具体实施步骤

### M1 契约层（类型）

1. 新建 `src/types/events.ts`（§3.1 全文）。
2. `src/types/api.ts`：新增 `RecallNotifyArgs` / `RecallNotifyResponse`（`{ ok: true } | ErrBody`）。
3. `src/types/dsh-contract.ts`：`HostContext` 补 `emit` 声明（与既有 `on` 并列）。
4. tests/types 编译断言补 events 契约（与 scripts 契约同款套路）。

验收：`npm run build`（含 types 检查）通过。

### M2 Host 端点

1. `src/types/state.ts` 或 routes-core 本地：`RoutesCoreDeps` 加 `emitEvent`。
2. `src/host/routes-core.ts`：实现 `notify` 端点（§3.2）。
3. `src/host/index.ts`：装配 deps 时注入 `emitEvent: (event, payload) => ctx.emit(event, payload)`。
4. 单测（routes-core 既有测试文件追加）：参数校验缺失码、root enrich 成功/失败、emit 异步触发、监听器抛错不影响 `{ ok: true }`。

验收：新增单测全过；`npm test` 无回归。

### M3 Client 上报

1. `buildRecallNotify` 纯函数 + 单测（场景矩阵全列覆盖）。
2. `executeRecall` 五个上报点接线（execute 拒、execute 抛、fork 抛、fork 返空、done），全部 fire-and-forget。
3. `npm run build` 同步 lib/ 产物（构建产物随源码提交，CI 钉新鲜度）。

验收：纯函数单测全过；构建产物 diff 与源码同步。

### M4 文档与发版

1. README 新增「事件契约」章节：事件名、payload 字段表、Q2 的 STALE 例外、Q4 的 semver 演进规则、监听示例：

```js
// 同宿主插件内
ctx.on('dsh-recall/complete', (e) => {
  if (e.chatReverted) memory.purgeTurn(e.root, e.sessionId, e.cutSeq)
})
ctx.on('dsh-recall/failed', (e) => {
  if (e.stage === 'fork') log.warn('文件已回退但对话未回退', e)
})
```

2. `CODEBUDDY.md` 文件地图：routes-core 行加 notify、`src/types/` 行加 events.ts。
3. CHANGELOG + minor bump（2.4.7 → 2.5.0）。

验收：文档示例与实际 payload 逐字段一致（对照 events.ts）。

### M5 实弹验证（人工）

1. 写一个最小测试插件 `ctx.on` 双事件并打印，跑真实撤回：both、session-only、无切点三种场景，核对 payload 字段。
2. 注入 fork 失败（断网/桩改返空）→ 收到 `failed(stage:'fork')` 且无 `complete`。
3. 监听器内 `throw` → 撤回照常完成，无未捕获 rejection。
4. 旧 host（2.4.x）+ 新 client 混合跑一遍撤回 → 无报错。

验收：四项全过；结果记录到 smoke-checklist-records.md。

## 五、验收标准（汇总）

- [ ] 单测与 types 断言全过，CI 绿（含 lib/ 新鲜度检查）
- [ ] 双事件名、payload 字段与 `src/types/events.ts` 完全一致；README 示例可直接粘贴运行
- [ ] 真实撤回三场景（both / session-only / 无切点）均收到 `complete` 且字段正确
- [ ] fork 失败场景收到 `failed(stage:'fork')`，execute 拒绝收到 `failed(stage:'execute')` 且 `code` 透传
- [ ] 监听器抛错、慢执行、旧 host 混合三种异常面下撤回主流程零影响
- [ ] issue #19 下回复方案与验证结果，@GTF2 确认 Hindsight 场景可用

## 六、风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 契约发布后受 semver 约束 | payload 带 `version:1`；additive 走 minor，breaking 走 major + version 升 2 |
| 版本错位 | §3.4 矩阵；client 静默容错；文档注明旧 client 不发事件 |
| 监听器反噬 | emit 一律 `queueMicrotask` + try/catch（单测钉死） |
| 下游误清（fork 失败却发 complete） | 语义决策表：fork 失败只发 `failed`；`complete.chatReverted` 二次确认 |
| 隐私面 | payload 不含消息正文；仅 ID/seq/路径，事件仅同宿主插件可见 |
| 重复通知（重试/多次撤回） | payload 含 `(sessionId, messageId, cutSeq)` 三元组供下游幂等，文档注明 |

## 七、后续跟进机制

1. **Issue 闭环**：M5 通过后于 issue #19 回复：方案摘要、事件契约全文、监听示例、发版号；@GTF2 验证 Hindsight 记忆清理场景，两周内无负面反馈后关闭 issue。
2. **契约演进守门**：后续任何对 events.ts 的改动必须在 PR 描述中声明 additive/breaking，breaking 需同步 major bump 与 README 迁移说明；review checklist 加「events.ts diff 必查」一条。
3. **消费方观察**：若出现第二个下游消费方，收集其对 payload 的增补需求，按 additive 规则演进；若半年内无任何消费方反馈，维持现状不扩展。
4. **归档**：issue 关闭后将本文档移至 `docs/plans/completed/`，并在 CODEBUDDY.md 核心机制节补一行事件接缝说明。
