# 变更记录

## 2026-10-20 · 开发快照（包版本 0.8.0）

- 加密虚构示例档案的化验/体重记录并限制日期不进入未来；末点标签统一按纵向间距避让和边界锚定，保留原始测量点。
- `npm run check`：通过（退出码0）；tests=193, pass=193, fail=0。
- 详细范围见 [Git同步记录](docs/GIT-SYNC-2026-10-20.md)；本次未创建正式发布tag。


规则：涨版本先改 `VERSION`，再在本文顶部加一条（日期 + 版本 + 一句话 + 影响面）。
`npm run check` 会拦住"改了版本没记录"和"记录了没改版本"两种漏（见 [VERSIONING](docs/VERSIONING.md)）。

## 0.8.0 — 2026-10-20（「与 Agent 讨论」：可预览的上下文草稿）

**一句话**：把 AI 面板从"能打开"推到"能带着真实记录去问"——三个页面各给一个入口，服务端只抄记录整理成草稿，用户在预览里看清带了什么、能改、能勾私密，最后**自己按回车**发送。

- **服务端 `dsh/agent-context.js`（新增）**：`buildAgentContext(wb, scope, { codes, includePrivate })`，三个范围：
  - `timeline`：当前勾选的指标序列（≤4 项、最近 6 次/项、含单位/方法/CTCAE 对照）、治疗节点、最近一次上肢四点位；
  - `prep`：问题清单（"我的看法"带标注）、未完成待办、本人看法、达到 CTCAE ≥2 级的指标；
  - `draft`：**只带已接受/已修改接受**的事实（日期、值、单位、来源文件），pending/needs_review **只报条数、不带值**。
  文本固定带「缺项」「这次没有带入的内容」「请你怎么用 / 请不要」四段，边界写在上下文里，不指望用户记得。
- **接口**：`GET /api/agent/context?scope=…&codes=a,b&includePrivate=1`，只读、无副作用；未知 scope 报 `BAD_SCOPE` 并回可用清单；`codes` 上限 4（与一图秀一致）。已登记进 `API_KNOWN`，未选目录时仍报 409 而不是 404。
- **预览弹窗（`public/js/agent.js`，新增）**：先列"会带进对话的内容"（分块 + 缺项 + 没带入），再给一份**可编辑**的草稿文本，页脚「取消 / 复制草稿 / 填入 AI 对话」。私密是逐项开关：默认不带，勾上重新生成并标"（私密，本次已勾选带入）"，**勾上后开关仍保留**，可以再关掉（否则用户没有退路）。
- **送达只填不发**：`postMessage({type:'pinky:agent-draft'})` → 面板校验**来源窗口是自己的 iframe** 且同源（只查 origin 挡不住同源的其他窗口），长度上限 8000 → 复用开场白那条 `rememberDraft/flushDraft` 队列填进原生输入框；composer 未就绪就排队重试，不丢草稿。没有会话时先 `ensureSession` 再填。
- **独立启动的诚实降级**：没有父窗口时页脚只给「复制草稿」，并在说明里写明"现在是自己启动的页面，没有 AI 面板"，不假装接通。
- **三个入口**：一图秀页头「与 AI 讨论这组数据」、就诊准备页头「与 AI 讨论这份准备」、整理草稿/核对页「与 AI 讨论已核对的事实」（旁注写明未核对候选不进上下文）。「我的关注」**不加入口**——一期没有真实试验数据，空态挂按钮会让人以为那里有内容。
- **修既有 bug：已接受事实显示"日期未填"**。接受候选时日期写在 `record.occurred_on`，候选自己的 `occurred_on` 仍为空，`draftFor()` 只看候选 → 已入库的事实日期丢失。改为 left join `record` 取 `record_occurred_on` 作为建议日期的次选（`candidate → 事实日期 → 材料报告日期`），顺手让草稿表格也显示真实日期；连接列不回传接口。
- 单测 182 → **191 条**（新增 `test/agent-context.test.mjs` 9 条，含"不含未核对候选值""不含本机路径""私密默认不带"；`test/host.test.mjs` 新增 2 条交付协议静态断言）。
- 无头实测：三个入口在 1200/900/800 下无横向溢出；同源 harness 顶替宿主，收到 1 条同源 `pinky:agent-draft`（1139 字）且弹窗自动关闭；私密开关 673 → 682 → 673 字可逆。**未验证**：真实 Desktop 里点「填入 AI 对话」后原生输入框出现草稿。

## 0.7.0 — 2026-10-20（指标卡分组 + CTCAE v5.0 分级对照 + 骨髓抑制提醒）

**一句话**：按用户定则把"指标怎么办"补齐——卡片按类别分组，血常规四项用 CTCAE v5.0 做客观区间对照，看板把"表达上的头晕无力"与"指标上的中性粒细胞低"两列并置提醒；标准原文随包分发，指标检测页可直接打开对照。

- **指标卡分组**：新增 `metricGroupsHTML()`，指标检测页与一图秀共用同一个分组函数；组顺序取 `categoryOrder`（与一图秀左侧指标列表同源），组标题显示"N 项"，有分级的组补"M 项有 CTCAE 对照"。之前是一张平铺网格，用户读不出"这是血象还是标志物"。
- **CTCAE v5.0 分级对照**（`dsh/ctcae.js`）：白细胞、中性粒细胞绝对值、血红蛋白、血小板四项按标准阈值分级，边界逐个由单测钉住（ANC 1.5 是 1 级、1.4 是 2 级）。只启用标准里有**绝对数值界限**的项——ALT/AST/肌酐的"×ULN"型需要化验单参考范围上限，本地没有结构化 ULN 前不启用、也不近似；贫血 G4 无界值，本地最多给 3 级。
- **单位与近似**：血红蛋白按 g/L 存储（CTCAE 用 g/dL，阈值 ×10）；没有个人参考范围时用成人通用下限，结果带 `approx`，界面显示"按通用下限"。
- **卡片徽章与背面**：正面加「对照 CTCAE v5.0 · N 级」（G3/G4 用琥珀底区分，但仍不写"异常/严重"），背面给区间 + 来源 + "对照不是诊断"。卡片高度固定 194px，因此把"方法变更断线"并进同一段提示、迷你折线压到 50px，页脚不再被裁。
- **指标检测页对照说明**：新增 `ctcaeReference()` 块——标准版本/机构/日期、这一版能对照哪几项、为什么另外几项不启用、怎么看这个级，加"标准原文 PDF"与"NCI 发布页"两个入口。
- **看板骨髓抑制提醒**：读模型新增 `marrowSuppression()`，返回 `paired` / `labsOnly` 两态——只有"感受（头晕/疲乏）"与"血液学指标有级"都记录了才弹提醒条，两列并置、各带日期与来源，不写因果、不写处置；只有指标有级时不弹提醒（徽章照常显示），只有感受时不生成。场景词按实际治疗记录决定（有化疗才写"化疗后"，否则"治疗期间"）。
- **症状字典**：新增 `dizziness / 头晕`（症状表 `code` 无 CHECK 约束，只加映射与选项）。
- **标准原文随包分发**：`assets/reference/ctcae/CTCAE_v5.0_Quick_Reference_5x7.pdf`（2,986,673 B，MD5 `4e2f799b2a82b8488895ce61b247f29f`，PDF 1.6）+ `README.md`（来源、出版日期、使用边界、代码对应）；服务端新增只读接口 `GET /api/reference/ctcae`，文件名取自 `CTCAE_META.localPdf` 并校验解析后仍在目录内。
- **修既有 bug：接口基址拼重**。`dsh/server.js` 在 `basePath` 为空时把 `apiBase` 兜底成 `/api`，而前端调用形如 `${apiBase}/api/xxx`，拼出 `/api/api/state` —— 开发版界面整页 404（只剩顶栏）。改为 `apiBase = apiBase || basePath`，并让前端接受空串基址；`test/host.test.mjs` 原来断言 `data-api-base="/api"`（把 bug 钉成了契约），改为断言空串并加一条"拼上 /api/state 真的能打到接口"的回归。
- **演示数据**：DEMO-1 补一条头晕感受与最近一次低值血常规，让分级徽章与提醒条在演示里稳定可见。
- 单测 168 → **182 条**（新增 `test/ctcae.test.mjs` 13 条 + 1 条基址回归）。窄屏实测：1040/900/800/700 四档 × 4 视图，横向溢出 0。

## 0.6.1 — 2026-10-19（真机反馈第三轮：宿主顶栏布局调整）

**一句话**：按真机截图批注调整 customFrame 顶栏——AI 对话/收起按钮移到右侧紧贴边缘，版本号放左侧品牌 logo 旁，整条色带调淡。

- **按钮右置**：顶栏布局改为「左：🎀 小粉宝 + `v0.6.1` 版本号 chip；中：说明文字；右：AI 对话 / 收起按钮组（`margin-left:auto` 紧贴右缘）」。收起「×」补了 `aria-label`。
- **版本号进宿主顶栏**：之前版本号只在业务页右上角（iframe 内）；现在宿主 header 左侧 logo 旁也有一个灰底 chip，两处同源（都是构建注入的 `VERSION`）。
- **色带调淡**：header 背景从 `#fbf1f4`（明显粉）调到 `#f7f4f5`（中性浅灰粉），边框同步调淡；主按钮 `#d9698a → #c97991` 降饱和，幽灵按钮边框/文字同步调淡——不再和业务区抢注意力。
- 验证：168 条单测全绿、包级合同 49 项通过；已打包装入 Desktop profile。拖动/收起实机观感仍待确认（同 0.6.0）。

## 0.6.0 — 2026-10-19（AI 对话面板可打开、可拖宽、可收起：改用 customFrame）

**一句话**：AI 对话面板不再依赖宿主分栏——改用 `customFrame`，由工作台自己排版原生会话，于是顶栏有了明确入口、中间分隔边可鼠标拖/键盘调、收起后能原样重开。

**为什么改（源码级证据，不是猜测）**：标准分栏（`customFrame=false`）下，宿主 `packages/dsh-desktop-workbenches/client.js` 把业务宽度写成注册时的静态值 `--workbench-business-width`，而服务只暴露 `register/isActive/ownsSession/add/open/home/ensureSession/currentSession/subscribe`——**没有** `setBusinessWidth`、`togglePane`，DOM 里也没有 splitter 节点。也就是说"关闭与拖宽用宿主原生面板自带能力"这条前提不成立：那条路上根本没有这个能力。customFrame 下宿主把原生会话节点作为 `conversation` prop 交给插件排版（同文件第 2000 行），拖宽、收起/重开、宽度记忆才可能实现。证据与逐条落地见 `docs/AGENT-PANE-DESIGN.md` §0。

- **入口五态**：顶栏按钮 `AI 对话 / 正在连接… / 收起 AI 对话 / 打开 AI 对话 / AI 对话暂不可用`，带 `aria-label`；已绑定会话时另有独立「×」收起控件——不把关闭藏在面板内部。
- **可拖宽**：中间 splitter，鼠标/触控拖动；键盘 `←/→` 步进 2%、`Home/End` 到边界；`role="separator"` + `aria-valuemin/max/now`；区间 **25%–45%**（默认 35%，业务区 65%），与 starter `20-AGENT-PANE-DESIGN` 基线一致。宽度存 localStorage，重开恢复。
- **收起不结束会话**：只切 `paneOpen` 与 `display`，不调用任何关闭/删除接口；再点「打开 AI 对话」回到同一会话。原生会话**恒定挂载**（宿主明确要求不重挂输入树），卸载会丢输入框与草稿。
- **窄屏**：容器（不是窗口）宽度 < 760px 时改为覆盖式抽屉（≤420px），业务区不让位；splitter 在该形态下不出现。
- **官方约束逐条落地**：根节点首个子元素为语义 `<header>` 并避让 `--dsh-frame-leading-clearance`；无会话时右侧给引导、业务区照常可用（§6），不依赖会话初始化。
- **唯一来源**：`PANEL`（`customFrame=true`、`businessWidth=0.65`）与 `AGENT_PANE`（0.35 / 0.25–0.45 / step 0.02 / 760 / 420）都在 `lib/layout.js`，由 `scripts/build-client.mjs` 注入客户端；`assertPanelConfig()` 钉住"业务宽度与会话默认宽度互补"，改一个必须改另一个。包级检查新增 3 项（customFrame 同值、入口文案、splitter 语义）。
- **文档同步**：`UI-DESIGN` §5.6、`RELEASE` §2.3 与 §3、`SPEC` A33/§8、`DEV-PLAN` 的"非 customFrame"表述全部改为新形态；`AGENT-PANE-DESIGN` 重写（§0 决策证据 + 现状 + 未验证项）。官方 §8「customFrame 内不越界」随之从**不适用**变回**适用**。
- **未验证**：拖动/收起/抽屉在真实 Desktop 容器里的观感与边界，需重启 Desktop 人工确认（静态断言与开发自测不算验收）；窄屏 760px 断点是否合适也要实机后再定。

## 0.5.3 — 2026-10-18（窄空间顶部双层导航 + 模拟数据快捷预览）

**一句话**：窄空间不再把一级、二级导航挤在侧栏里；改为顶部两行导航，并在空看板提供一键加载完整模拟数据后直达「病情一图秀」。

- **窄空间导航**：宽度不超过 900px 时，一级模块放在顶部第一行横向滚动区；当前模块的二级页面独占第二行，选中态独立呈现。内容区原有二级标签在该断点隐藏，避免重复和竖向挤压；宽屏交互保持不变。
- **模拟数据入口**：空看板增加「加载完整示例」按钮，调用既有 DEMO-1 受 manifest 保护的种子数据，激活独立模拟档案后直达「病情一图秀」。不写入真实档案；已有 DEMO-1 时按既有覆盖语义重建，不叠加记录。
- **一图秀空态说人话（真机反馈）**：所选指标在整个工作区里一次记录都没有时，明确写「画不出曲线是没有数据，不是界面故障」，并在原地给「加载完整示例」与「去指标检测补录」两个入口；一条指标都没选时也单独提示。有记录但不在时间窗的提示保持不变。
- **验证说明**：语法、冻结合同、文案与密钥检查均通过；163 条单测在干净环境（清空宿主注入的 `NODE_OPTIONS` 后）全绿。此前 11 个失败是 WorkBuddy 运行环境的批量删除保护（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`）拦下测试临时目录清理所致，与代码无关。

## 0.5.2 — 2026-10-18（真机反馈第二轮：原生目录选择器 + 弹窗自消失修复）

**一句话**：目录选择改为 macOS 原生对话框（osascript `choose folder`）；修掉「弹窗不到 5 秒凭空消失」的定时器 bug；网页浏览降为回退并修样式。

- **修弹窗自消失（真 bug）**：Panel 的 8 秒兜底定时器在 iframe 加载成功后**没有清除**，挂载 8 秒后整个面板被换成兜底页——正在用的弹窗随之消失（用户看到"5 秒不到就跳出"）。修：onLoad 里 `clearTimeout(brokenTimer)`，`src/client.js` 与生成物同步。
- **原生目录选择器**：新增 `POST /api/fs/pick`——macOS 上由本机 `osascript choose folder` 弹出**系统原生**选择对话框；用户取消（-128）安静返回不报错；非 macOS 返回 501，前端自动退回网页逐层浏览。原生选择器是交互对话框，未自动化测试（会真弹窗），人工验证。
- **样式**：网页浏览弹窗修丑——文件夹 📁 图标、行高收紧、列表底色与 46vh 上限、空名目录过滤（服务端 `d.name.trim()`）。
- **AI 会话面板的开合/拖宽（如实说明）**：从 DSH Desktop 安装包反查，`desktopWorkbenches` 服务只暴露 register/ensureSession/isActive/ownsSession/currentSession/subscribe，**没有**面板拖宽或关闭的编程接口（无 setBusinessWidth/togglePane）；`businessWidth` 是 register 时的静态布局。因此：打开=工作台「AI 协助」按钮（ensureSession）；关闭与拖宽只能用原生会话面板自带控件，若该 Desktop 版本未提供，属宿主限制，工作台不伪装支持。
- 验证：163 条单测全绿；npm pack 49 files / 517.4 kB；已 remove+add 装入 Desktop 真身 profile 并核对副本。

## 0.5.1 — 2026-10-18（真机首装反馈修复 + Desktop 1.2.2 会话集成）

**一句话**：修掉真机首装暴露的「工作台没能连上本机服务 not found」（CSP 拦内联 boot 脚本），按 Desktop 1.2.2 与门店选址官方样例补齐注册与会话集成；业务区移到左侧、原生 Agent 会话在右侧。

- **修 not found（真机实锤）**：本站 CSP `script-src 'self'` 会静默拦掉 index.html 的内联 boot 脚本 → `__WB_API_BASE__` 从未设置 → 接口全部 404、顶栏仍写「未接入 DSH 宿主」。改为服务端把基址/运行形态写进 `<html data-api-base / data-runtime>`，`api.js`/`app.js` 从 dataset 读；单测同步并加「不得出现内联 boot」断言。
- **布局**：`lib/layout.js` businessSide `right→left`（用户定：原生会话面板在最右，业务区左 65% 可折叠；面板开合与拖宽用宿主原生能力，不自建 splitter）。
- **register 补全**：panelTitle/icon/audience/requirements/initialization:'empty'/embedded:true/version/author（对齐官方样例字段面）。
- **会话集成**（官方 dsh-site-selection 同款 API）：`ensureSession({folder})` 调起原生会话并打开；开场白经 `sessions.scope(id).get('conversation').input` 填进**原生草稿，不自动发送**（composer 未就绪轮询重试、localStorage 持久化）；isActive/ownsSession/currentSession 判定齐备，宿主服务缺位一律降级提示不猜第二入口。面板顶栏新增「AI 协助」按钮。
- **新增 `workbench.json`**（schemaVersion 1）：`wb-xyb-openharness-dsh-plugins-xfb-workbench` 身份、entry、compatibility、capabilities；进 npm files。
- `/api/health` 增加 `dir`（面板调起会话时作为 folder 用）。
- **目录浏览点选（真机反馈）**：首次进入页与设置页的路径输入框旁新增「浏览…」——iframe 里拿不到系统原生目录选择器，走本机服务端只读接口 `GET /api/fs/dirs`（只列子目录名、跳过隐藏项、上限 500、不读文件内容；不要求已选资料目录），前端弹窗逐层点选、「家目录/上一级」快捷、选完回填输入框。目录不存在给可读 404（`DIR_NOT_FOUND`）、文件路径报 `NOT_A_DIR`。+2 条单测（163 条全绿）。
- 验证：`npm run check` 163 条全绿；npm pack 49 files / 516.6 kB；已按 remove+add 装入 Desktop 真身 profile（`~/Library/Application Support/dsh-desktop/harness/profiles/web`），副本含会话集成代码。
- 未实测：Desktop 实机里「AI 协助」调起、开场白填草稿、右侧面板拖宽（需用户重启 Desktop 人工确认）。

## 0.5.0 — 2026-10-18（M5 宿主接入，可打包安装）

**一句话**：同一份代码既能独立起服务、也能作为 DSH 插件挂进宿主——`apply()` 从抛错变成真挂载，产出可通过包级合同校验、可 `npm pack` 安装的插件包。

新增：

- `lib/identity.js`：npm 包名 / 工作台目录名 / 接口前缀的单一来源，宿主与客户端共用。
- `dsh/host.js`：宿主接入层——前缀路由改写、授权闸（403）、`apply()` 把 `WorkbenchServer.handle` 挂到宿主 `webServer`，工作区指针写入 `dshHomePath`。
- `cordis.patch.yml`：一条 insert，把服务端入口插入 Harness 插件树（name 写 npm 包名）。
- `src/client.js` + `scripts/build-client.mjs`：客户端单文件源码与构建（占位替换生成 `lib/client.js`，未替换占位即报错）。
- `scripts/check-package.mjs`：**包级合同 V1（46 项）**——包名/入口/cordis patch/客户端注册/repository/peerDependencies/无本机绝对路径/无敏感文件。
- `test/host.test.mjs`（15 条）：前缀改写、假 ctx 挂载、403 授权闸、UI 基址注入、工作区指针恢复语义、patch 与 package 合同。

改动：

- `dsh/server.js`：支持 `basePath`/`apiBase`/`runtime`，静态页面注入 `__WB_API_BASE__`/`__WB_RUNTIME__`，`onWorkspace` 回调；前端资源改相对路径，独立与宿主两种跑法共用一份页面。
- `package.json`：`dsh.bundle.patch` / `dsh.client` / `peerDependencies`（`>=0.1.5-rc.2 <0.2.0-0`，避免预发布 ERESOLVE）/ `exports` 补全。
- 单测 146 → **161 条**；`npm run check` 增加 `check:package`。

验证：`npm run check` 全绿（161 pass）；`npm pack` 48 files / ~512 kB。
**装机实测（2026-10-18）**：tgz 经 pnpm 10.34.5 装入 `~/.dsh/profiles/web`（与本机其他工作台同款 `file:` 约定），bundle 已登记；`dsh --dump-config` 合成出本插件层（`id: breast-cancer-workbench`、`root: dshHomePath('pinkypal-workbench')`）；临时 `DSH_HOME`（空 credentials 库）真起 Harness **加载成功**，`/api/breast-cancer-workbench/*` 全部命中本插件授权闸（curl 返回 403 + `HOST_AUTH_REQUIRED`，正是设计行为）。
**踩坑记录**：①cordis 对 `apply` 返回值严格——async resolve 普通对象会 `Invalid effect`，改为非 async 无返回值（实例走 `mountedServer()`）；②pnpm 同版本号不替换内容，改包后必须 remove + add。
**未实测**：Desktop 实机 UI（受信会话打开面板、已安装列表）——需要重启 DSH Desktop 后人工确认；psych 包 0.3.2 发布件缺 `name` 导出会挡整个 profile，已在安装副本打一行补丁，源项目要修。

## 0.4.0 — 2026-10-17（首个能用的开发版）

**一句话**：工作台从"服务层 + 原型"变成**能在本机真用**的应用——本机起服务、真落库、8 个模块全部接真实数据、就诊准备可导出。

新增：

- `dsh/readmodels.js`：读模型（指标序列按检验方法分段、指标卡、臂围历史与差值、症状/看法/问题/待办/治疗/诊断/康复、材料统计、导出 Markdown 与导出指纹）。派生值只算不存。
- `dsh/workbench.js`：应用核心（工作区打开与路径校验、档案与设置、全部写入动作、导入与解析、候选人裁决、导出留痕、演示数据）。
- `dsh/server.js` + `scripts/dev-server.mjs`：零依赖 HTTP 适配层与独立启动（`npm start -- --workspace …`）。上传走原始字节 + 头信息，不写 multipart 解析器。
- `public/`：单页界面（原生 ES Module、无构建、无第三方库），8 个一级 / 37 条路由。
- `scripts/check-syntax.mjs`：语法门改为扫目录，新增文件自动纳入。
- `test/workbench.test.mjs`（30）、`test/readmodels.test.mjs`（13）、`test/server.test.mjs`（16）、`test/demo.test.mjs`（+2）：单测从 85 条到 **146 条**。

改动：

- `dsh/index.js` 从"占位即抛错"变成**真入口**（导出 `Workbench` / `WorkbenchServer` / `startWorkbenchServer` / 面板参数），`apply()` 仍拒绝挂载——DSH 接入（M5）未开始。
- `lib/client.js`：`CLIENT_READY` 仍为 `false`，新增按 `lib/layout.js` 写好的 `VIEW` 描述。
- `viewpointList` / `careList` 的 `includePrivate` **默认从 `true` 改为 `false`**（A12/A27，fail-closed，D39）。
- `addTreatment` 对 `status='planned'` 改用 `assertPlanDate`，允许未来日期（D40）；已发生事件仍不许晚于今天。
- `validateWorkspacePath` 拒绝清单加入 `/tmp`：临时目录会被系统清理，不适合放病历。
- 版本核对从 5 处扩到 8 处；`prototypes/v0.3/` 改为**快照冻结**在 `0.3.0`（D37）。
- `package.json`：`start` 与 `check:syntax` 两个脚本；`files` 加入 `public/` 与 `scripts/`。

修掉的缺陷（都是实测发现的）：

- `#profile-btn` 漏 `data-action="profile"`，点侧栏档案卡没有任何反应。
- 「不存在就新建」复选框被输入框挤成一列竖排字（`.path-row` 不给它 `flex:0 0 auto`）。
- 未选目录时打一个不存在的接口先撞 `NO_WORKSPACE`（409），把 404 顶掉了。
- `lab_method` 传空串会与 `NULL` 分成两段，序列凭空多断一次。

实测（本机 Node v22.22.2 / macOS）：

- `npm run check` 全绿：版本同步 → 语法（38 文件）→ 冻结合同（2 个迁移）→ 文案红线（23 文件 0 处越界）→ 密钥（89 文件 0 命中）→ **146 条单测全过** → 版本一致（8 处）。
- 五档宽度（1440/1180/1040/936/780）× 8 页：页面级横向溢出 0、卡内横滚 0、七列测量表 `scrollWidth===clientWidth`、`.pick` 折叠指示各档都在（A33）。
- 37 条路由逐页无头渲染：有内容、有标题、无 console 报错（A19）。
- 真点击：关于 / 设置三 tab / 档案 / 添加安排四个弹窗可开可关；从零选目录 → 空态看板 → 顶栏"已激活"（A21/A22）。

未验证（不要当成已做）：DSH 容器内 0.65 分栏的真实宽度与键盘可达、扫描件 OCR 与双栏排版、MinerU 额度限流与断网重试在界面下的表现、15 页逐页签认、DSH 装机与发布。

## 0.3.0 — 2026-10-17（原型与数据层）

- HTML 交互原型 v0.3.0（视觉基准，G1/G2 签认）、M0 工程底座、M1 数据层（25 表 / 26 索引 / 冻结合同）、M2 第一段（导入 → 草稿核对）、MinerU 解析（API v4 全链路 + `full.md`/`content_list.json` 抽取）。85 条单测。
