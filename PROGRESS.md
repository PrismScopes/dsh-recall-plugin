# PROGRESS — 撤回完成事件/回调（issue #19，v2.5.0）

任务来源：docs/plans/pending/plan-recall-event.md（唯一规格）。

## 任务 0：基线核对（2026-10-03 实测）

- `npm run typecheck` → 退出码 0 ✅
- `npm test` → 37 files / 478 tests 全绿 ✅
- `npm run test:client` → 6 files / 83 tests 全绿 ✅
- `npm run build` → 成功，`git diff --exit-code lib/` = 0（产物新鲜）✅
- `npm run verify:host` → 全绿，端点 12 项 ✅

全部对上任务书基线，可以动工。

理解的目标 / 顺序 / 最大风险（≤10 行）：
1. 目标：撤回终态发出 cordis 事件 `dsh-recall/complete` / `dsh-recall/failed`（契约 src/types/events.ts，payload 按 §3.1），host 加 notify 端点（§3.2），client executeRecall 五处上报（§3.3），文档+版本 2.5.0。
2. 顺序：任务 1 契约层 → 任务 2 host 端点（含 verify-host 反向验证 红→绿）→ 任务 3 client 上报 → 任务 4 文档与版本。
3. 最大风险：事件语义错发——fork 失败发 complete 会误导下游清记忆；严格按规格第一节决策表接线，单测逐场景钉死。
4. 次要风险：emit 同步反噬端点（下游抛错/慢执行）——queueMicrotask + try/catch 单测钉死。
5. 行数红线：recall-node.ts 基线 552 有效行（改前实测见任务 3 节），上限 800。

## 环境备注

- HEAD 中的 PROGRESS.md/BLOCKED.md 是旧任务（issue #15，commit 215cf55）遗留，工作区已删除；本文件为本次任务重写。
- `git status` 中 `.agents/skills/*`、`AGENTS.md` 的修改与 `docs/plans/pending/plan-recall-event.md` 为任务开始前已存在的工作区改动（非本次任务引入），不在本次白名单管辖内，保持原样。

## 任务 1 契约层 ✅

- [x] 按 §3.1 建 `src/types/events.ts`（事件常量 + RecallCompleteEvent/RecallFailedEvent）
- [x] api.ts 加 RecallNotifyArgs / RecallNotifyResponse（字段=两类 payload 并集读取侧可选）
- [x] dsh-contract.ts HostContext 补 emit 声明（与 on 并列最小面）
- [x] tests/types/events-contract.test.ts（事件名字面量钉死 + payload 形状断言）
- 验收：`npm run typecheck` 退出码 0 ✅

**实施差异（构建形态调和，记档）**：build-host.mjs 逐文件转译只覆盖 src/host/ 16 产物，
types/ 不落 lib/——host 产物运行时 import events.ts 常量会 MODULE_NOT_FOUND，而白名单
不许改 build-host.mjs。故 host 侧事件名在 routes-core.ts 本地字面量声明（类型注解钉死），
与 events.ts 的绑定由 events-contract.test.ts 编译期双向赋值断言维持（漂移即 typecheck 红）；
client 侧 esbuild bundle 正常 import。规格「events.ts 单一事实源」在编译期保持成立。

## 任务 2 host notify 端点 ✅

- [x] RoutesCoreDeps 加 emitEvent；routes-core 实现 notify（校验→enrich→queueMicrotask try/catch→恒 ok:true）
- [x] index.ts 注入 `emitEvent: (e,p)=>ctx.emit(e,p)`（闭包，ctx 不解构纪律）
- [x] verify-host 反向验证：未加 'notify' 时跑 → 红（`注册路由数 == 端点数（13 vs 12）`+`新面-only（13 vs 12）`两处断言报警）→ 加后全绿「端点 13 项」✅
- [x] 新增 tests/unit/routes-notify.test.js 11 例：参数校验 5 / root enrich 成败 3 / emit 异步+字段 1 / 监听器抛错仍 ok 1 / stage-code 语义并入
- 验收：`npm test` 38 文件 489 例全绿（基线 478 + 11）✅；typecheck 0 ✅

**实施备注**：notify 单测首版断言「端点应答时事件尚未发出」过强——microtask 时序下
queueMicrotask 回调先于外层 await 恢复，规格要求的「不反噬」指异常不进调用栈而非响应
先发，断言改为 flush 后恰好一条（属新测试首版编写修正，非改既有测试）。

## 任务 3 client 上报 ✅

- [x] 行数基线：recall-node.ts 有效行数 552（awk 非空非注释，与任务书一致）；改后 573（+21），红线 800 内。util.ts 235 → 270。
- [x] `buildRecallNotify` 纯函数入 util.ts（组装与发送分离）+ `tests/unit/recall-notify.test.js` 8 例（规格 §一六场景全覆盖 + scope/兜底）。
- [x] executeRecall 五处上报接线，全部 `.catch(()=>{})` fire-and-forget：execute 拒（透传 code）/ execute 抛（stage:execute）/ fork 抛、fork 返空（stage:fork，不发 complete）/ done（chatError==='' 收口发 complete，防双发矛盾终态）。STALE 提前 return 不上报。
- [x] `tests/client/recall-node.test.ts` 追加 7 例（既有文件只追加，未动既有断言）：五点调用时机与载荷 + STALE 不发 + 上报失败静默不反噬。
- [x] types 编译面：RecallNotifyArgs 消费（util.ts）——client bundle 正常 import events 契约由 host 侧断言补（见任务 1 差异）。
- 验收：`npm run test:client` 6 文件 90 例全绿（83+7）✅；`npm test` 39 文件 497 例（478+19）✅；`npm run build` 成功，lib diff 恰为 client.js/index.js/routes-core.js 三个对应产物 ✅；typecheck 0 ✅。

## 任务 4 文档与版本 ✅

- [x] README.md / README.en.md 新增「事件契约（供同宿主插件监听）」章节：监听示例（规格 M4 原样）、两类 payload 字段表（逐字段对照 events.ts）、语义要点（STALE 不发 / fork 失败只发 failed / 三元组幂等 / 隐私面）、semver 演进、版本错位矩阵；双语一致；目录与测试节数字同步（39 文件 497 例 / 6 文件 90 例）。
- [x] CODEBUDDY.md 文件地图同步（routes-core 行加 notify、types 行加 events.ts）——**实施差异**：CODEBUDDY.md 是指向 AGENTS.md 的符号链接（同一文件），只能经 AGENTS.md 落地，已记 BLOCKED.md 待确认。
- [x] CHANGELOG.md 新增 `## [2.5.0] - 2026-10-03`（新增 + 测试两节，照现有条目格式）；package.json version 2.4.7 → 2.5.0（仅 version 字段）。
- 验收：build 后 `git status --porcelain` 全量核对，本次任务引入的改动全部落在白名单内（详见 BLOCKED.md 三条说明）✅

## 收尾门禁（2026-10-03 实测）

- `npm run typecheck` 退出码 0 ✅
- `npm test` 39 文件 497 例全绿（基线 478，只增不减；skipped 0）✅
- `npm run test:client` 6 文件 90 例全绿（基线 83，只增不减）✅
- `npm run verify:host` 全绿，「端点 13 项」✅（反向验证红→绿证据见任务 2）
- `npm run build` 成功；`git diff lib/` 恰为本次源码对应的 3 个产物（client.js/index.js/routes-core.js），无手改 lib/ ✅（commit 后 CI 的 `git diff --exit-code lib/` 即归零）
- 无 commit、无新增依赖。

## 建议路径偏离记录

- buildRecallNotify 放 util.ts 而非 recall-node.ts：省 recall-node 行数预算（+21 vs 预估 +50）且纯函数单测不必驱动组件。
- host 事件名本地字面量 + 编译期绑定断言：构建形态限制（见任务 1 差异），非主动偏离。

## BLOCKED

- 见 BLOCKED.md（3 条待确认，无技术阻塞）。

## M5 实弹验证 ✅（2026-10-03， Leader 授权执行，结果详录 smoke-checklist-records.md 第十节）

- 前置：cordis 4.0.4 复现脚本钉死「兄弟 fiber 普通 `ctx.on` 可听 `ctx.emit`」（emit 无 thisArg 时不做上下文过滤）；最小探针插件落 `~/.dsh/profiles/web/recall-event-probe`（bundle 装载需 `dsh.bundle.patch` 挂载行；`file:` 依赖会被 pnpm 复制、须用 `link:`），web profile link 模式加载 2.5.0 工作区构建。
- M5-1 三场景（浏览器 composer 实弹 + 真实撤回）：both / session-only / 无切点三条 complete 事件 payload 逐字段核对通过（chatReverted、childSessionId、cutSeq、count、archiveRequested、root、version），文件回退、fork、归档、回填全部实测正确。
- M5-2 fork 失败：API 直调 notify(stage:'fork) → `failed` 事件字段全对、无新增 complete。
- M5-3 监听器 throw（RECALL_PROBE_THROW=1 宿主 + 真实撤回）：探针先收到 payload 再抛错，宿主 `recall event emit failed` recordError 兜住（status API errors 可见），无 uncaught/fatal，宿主存活，撤回链完整。
- M5-4 旧 host（npm 2.4.6，注入 2.5.0 client.js，notify wire 返 404）+ 新 client：真实撤回无报错、回退/fork 照常、探针零事件（§3.4 矩阵实弹成立）。
- 关键发现：headless 宿主在模型在线时插件 shell 被权限审批门拒绝（headless patch 层无 permission 预设），`--patch` 叠加 `defaultPreset: danger-full-access` 后恢复——「headless 产消息」手法今后需带该 overlay（已记 records 第十节发现 1）。
- 环境已还原：profiles 回 npm 2.4.6 原版（强制重装验尸 132609 字节）、探针目录删除、3080 已停；仓库无 M5 引入改动。遗留给 Leader：issue #19 回复、2.5.0 发版、计划文档归档（issue 关闭后移 completed/）。
