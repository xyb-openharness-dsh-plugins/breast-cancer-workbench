# Agent 对话面板集成设计（小粉宝乳腺癌工作台）

日期：2026-10-18 立项，2026-10-19 重大修订（改用 customFrame）。
合同来源：starter `prompts/DSH-AGENT-PANE-INTEGRATION.md`（比卵巢癌版多两节：CustomFrame 宽度基线与「AI-IDE 配套设计交付」）；顶栏结构与视觉见 [prompts/DSH-WORKBENCH-TOP-BAR.md](../prompts/DSH-WORKBENCH-TOP-BAR.md)（v0.6.1 定稿的三段式，2026-10-19 沉淀进 starter）；卵巢癌工作台 `docs/AGENT-PANE-DESIGN.md` 是同族判定，可对照。
本页是该合同在本项目的落地判定与未验证项清单。

## 0. 2026-10-19 修订：改用 customFrame（决策与证据）

**用户诉求**：缺少「打开 AI 对话」按钮；AI 对话框无法调整宽度、无法收起。

**根因（源码级证据，来自 `~/Downloads/dsh-desktop`，分支 xyb-dsh-workbench / v0.11.1）**：

标准分栏下，宿主 `packages/dsh-desktop-workbenches/client.js` 把业务宽度写成**注册时的静态值**：

```js
h('div', { className: 'dshWbBody', hidden: customFrame,
  style: { '--workbench-business-width': `${(entry?.layout?.businessWidth ?? 0.36) * 100}%` } })
```

而服务（`ctx.reflect.provide('desktopWorkbenches', service)`）只暴露
`register / isActive / ownsSession / add / open / home / setMarketOpen / showMarket / ensureSession / currentSession / subscribe`
——**没有** `setBusinessWidth`、`togglePane` 之类的接口，DOM 里也不存在 splitter 节点。

也就是说：**「面板不能拖、不能关」不是我们没接，而是那条路上根本没有这个能力。** 之前文档里"关闭与拖宽用宿主原生面板自带能力"的说法无法成立，已作废。

**customFrame 走的是另一条分支**（同文件第 2000 行）：

```js
h(item.Component, { service, entry, active,
  conversation: id === item.id ? h('div', { ... }, conversationMount) : null })
```

原生会话节点作为 **`conversation` prop 交给插件排版**，于是拖宽、键盘调整、收起/重开、宽度记忆都可以由工作台自己实现。这正是合同里「默认 35%、可拖 25%–45%」那条基线所对应的形态——2026-10-18 我们把它判为"不直接适用"，是把两种形态搞反了。

**代价与对策（官方 §4 / §6）**：

| 要求 | 处置 |
| --- | --- |
| 无会话态要自己引导（宿主不再给 `.dshWbInit`） | 右侧固定引导 + 顶栏按钮；业务区不依赖会话（§6） |
| macOS 窗口按钮占左上角 | 根节点首个子元素为语义 `<header>`，用 `--dsh-frame-leading-clearance` 避让 |
| 布局/弹层/拖拽不得越出主内容区 | 拖动按容器 rect 夹取，抽屉式窄屏布局用绝对定位且不出容器 |
| 原生会话不得被卸载（"does not remount its input tree"） | 会话容器恒定渲染，显隐只切 `display`，不卸载组件 |

## 1. 集成本现状（证据）

| 项 | 现状 | 证据 |
| --- | --- | --- |
| 面板形态 | **customFrame = true**（唯一来源 `lib/layout.js`） | `lib/client.js` 生成物含 `customFrame: true`；`npm run check:package` 核对与 `lib/layout.js` 同值 |
| 顶栏 | 有「AI 对话 / 打开 AI 对话 / 收起 AI 对话 / 正在连接… / AI 对话暂不可用」五态按钮 | `src/client.js` `agentLabel` |
| 拖宽 | splitter（`role="separator"`、`tabIndex=0`、aria-valuenow），鼠标拖 + 键盘 ←/→ 步进 2%、Home/End 到边界 | 同上；宽度持久化 `pinkypal.breast.agent-pane.v1` |
| 收起/重开 | 只切 `paneOpen`，不结束/删除会话；宽度与开合状态持久化 | 单测 `test/host.test.mjs`「原生会话始终挂载」 |
| 会话调起 | `desktopWorkbenches.ensureSession({ folder })`，`folder` 取 `/api/health` 的 `dir` | `src/client.js` `openAgent()` |
| 开场白 | 填进**原生草稿**，不自动发送；composer 未就绪轮询重试、localStorage 持久化 | 同上 `fillDraft()` / `flushDraft()` |
| Desktop 装机 | **未验证**（需重启 Desktop 人工确认） | 见 §5 |

## 2. 宽度基线（对齐 starter 合同）

| 参数 | 值 | 来源 |
| --- | --- | --- |
| 会话默认宽度 | 35% | `AGENT_PANE.default`（starter 基线） |
| 可拖区间 | 25%–45% | `AGENT_PANE.min` / `max` |
| 键盘步进 | 2% | `AGENT_PANE.step`（与拖动对齐到同一组取值） |
| 业务区默认 | 65%（= 1 − 35%） | `PANEL.businessWidth`，与 M5 实测口径一致 |
| 窄屏 | 容器 < 760px 改为覆盖式抽屉（≤420px 宽） | `AGENT_PANE.narrowBelowPx` / `drawerMaxPx` |

业务区默认仍是 65%，因此 M5 阶段"34 视图在 65% 业务宽度下无页面级横向溢出"的实测结论继续有效。
`PANEL.businessWidth` 与 `AGENT_PANE.default` **互补**（`1 - default === businessWidth`），由 `assertPanelConfig()` 钉住，改一个必须改另一个。

## 3. 交互合同逐条落地（延续 2026-10-18 的判定）

1. **入口**：顶栏按钮五态，独立收起控件；**隐藏 ≠ 结束会话**（已在代码注释与单测里写明）。
2. **会话创建**：首次显式点击才创建/复用（`ensureSession`），不加载时静默新建；并发与慢返回靠 `ensureSession` 自身的归属判定，不重复创建；所有权未知不发送。
3. **上下文衔接（2026-10-20 已实现，见 §7）**：从页面提供「与 Agent 讨论」，生成**可预览草稿**（标来源/时间/核对状态/缺项）：
   - 一图秀：当前指标序列 + 换方法断线说明（含「不可比」标注）；
   - 就诊准备：问题清单 + 待办（已是用户确认项）；
   - 草稿核对：**仅已接受的事实**，不含未核对候选（候选进草稿 = 替 AI 背书未核实数据，禁止）；
   - 我的关注：研究线索空态时不提供入口。
4. **带入对话**：草稿填入**原生会话输入框**。customFrame 下 `conversation` 节点就在我们自己的 React 树里，仍**不绕过**原生输入组件：走 `sessions.scope(id).get('conversation').input.setDraft()`，只在 composer 就绪时写入，失败保留草稿供重试；不自建聊天框。
5. **草稿冲突**：原生输入框已有内容或含引用/特殊输入时，拒绝覆盖并提示"先在原生会话里处理"，保留用户已有输入。
6. **AI 输出边界（与既有红线一致）**：AI 回复只在原生界面展示；不写回 `observation`/`record`；`viewpoint.is_conclusion` 恒 0；接受 ≠ 审核（`reviewed_by` 保持 NULL）。
7. **私密边界（D39 fail-closed）**：私密心理/性健康/生育记录**默认不进上下文草稿**，逐项显式勾选才带。

## 4. 数据模型解耦

| 数据 | 归属 | 存储 |
| --- | --- | --- |
| 面板宽度、开合等展示偏好 | 工作台 UI | `localStorage`（`pinkypal.breast.agent-pane.v1`），随浏览器清 |
| 会话归属 / 会话 ID | 宿主绑定 | 不落库；不作为患者病情事实 |
| 一次性上下文草稿 | 宿主 composer | 仅在等待送达时暂存在 localStorage，送达即清 |
| AI 产生的一切内容 | 原生会话 | 工作台零持久化 |

## 5. 验收清单（可观察项）

- [x] 入口五态可观察；收起后按钮变为「打开 AI 对话」，重开回到同一会话。
- [x] splitter 鼠标拖动与键盘（←/→ 步进、Home/End 到边界）均生效，区间 25%–45%，带 `role="separator"` 与 `aria-valuenow`。
- [x] 宽度与开合状态持久化；业务区不因面板开合丢状态（iframe 不重载）。
- [ ] **Desktop 实机（V2）**：在目标 RC 里确认原生会话真实渲染、可输入、可回复；拖动与收起在真实容器里表现正常。**静态断言与开发自测不算验收**，需重启 Desktop 人工确认。
- [ ] 入口按钮在窄容器（<760px）下的抽屉观感与键盘可达性。
- [x] 第 3 节第 3 条「与 Agent 讨论」的草稿预览（2026-10-20，见 §7）。

## 6. 未决问题

1. **窄屏断点 760px 是否合适**：按容器宽度算（合同要求），但小粉宝业务区在 65% 下更容易触发抽屉，实机后可能要上调到 820px。
2. **会话未绑定时的右侧引导**：当前是文字引导；是否需要一个「选择资料目录并开始会话」的显式按钮（复用 `/api/fs/pick` 原生选择器）？
3. ~~第 3 节第 3 条草稿预览的落地排期~~：2026-10-20 已落地，见 §7。**仍未做**：实机（Desktop）里逐页点一遍——静态断言与开发自测不算验收。

## 7. 「与 Agent 讨论」：上下文草稿（2026-10-20，v0.8.0）

### 7.1 一句话链路

页面按钮 → `GET /api/agent/context?scope=…` →（服务端只读记录，拼成文本）→ 预览弹窗（可改、可勾私密）→
`postMessage({type:'pinky:agent-draft'})` → 宿主面板校验来源 → 填进**原生会话草稿框** → **用户自己按回车**。

没有任何一步替用户发送，也没有任何一步把 AI 的输出写回事实层。

### 7.2 三个范围与它们的取数

| scope | 入口 | 带什么 | 明确不带 |
| --- | --- | --- | --- |
| `timeline` | 病情一图秀页头 | 当前勾选的指标序列（≤4 项，最近 6 次/项，含单位、方法与 CTCAE 对照）、治疗节点、最近一次上肢四点位 | 没勾选的指标值、未核对候选 |
| `prep` | 全程与康复 › 就诊准备页头 | 问题清单（含"这是我的看法"标注）、未完成待办、本人看法、达到 CTCAE ≥2 级的指标 | 私密看法（默认）、已完成待办 |
| `draft` | 病情整理 › 整理草稿 / 核对 | **仅已接受/已修改接受**的事实（日期、值、单位、来源文件） | 一切 pending / needs_review 的候选值——**只报条数** |

「我的关注」不提供入口：一期没有真实试验数据（`clinicalFollow` 是空态），空态上挂一个"与 AI 讨论"会让人以为那里有内容。

### 7.3 不可让步的四条（单测钉住）

1. **只抄记录**：值、日期、方法全部来自读模型；缺的地方写"记录里没有"或进 `gaps`，不补、不推测、不算比率。
2. **核对 ≠ 审核**：`draft` 范围只带已接受事实，文里固定写"已接受只表示转录核对过，不等于医学审核"；未核对候选只报条数。
3. **私密 fail-closed**：`includePrivate` 不给就不出现；勾选后文里标"（私密，本次已勾选带入）"。开关在勾上后仍保留，用户可以再关掉。
4. **不带本机路径**：草稿会被贴进会话，路径里带用户名与目录结构，一律不写（单测断言上下文里不含资料目录）。

### 7.4 送达协议（页面 ↔ 面板）

```js
// public/js/agent.js（iframe 内）
window.parent.postMessage({ type: 'pinky:agent-draft', prompt }, window.location.origin)

// src/client.js（面板）
if (event.source !== frame.contentWindow) return   // 只认自己的 iframe
if (event.origin !== window.location.origin) return // 且同源
void deliverRef.current?.(prompt.slice(0, 8000))    // 长度上限 8000
```

- **必须校验 source**：只校验 origin 挡不住同源的其他 iframe / 窗口往这里塞文本。
- 交付用 `rememberDraft` + `flushDraft`（复用开场白那条队列）：composer 没就绪就留在队列，500ms 轮询重试，失败不丢草稿。
- 没有会话时先 `ensureSession` 再填，不静默新建第二个会话。
- 独立启动（`npm start`）没有父窗口：页脚自动退化为「复制草稿」，**不假装有 AI**。

### 7.5 已验证 / 未验证

| 项 | 状态 | 证据 |
| --- | --- | --- |
| 三个入口在 1200/900/800 下无横向溢出 | 已验证 | 无头实测 `body.scrollWidth === innerWidth`，页头两个按钮不换行溢出 |
| 页面 → 父窗口的 postMessage（宿主角色用同源 harness 顶替） | 已验证 | 收到 1 条 `pinky:agent-draft`，origin 同源，1139 字，弹窗自动关闭 |
| 私密勾选可开可关，勾选后私密看法进入草稿、关闭后消失 | 已验证 | 草稿 673 → 682 → 673 字 |
| 草稿核对范围不含未核对候选的值 | 已验证 | 单测断言 prompt 不含 pending 的 `9.9` |
| **真实 Desktop 里点「填入 AI 对话」后原生输入框出现草稿** | **未验证** | 需要在目标 RC 里人工点一遍；开发自测与 static 断言不算验收 |
