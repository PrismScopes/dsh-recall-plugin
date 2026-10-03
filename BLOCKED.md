# BLOCKED — 待裁决清单（撤回事件接缝 issue #19，v2.5.0）

技术验收全绿（typecheck 0 / 单测 497 / client 90 / verify:host 13 端点 / build 产物同步），以下为需要领导确认或知悉的事项，无一项阻塞交付：

1. **CODEBUDDY.md 是指向 AGENTS.md 的符号链接**（2026-08-28 建立，`CODEBUDDY.md -> AGENTS.md`）。任务书白名单允许修改 CODEBUDDY.md 但未列 AGENTS.md；规格 M4 要求的「routes-core 行加 notify、types 行加 events.ts」只能经真实目标 AGENTS.md 落地（同一 inode，共两行文件地图同步）。已照做并记入 PROGRESS.md——若领导认为此举越界，`git checkout -- AGENTS.md` 撤销两行即可，其余交付不受影响。注意 AGENTS.md 同时含有任务开始前就存在的、领导自己的未提交修改，本次改动（两行）与其混在同一文件的工作区 diff 里。

2. **任务开始前已存在的脏工作区**（非本次引入，本次零触碰）：`.agents/skills/` 下 3 个修改 + 5 个未跟踪目录、`AGENTS.md` 的既有修改、`docs/plans/pending/plan-recall-event.md`（规格文档本身，未跟踪）。任务 4 的验收「git status 改动全部落在白名单内」按「本次任务引入的改动」核对通过——全量 porcelain 里上述文件属任务前状态，请领导知悉后自行处置。

3. **HEAD 中的旧 `PROGRESS.md`/`BLOCKED.md`** 是上一个任务（issue #15 win32 shell 方言修复）的遗留，工作区里在本次任务开始前已被删除；本任务按白名单重建了同名文件（issue #19 内容）。git 视角显示为 modified 而非新增，属预期。

4. **顺手活登记：无**（实施过程中未发现需要另行裁决的别的 bug 或重构诱惑；途中自行修正的两个问题均为本次新增测试自身的断言语义，见 PROGRESS.md 任务 2/任务 3 节）。

5. **M5 实弹验证已完成**（2026-10-03，领导授权执行；四项全过，详录 `docs/plans/completed/smoke-checklist-records.md` 第十节，本文档不重复）。无新增阻塞。两点知悉级事项：① `execute` 返回的 `count` 是「回退触达条数」（restored+deleted）而非 diff 条数——既有语义，事件消费方文档已按此口径，若要改为 diff 口径属独立行为变更，请领导裁决是否立项；② 遗留动作归领导：issue #19 回复（M5 已具备依据）、2.5.0 发版、计划文档随 issue 关闭归档至 `docs/plans/completed/`。
