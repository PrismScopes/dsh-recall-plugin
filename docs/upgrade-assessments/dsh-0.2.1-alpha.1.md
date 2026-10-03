# dsh v0.2.1-alpha.1 升级影响评估

> 类型：dsh 版本升级影响评估（版本快照文档，随版本归档，无完成态流转、不进 plans 状态目录）
> 评估对象：[dsh-v0.2.1-alpha.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.1)（prerelease，2026-10-03 发布；npm dist-tag `alpha` 指向本版，`next` / `latest` 仍 0.2.0-rc.2）
> 本地基线：`npm install -g @deepseek-ai/dsh@0.2.1-alpha.1` 全局实装（0.2.0-rc.2 → 0.2.1-alpha.1，22 增 / 3 删 / 536 替换包 / 1 分钟；对照源：[dsh-0.2.0-rc.2.md](./dsh-0.2.0-rc.2.md)）
> 评估方式：release notes 逐条筛查（新增 6 / 修复 10 / 优化 5 / 调整 4）+ GitHub compare 266 commits（其中 250 条提交信息全量过筛）+ **全树内容级 diff**（npm 在 Windows 上清理失败留下的 `.dsh-EBhnoWNL` 残留正好是 0.2.0-rc.2 整包副本 462.3MB / 26639 文件，直接用作基线；287 个子包逐包归一化版本号后比对，关键契约文件再做逐行 diff）+ **门禁实跑**（check:dsh / test:probe 52 例 / verify:host 装配断言）+ 镜像按 tag 重拉比对；**活体冒烟本轮未跑**（理由见 §2.4）
> 总结论：**零破坏、无需改码、peer 窗口需追加 0.2.1 tuple**——插件依赖面的注册/消费契约全部字节级相同（chat.node 槽位契约、ChatNodeKind 全集、fork/binding 声明、updateQueue、设置 slot）；真增量集中在官方新增能力（结构化草稿 / 新会话预填、插件创建入口）与插件不消费处（stats 拆分、invariant 移除、性能优化）；唯一需要动作的是 peer 范围：`>=0.2.0-rc.1 <0.2.1` 因 npm prerelease 门槛不含 0.2.1-alpha.1，须追加新段。

## 一、更新日志梳理与初步判断

release notes 共 25 条（新增 6 / 修复 10 / 优化 5 / 调整 4）。下表列出与插件系统 / 消息处理 / API 接口相关、需要插件侧核查的条目及核查结果，其余合并为末行：

| 变更 | 类别 | 初判 | 核查结果 |
|---|---|---|---|
| **新会话支持预填未发送的提示；恢复草稿或切换工作区时保留文件、目录和会话引用** | 新增 | **高相关**——撤回后回填输入框（`refillDraft`） | **零破坏**——草稿系统官方级重构（`ui-conversation`）：新增 `DraftSnapshot`/`DraftInput`（`draft-editor.d.ts`）与 `readConversationDraft` / `requestDraftInitialization`（`DraftInitializationOptions{prompt?, clearPreviousDraft?}` → `'applied'│'preserved'│'blocked'`）/ `persistDraft`；**插件走的 `conversation.input.shell(sessionId).actions.setDraft(text: string)` 签名未变**（`InputFacade.setDraft` 参数放宽为 `DraftInput = string \| DraftSnapshot`，字符串分支保留，注释明示「Replace the whole draft with plain text」）；插件零引用被改名的 `bindDraftMirror`（→ `bindDraftPersistence`，slots 契约） |
| **自动化任务改为 Web 内置能力，提醒工具按模式提供**（极简模式与子代理不可用） | 调整 | 低相关——消息投递 | 零交集——落点在 schedule 体系与模式门控；插件快照触发（`session/event`）不受影响；镜像 `13-cookbook-extension` 的投递描述改 `followup(…, {source: {kind: 'schedule'}})` 属文档同步 |
| **移除运行时 invariant 插件及各包的 `./invariant` 导出**（破坏性） | 调整 | **中相关**——插件是否引用诊断入口 | **零交集**——`src/` 全量搜索 `invariant` 零命中；受影响包（`dsh-session`/`dsh-sandbox-policy`/`dsh-client-modules`/`dsh-client-ui-renderer`/`dsh-agent`）本就不在插件消费面 |
| **子路径插件不再读取独立的 `package.json`，显示文本与图标须通过对应子路径导出**（破坏性） | 调整 | **中相关**——插件 icon / 多语言声明 | **零兼容风险**——插件是**包根 bundle**（顶层 `dsh.bundle.patch` + `icon` 字段）：`dsh-package-manifest` 的 `types.d.ts` 注释改为「Base64 image data URL **from a package root's manifest icon** or an exported `<specifier>/icon`」，包根 manifest 读取路径保留原样（`dsh-host-plugin-inventory` 逐字节相同） |
| **输入区统计扩展拆分为 `activity` 和 `usage` 两个独立入口**（破坏性） | 调整 | **中相关**——插件是否注册 stats 相关 slot | **零交集**——`ui-chat` 的 `StatsPills` 拆为 `ActivityPill` + `UsagePill`（composer 统计药丸）；插件只注册 `conversation.chat.node` 与设置卡片，未注册任何 stats/dock 入口 |
| **修复启停插件时其他插件的样式被移除、需刷新页面才能恢复** | 修复 | **正向**——插件 CSS 注入（`css.ts` 的 `<style>`） | **正向确认**——`dsh-client-modules`（`__ModuleLoader__` 出处）`claimStyles` 改为「先取未认领 `<style>` 快照，只认领工厂运行期间新增标签」——防止 HMR/启停把既有插件的样式误标为他有 |
| **修复目标任务「停止 → 恢复 → 再次停止」后新消息滞留队列；改善排队消息编辑器的 IME 与宽度** | 修复 | **高相关**——G1 队列清理（`updateQueue`） | **零破坏 + 正向**——`ui-conversation` 的 `service.d.ts`（`updateQueue` 声明处）**逐字节相同**、`api-session-controller` 的 `client/contract/session.d.ts`/`sessions.d.ts` **逐字节相同**；队列行为修复惠及 G1 清理的周边时序 |
| **插件管理页新增「让 Agent 创建插件」入口 + 安装结果显示实际安装版本 / 版本冷却说明** | 新增 | 低相关——插件管理页 | 零交集——新增 `plugins.add.actions` slot（`slot-contract.d.ts` 纯加法）；`plugins.bundle.config`（插件设置卡片挂点，key=`dsh-recall-plugin`）与 `settings.plugin.item`（旧面）均在位、契约未动 |
| **新增实验性 Claude Code Mods 兼容层 / Markdown frontmatter 预览 / `--public-url` / 开发者工具组合包** | 新增 | 低相关 | 零交集——落点分别在 hooks 兼容层、文档预览、webserver 展示地址（`dsh-host-webserver` lib 零变化）、会话检查器 |
| **会话列表读取提速（分片让出）、搜索与 fork 大规模性能基准** | 优化 | 中相关——`session-info` 的会话列表读取 | 零破坏——`dsh-api-session-controller` 的 `SessionList` 构造器新增内部参数 `workSliceMs`（Host 侧内部类，插件不实例化，走 `ctx.sessionQuery` 服务）；`list.d.ts` 语义（`header.id` 等，I8）未变 |
| **修复 Bash/PowerShell/文件修改记录无法展开 / HMR 刷新包入口 / 桌面端系统分配端口 / 侧栏动画 / 登录网络提示** | 修复 | 低相关 | 零交集——均为 UI 与运行时修复；插件不消费这些面 |
| 其余（插件创建流程 UX、组合包详情来源展示、目标编辑多行、coding preset 清理、PTC 默认值改标准等） | 混合 | 零相关 | 零交集——落点均在插件不消费的 UI/流程面 |

## 二、实证核验

### 2.1 门禁实跑（本机 0.2.1-alpha.1 全局实装）

| 门禁 | 结果 |
|---|---|
| `npm install -g @deepseek-ai/dsh@0.2.1-alpha.1` | 成功（22 增 / 3 删 / 536 替换 / 1 分钟）；`npm ls -g` 与读 `package.json` 实测 `0.2.1-alpha.1`；npm 清理旧版本残留 `.dsh-EBhnoWNL` 因 IDE 批量删除保护未删净（正好用作本轮 diff 基线，比对后清理） |
| `npm run check:dsh` | 升级后先报 6 条 `dsh-*` peer 越界 + cordis 越界（预期，见 §2.5）；peer 窗口追加 0.2.1 段后全绿：本地 0.2.1-alpha.1 ∈ 新窗口、cordis 4.0.5-alpha.1 ∈ 新窗口、schemastery 3.18.4 ∈ `^3.18.1` |
| `npm run test:probe` | **52/52 全绿**（api-surface 50 + stdin 写 2） |
| `npm run verify:host` | 装配断言全部通过（inject=shell,sessions,agents，端点 13 项）；方言探针回归 `pwsh` |
| 镜像重拉 | 按 tag `dsh-v0.2.1-alpha.1` 拉取 13 源：**4 份有实质差异、9 份逐字节相同**（差异清单见 §2.5） |

### 2.2 差异比对方法与零改动集合

**方法**：npm 换装后在 `%APPDATA%\npm\node_modules\@deepseek-ai\.dsh-EBhnoWNL` 留下 0.2.0-rc.2 整包副本（462.3MB / 26639 文件），直接作为基线做**全树内容级 diff**——先按包做文件集合哈希（287 个 `dsh-*` 子包版本号全部 lockstep 变更，不可用版本号定位变更面），再对关键包逐文件「归一化版本号后内容比对」，最后对契约文件逐行 diff；辅以 GitHub compare（266 commits）交叉验证。

**零改动集合（除 package.json 版本号 / README 文案外无任何文件变化）**：6 个 peer 出处包 `dsh-session-query`、`dsh-settings`、`dsh-shell`、`dsh-host-webserver`（各仅 README）、`dsh-session`（README + 注释 + `invariant.js` 移除）、`dsh-sandbox-policy`（README + `invariant.js` 移除）；其余 `dsh-base`、`dsh-session-projection`、`dsh-session-persistence`、`dsh-host-plugin-inventory`、`dsh-client-ui-settings-plugins`、`dsh-session-format`、`dsh-session-format-v3-to-v4`、`dsh-atomic-write`、`dsh-session-reference`、`dsh-client-connection`（仅 README）、`dsh-client-ui-slots`（仅 README）、`dsh-agent`（仅注释 + invariant 移除）。

**消费/注册契约文件字节级相同**：`ui-chat` 的 `contract/slots.d.ts`（chat.node props，含 `renderMessageImages`/`loadImage`）、`contract/chat-nodes.d.ts`（`ChatNodeKind` 全集）、`chat/ChatNodeSeat.d.ts`、`chat/MessageItem.d.ts`；`api-session-controller` 的 `client/contract/sessions.d.ts`（fork/binding）、`client/sessions/session.d.ts`、`client/contract/session.d.ts`（`updateQueue`）；`ui-conversation` 的 `service.d.ts`（`updateQueue`/草稿附件链）；`ui-workspace` 的 `navigation.d.ts`（`openSession` 面）。

→ 台账相关不变量的出处包在本版未变动，结论与探针锚点原样成立：**I1/I2/I4/I5（chat.node 槽位与消息投影）、I6（fork 不传 increaseTitle）、I7（归档 stopActivity）、I8（`header.id`）、I9/I33（SessionStore 与 seeded 会话读取降级）、I12（双代设置卡片挂点）、I27/I36/I38（shell 接缝与方言）、I29（guard shadowing）、I30/I39（settings 面两代接缝）、I31（slots.entries）、I32（不硬依赖 webServer）、I34（附件回填链）、I35（fork 切点语义）、I37（会话导航归属）、I40（子路径基址）**。

**独立版本线**：cordis `4.0.4 → 4.0.5-alpha.1`、schemastery `3.18.4 → 3.18.5-alpha.1`——两者产物**除版本号外逐字节相同**（peer 窗口追加 prerelease 段即可，见 §2.5）。

### 2.3 关键证据链逐项

| 消费点 | 0.2.1-alpha.1 实装结论 | 出处 |
|---|---|---|
| chat.node 槽位 props（I1/I2/I4/I5） | `ui-chat` 的 `client/contract/slots.d.ts`、`contract/chat-nodes.d.ts`、`chat/ChatNodeSeat.d.ts`、`chat/MessageItem.d.ts` **整文件逐字节相同**；本包变更只有 `StatsPills` 拆分、`ToolCallBlock.root` 可选化、`ToolArgs` 新增与内部 `partial.d.ts` 移除——全部落在插件不消费的类型面 | 逐行 diff |
| fork / 队列（I6/I33/I35、G1） | `api-session-controller` 的 `client/contract/sessions.d.ts` **字节级相同**（`fork` 逐字一致）；`dsh-session` 的 `sessions.fork(source, boundary?, childSessionId?)` 声明**逐字一致**（行号位移仅因注释删行）；`updateQueue` 三处声明处（`api-session-controller` contract + `ui-conversation` service）均字节级相同 | 整文件哈希 + 逐行 diff |
| 归档与导航（I7/I37） | `ui-workspace` 的 `navigation.d.ts`：`openSession` 签名不变；`startSession(workspaceId?, options?: StartSessionOptions)` 仅**新增可选参数**（`StartSessionOptions = DraftInitializationOptions`，新会话预填用，插件走 `openSession` 不传该参数） | 逐行 diff |
| 回填链（I34 + `refillDraft`） | `ui-conversation` 的 `client/contract/input.d.ts`：`InputActions.setDraft(text: string)` 签名未变（仅注释改「Replace the whole draft with plain text」）；`InputFacade.setDraft(text: DraftInput)` 参数**放宽**；新增 `requestDraftInitialization`/`persistDraft`/`get draftSnapshot`/`readConversationDraft` 属纯加法；`records.d.ts` 新增 `ToolArgs = PartialArguments`（tool 视图用） | 逐行 diff |
| shell 执行接缝（I36/I38） | `dsh-shell` 只有 README 变化；`dsh-session` 运行时产物差异全部为注释（invariant 文档清理） | 逐文件 hash |
| 设置卡片与配置读写（I12/I39） | `ui-plugin-manager` 的 `slot-contract.d.ts` 纯加法（新增 `plugins.add.actions`），`plugins.bundle.config` 与 `settings.plugin.item` 均在位；`dsh-settings`（`installSection` 出处）只有 README 变化；`dsh-client-ui-settings-plugins` 逐字节相同 | 逐行 diff + 全包 hash |
| AgentRegistry（P0-1） | `dsh-base`（agent 注册表与 `idle│running` 状态语义所在）**逐字节相同** | 全包 hash |
| 样式隔离（本轮正向） | `dsh-client-modules` 的 `claimStyles` 修复：未认领 `<style>` 改为「工厂运行前快照 + 只认领新增」，插件 CSS 注入不再被 HMR/启停误标 | 逐行 diff |
| 插件显示元数据 | `dsh-package-manifest` 的 `types.d.ts` 仅注释变化（包根 manifest icon 规则保留）；`dsh-host-plugin-inventory` 逐字节相同；插件顶层 `icon` + `dsh.bundle.patch` 声明路径不受子路径新规影响 | 逐行 diff |

### 2.4 活体冒烟（本轮未跑，理由）

- 未执行真宿主 + 浏览器实弹：本版对插件**零契约变更**（四组注册/消费契约文件逐字节相同、消费点声明文件全在位），三层门禁全绿；按惯例活体验收安排在**发版前**（或用户点名时）补做。
- 与 rc.1 轮次的差别：rc.1 带 peer 扩范围这一功能性改动，故附带完整活体验收；本轮为纯 peer 窗口追加 + 文档同步，活体冒烟的边际信息量低。
- 建议补测点（若做）：草稿回填在「新会话预填」能力共存下的表现（撤回后回填、切换工作区保留引用）；插件启停后样式隔离修复的观感确认。

### 2.5 版本策略动作（本轮唯一需要动作的面）

1. **peer 窗口追加 0.2.1 段**：6 个 `dsh-*` peer 由 `… || >=0.2.0-rc.1 <0.2.1` 扩为 `… || >=0.2.0-rc.1 <0.2.1 || >=0.2.1-alpha.1 <0.2.2`——`0.2.1-alpha.1` 与既有窗口的 lower（0.2.0）不同 tuple、upper 不带 prerelease，npm prerelease 门槛下不被放行（与 issue #517 同根因），必须显式追加同 tuple 段；同段天然覆盖后续 0.2.1 线（alpha.2/beta/rc/正式版）。**随 2.4.9 发版放宽上限至 `<0.3.0`**（0.2 全线正式版一并放行；0.2.2+ tuple 的 prerelease 仍受门槛约束，待核验后另加段）。
2. **独立版本线追加 prerelease 段**：cordis → `^4.0.1 || >=4.0.5-alpha.1 <4.0.6`、schemastery → `^3.18.1 || >=3.18.5-alpha.1 <3.18.6`（两者产物除版本号外逐字节相同，属已验证窗口）。
3. `dsh.compatibility.dshReleases` 补 `0.2.1-alpha.1: compatible`（市场台账声明，不参与启动判定）。
4. `docs/reference/` 镜像按 tag `dsh-v0.2.1-alpha.1` 重拉：4 份实质差异——`01-quickstart`（反向代理发布链接）、`09-architecture`（桌面端系统分配端口 + invariant 移除的文档同步）、`11-cookbook-conversation-node`（工具 delta 匹配语义放宽 + `ConversationNodeDefinitionInput` 表形式）、`13-cookbook-extension`（链接改指 reference + 定时任务投递语义）；其余 9 份逐字节相同。镜像 README 与 `docs/dsh-contract.md`「对应版本」同步。

## 三、结论

* **影响程度：零破坏。** 插件依赖面的注册/消费契约（chat.node 槽位、ChatNodeKind 全集、fork/binding、updateQueue、settings 两代接缝）在新版中全部字节级相同；无任何接口签名或语义增量触及撤回主链路。
* **具体表现：无需改码、无功能退化，另有正向收益。** 撤回主链路（preview → execute → 安全快照 → reset → fork → 归档 → 回填 + G1 队列清理）、P0-1 运行中拦截、设置页配置卡片与快照管理均无漂移；正向收益有二——插件启停时样式不再被误移除（`claimStyles` 修复）、排队消息在「停止 → 恢复 → 再停止」后不再滞留（队列行为修复，惠及 G1 周边时序）。
* **版本策略**：见 §2.5（peer 窗口追加 0.2.1 段 + 两条独立版本线 prerelease 段 + `dshReleases` 补记 + 镜像与契约文档同步）。
* **观察项（非阻塞）**：
  1. **官方草稿系统正在演进**：本版引入结构化草稿（`DraftSnapshot`）与新会话预填（`requestDraftInitialization`），插件的 `setDraft(string)` 仍在兼容面内（注释明示接受 plain text），但若未来字符串分支被废弃，回填链需改走 `DraftSnapshot`——届时按 I34 复查动作跟进。
  2. **`ToolCallBlock.root` 可选化与 `partial.d.ts` 移除**：属 ui-chat 内部类型整理，插件零消费；若日后插件要读工具节点视图需注意 `root` 可能为 `undefined`。
  3. **`SessionList` 构造器新增 `workSliceMs`**：Host 侧内部类签名变化，插件不实例化该类（走服务接口）——若未来有直接使用需适配。
  4. **既有观察项延续**：`fork.onCreated` 插件未用、`dsh-tool-jobs` 唤醒上限、`sessionQuery` 三 API 仍 `@deprecated`。
