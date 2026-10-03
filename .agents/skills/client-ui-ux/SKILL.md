---
name: client-ui-ux
description: 新增、修改或审查 `src/client/` 下用户可见的 GUI 时使用——撤回按钮、确认面板、toast、设置卡片、快照管理树等界面与交互；用户说「改一下界面」「加个按钮/面板」「审查这个 UI 改动」时适用。判断视觉 token 复用、反馈面选择、浮层安全与加载态/错误落点。
---

# dsh-recall-plugin Client UI/UX

本 skill 是 lint 与类型检查覆盖不到的 UX 判断，面向 `src/client/` 的 GUI 变更。这是指导，不是脚本。

事实源与分工：视觉常量归 `docs/design-tokens.md` 与 `src/client/css.ts`；文案的措辞与「措辞即行为」规则归 [prose-standard](../prose-standard/SKILL.md)；i18n 词典机制（A4）归 `src/client/locales/`，key 集合与占位符一致由 `tests/unit/locales-parity` 钉住；client 日志纪律（A5）归 `src/client/log.ts`。

## 视觉基础

- 优先复用 `css.ts` 已有常量与 `docs/design-tokens.md` 的 token 处理颜色、圆角、间距；新增一次性色值/尺寸通常意味着漏用了共享值。
- client 渲染在宿主 web 壳内：跟随宿主主题变量，不自创与宿主冲突的色阶；颜色在明暗两种宿主主题下都要可读。
- 图标与文字成比例且基线对齐；`assets/icon.svg` 的 20×20 单色先例（`<img>` 隔离渲染不继承 `currentColor`，颜色写死）适用于一切会被宿主当图片渲染的图标。

## 复用优先

- 先扩展现有原子再新建：`settings-cards.ts` 的 `SectionToggle` 折叠头、`util.ts` 的 toast/api/ensureInit 工厂、`recall-node.ts` 的图片重绘（走官方 `renderMessageImages`，不自绘）。
- 新文案先进 `locales/zh.ts` 事实源再同步 `en.ts`；当前语言缺 key 回落 zh 再回落 key 本身——直接写字面量会被 parity 测试与扫漏检查抓住。
- client 新代码禁裸 `console`，走 `log.ts` 的 `createLogger(ns)`。

## 反馈面

按消息生命周期选反馈形式，选错面是最常见的 UX 退化：

- **瞬时操作结果**（撤回成功/失败、gc 完成）：toast。失败 toast 要保留用户现场——撤回失败时草稿与文件状态不得被静默改写。
- **与面板绑定的状态**（preview 数据、确认面板内的拦截原因、快照管理的「最近错误」）：就地呈现，不弹 toast。P0-1 运行中拦截、P0-3 STALE 这类带错误码的反馈，client 按 code 查 locales 的 `err.*`，动态细节码回落 host message。
- **空列表**（无快照、无排除项）：空态文案引导下一步动作，不报错。
- 错误文案遵循 `src/host/diagnostics.ts` 约定：可行动、不嵌路径、≤140 字符，toast 与「最近错误」共用同一套文案。

## 浮层与面板

确认面板与一切弹出层合并前必须满足三点：可关闭（外点点击与 Escape 都关得掉）、适配视口（贴边的气泡旁展开不抖动不翻转）、不被消息列表裁剪。scope 二选一的 radio 在 cutSeq 为 null 时不出选项——没有可选状态的控件不要渲染成禁用态让用户猜。

## 加载态

快照管理拉取列表/用量时：列表区用骨架或原地 spinner，一个卡片只用一种加载样式；非必要不加「加载中」文字。preview→execute 链路上有进行态就不允许重复触发 execute。

## 验证

- 改 `src/client/` 必跑 `npm run test:client` 与 `npm run build`（产物新鲜度是 CI 门禁）；改 locales 同时跑 `npm test`（parity 钉在 unit 里）。
- 用户可见文案的改动要有冒烟证据；授权范围内没有验证场景就不改文案，报告延后（prose-standard 的同一规则）。
- `docs/screenshots/` 是派生物：只在授权的行为变更要求新证据时重生成，不随手更新。
