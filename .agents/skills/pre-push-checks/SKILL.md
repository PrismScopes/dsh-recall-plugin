---
name: pre-push-checks
description: git push、打 tag、发 npm 包或声称「检查通过」之前使用——按外发 diff 的改动面选最小检查集而非条件反射跑全量；test:probe 与 verify:host 不进 CI，发布前必须在本地跑过。
---

# dsh-recall-plugin 推送前检查

推送前在本地带上一份相关证据。CI 只拦得住它跑的东西；`test:probe` 与 `verify:host` 不进 CI，它们盯住的路径腐化了只有本地能发现。测试本身的可靠性（隔离、flake 诊断）归 [ci-test-reliability](../ci-test-reliability/SKILL.md)；本 skill 只拥有「这次外发该跑什么」的选择。

## 检查外发变更

先确认外发的是什么：`git status` 干净、确认 upstream，`git diff <upstream>...HEAD` 看全量。**改 `src/` 忘 rebuild 是本项目最高发的事故**——CI 有 `git diff --exit-code lib/` 新鲜度门禁钉着，本地先跑掉它再推。

## 按变更面选证据

不存在统一本地基线，按改动面选最小集：

| 改动面 | 推送前跑 |
| --- | --- |
| `src/host/` | `npm run typecheck` + `npm test`（可先聚焦跑受影响文件，推送前补全量）+ `npm run build` |
| `src/types/` 契约 | `npm run typecheck` 必跑——`tests/types` 编译期断言漏跑即假绿，CI 里它排在单测前就是这个原因 |
| `src/host/scripts.pwsh.ts` / `scripts.posix.ts` | 同上，且改动引号/编码/命令行长度/`$LASTEXITCODE` 语义时，本机双平台（pwsh 与 bash/WSL）至少手测一侧并声明另一侧未测 |
| `src/client/` 或 `locales/` | `npm run test:client` + `npm run build`；locales 改动另有 parity 钉在 `npm test` 里 |
| 仅 `docs/` / `.agents/` / 散文 | `git diff --check`；文档声称了命令或行为的，按 prose-standard 先实跑再写 |
| 发布（version  bump / tag / `npm publish`） | 全量四步（typecheck → test → test:client → build 新鲜度）+ `npm run test:probe` + `npm run verify:host` + `npm run check:dsh`；评估 dsh 新版本兼容时另跑 `npm run check:upgrade` |

聚焦跑测试时不用 `--passWithNoTests` 之类的开关让空结果变绿；聚焦是省时间，不是缩小覆盖。

## 全量本地演练

只在三种情况做：用户明确要求、诊断 CI 失败、变更横跨多个面。全量 = CI 四步 + 两个本地门禁。

## 保护历史改写的推送

- 只对独立特性分支变基；强推必须 `--force-with-lease`，且先 fetch——裸 `--force` 一律禁止。
- main/master 绝不强推；改写推送是用户明确要求的操作，不自行发起。
- 改写推送后重新审计：远端 ref、CI 状态、已有评审结论全部按新 head 重看。

## 失败处理

选定检查失败就停下修复或说明阻塞原因，不「推上去指望 CI 再说」。疑似环境特有的失败留证（完整输出、平台、版本）。绕过本地钩子须经用户明确同意，并在提交说明或回复里如实报告绕过了什么。

## 推送程序

1. 跑选定检查；2. 提交；3. 推送；4. 核对远端 ref 与本地 HEAD 一致；5. 有 PR 时用 `gh pr checks` 看 CI。PR 有冲突时 GitHub 不创建工作流运行——`total_count: 0` 读作「有冲突」，不是基建故障，唯一修复是解决冲突。
