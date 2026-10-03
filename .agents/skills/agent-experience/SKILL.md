---
name: agent-experience
description: 编写、修改或评审本仓库的技能（`.agents/skills/` 的 SKILL.md）与 `AGENTS.md` 代理指南时使用——新建技能、调整 frontmatter description 的触发时机、拆分 references/ 延迟加载、精简代理面向的文档；用户说「写个技能」「优化 skill 描述」「让 agent 能找到…」时适用。
---

# dsh-recall-plugin 的代理体验设计

本仓库不定义 LLM 工具，但维护三类模型面向的表面：`.agents/skills/` 的技能、`AGENTS.md`（`CODEBUDDY.md` 是其镜像）的代理指南、Basic Memory 笔记约定。这些表面的读者是上下文受限的模型：写它们时，每一段都要挣回自己占的 token。这是指导，不是脚本。

散文措辞与文档结构的编辑判断权归 [prose-standard](../prose-standard/SKILL.md)；本 skill 只拥有「模型能否找到并用上信息」这一面。

## 上下文经济

- **最小上下文起步**：默认假设模型只加载了 frontmatter 与首屏。关键规则要能在不读 references/ 的情况下生效；references/ 是深化，不是必需路径。
- **延迟加载的资源必须可显式发现**：技能的 `references/` 文件要在 SKILL.md 里按用途点名（「诊断已有 flake 走…」），不能只靠目录存在；`AGENTS.md` 的文件地图承担仓库级发现职责，新模块要登记进地图而不是指望被搜到。
- **关键约束在操作前可见**：权限边界、破坏性操作、必跑的验证，写进 description 或出现在工作流第一步之前——模型踩坑之后再看到等于没写。
- **有界输出加检索把手**：要求模型产出列表或证据时，指明界（数量、长度、路径形态）与可追溯的把手（绝对路径、命令、行号），而不是开放式倾倒。
- **利用局部性**：引用一个事实时附带它的一两句相邻上下文；内容被截断时明确标注「下有续」，让模型知道缺了什么。
- **算总账**：为省 token 而把信息拆到三处，可能让模型多跑五轮检索。评估上下文节省是否真的减少了总工作量，不为省而拆。

## description 即触发器

技能的 frontmatter `description` 是模型选中它的唯一依据：

- 写清「什么时候用」：动作（设计/审查/诊断/修复）+ 范围（哪类文件、哪类问题）+ 触发词（用户会说的原话，如「排查 flaky CI」「审计文档」）。
- 只描述行为，不写内部实现——模型不需要从 description 知道工作流长什么样。
- 多条规则的适用条件写在各自章节里，不在 description 堆叠；description 只回答「该不该选我」。
- 同一事实只在一处陈述：技能间用「X 归某 skill」「Y 以某文件为准」让渡所有权（本仓库 ci-test-reliability / prose-standard / trim-cot-leakage 的边界划法是范例），不复制对方的规则文本。

## 量化改动效果

改技能或代理指南前后，对比可观察的代理行为：首轮 prompt token 数、模型在无额外提示下能否找到正确文件、是否还犯这条改动想消灭的错。说不上效果的改动，默认不做。
