# 接入与发布 v0.1

日期：2026-10-17，2026-10-22 按实测改写 §0 与身份表。状态：**已接入（实机停在 0.6.1，待重装到 0.12.0）、未打 tag、未发布**。本文是 G3 通过后照做的执行手册，同时把当前的阻塞项写清楚；不把"计划"写成"已完成"。

官方依据（本机已有原文，不依赖网页）：

| 文档 | 位置 | 版本 | 管什么 |
| --- | --- | --- | --- |
| 工作台开发规范 | `~/Downloads/dsh-desktop/docs/workbench-standard.zh.md` | 2026-09-29 | 包格式 §3、安装 §3.6、自测 §8 |
| 工作台市场验收规范 | `~/Downloads/dsh-desktop/docs/workbench-market-acceptance.zh.md` | 2026-09-29 | 上架前提、来源、资料、审核 |
| 六步速览 | `~/Downloads/dsh-desktop/docs/workbench-quickstart.zh.md` | 2026-09-29 | 流程骨架 |
| 目录协议 | `~/Downloads/awesome-dsh-workbench/catalog/README.md` | 现行 | YAML 字段、截图、来源探测 |
| 投稿指南 | `~/Downloads/awesome-dsh-workbench/CONTRIBUTING.md` | 现行 | PR 范围、审核、安全门禁 |
| 运行时行为 | `~/Downloads/dsh-desktop/docs/workbenches.md` | 现行 | 市场安装、身份解析、状态文件 |

**不适用的一份**：`docs/release-runbook.md` 是 DSH Desktop 客户端自己的签名与正式发版（macOS 公证、Windows 签名、GitHub Release），**不是工作台发布指引**。工作台发布只走上面六份。

---

## 0. 现在能不能发：能发，但先重装复验

本节 2026-10-22 按实测改写。原文写于 10-17（当时确实"不是 Git 仓库、没有包"），三条结论已全部过期。

| 事实 | 实测（2026-10-22） | 结论 |
| --- | --- | --- |
| Git 仓库 | `origin` = `xyb-openharness-dsh-plugins/breast-cancer-workbench`，`main` 已推到 `993f6c8` | P1 **已完成** |
| 可安装的包 | `npm pack` → 59 files / 3.4 MB，不含 `guidebooks/`；49 项包合同通过 | V1 可执行 |
| DSH 实机 | web profile 已装 `@pinkypal-dsh/breast-cancer-workbench@0.6.1`（本地 tgz） | **落后 6 个版本**，须重装复验 |
| 版本 tag | `git tag` 为空 | 未打 `v0.12.0` |
| 市场投稿 | 未投稿 | P2 **未开始** |

所以收尾的判据是三件事，不是"能不能发"：① 用当前 `0.12.0` 的 tgz 重装，把 V1/V2/V3 重跑一遍（容器内能看到 `v0.12.0`、业务页能开、数据落在所选目录）；② 打 `v0.12.0` tag；③ 市场投稿。

**已知的一个坑**：profile 里记的是 `file:<绝对路径>.tgz`，不是版本号。装完 0.12.0 后这个 specifier 指向仓库根的 `pinkypal-dsh-breast-cancer-workbench-0.12.0.tgz`——**这个文件一旦删掉，profile 就装不回去了**（`pnpm` 会因找不到 tarball 直接失败）。仓库根现在还留着 0.5.0–0.12.0 八个 tgz（`*.tgz` 已 `.gitignore`）。要么把当前版本的 tgz 归档到一个固定目录再装，要么装完立刻把 tgz 挪到不会被清理的地方。

### 0.1 0.12.0 装机记录（2026-10-22）

已做（有输出可复核）：

| 步骤 | 命令 / 证据 | 结果 |
| --- | --- | --- |
| 打包 | `npm pack` | `pinkypal-dsh-breast-cancer-workbench-0.12.0.tgz`，59 files / 3.4 MB，`tar tzf` 里 `guidebooks` 计数 0 |
| 装包 | `pnpm@10.15.0 --dir <web profile> add -w <tgz>` | `+1`，Done |
| 依赖登记 | profile `package.json` | `file:/…-0.12.0.tgz` |
| bundles | profile `dsh.profile.bundles` | 含 `@pinkypal-dsh/breast-cancer-workbench` |
| 落地版本 | `node_modules/…/package.json` | `0.12.0` |
| 客户端平台 | 同上 `dsh.client.platform` | `web` |
| 入口可加载 | `node -e "import('./dsh/index.js')"` | `name = breast-cancer-workbench`，`inject = ["webServer","connection"]` |
| 随包数据 | 安装目录 `assets/reference/guideline/` | `cadence.json` / `refs.json` 都在 |

**未做，需重启宿主**（当前 DSH Desktop 进程是 2026-10-20 启动的，加载的是 0.6.1）：

1. **V2**：容器内页面看到 `v0.12.0`（顶栏、页脚、关于）；
2. **V3**：业务页能开、指标检测页出现「随访节奏」卡、ALT 带参考上限时给级、`errs: []`；
3. 数据落在所选目录（不静默建目录、拒根目录/主目录/桌面）。

重启后的核对命令（不用再猜）：

```bash
# 版本：容器内页面右上角与页脚应显示 v0.12.0
# 宿主状态：确认加载的是新包
grep -c "0.12.0" "$HOME/Library/Application Support/dsh-desktop/harness/logs/"*.log | tail -3
```

### 0.2 一个待你拍板的身份问题

`package.json` 的 `repository` 指向 **`xyb-openharness-dsh-plugins/xfb-workbench`**，而本仓代码与提交都在 **`xyb-openharness-dsh-plugins/breast-cancer-workbench`**——这是两个真实存在的私仓（`gh repo view` 分别可查，`xfb-workbench` 的 main 是 `b63b7e7`，与本仓不同）。

影响：Desktop 的工作台身份、市场派生的 `owner/repo`、`register()` 里的 repository 字段全都取 `xfb-workbench`。装机后 `desktop-workbenches/state.json` 的 `added` 里也确实记的是 `xyb-openharness-dsh-plugins/xfb-workbench`。

两个选项，改之前都不动手：

- **A 保持 `xfb-workbench`**：承认它是面向用户的门面仓，本仓是开发仓。代价是市场入口指向的仓库里没有这份代码，用户点「查看源码」会看到另一份。
- **B 改成 `breast-cancer-workbench`**：身份与实际代码一致。代价是 `state.json` 里 `added` 的旧条目会失配，装过的人会看到"同一个工作台出现两次"，需要手工清一次 `added`。


### 本机能力已探测（可直接复用，不必再猜）

| 项 | 实测值 | 来源 |
| --- | --- | --- |
| DSH Desktop | **0.12.0** | `/Applications/DSH Desktop.app` Info.plist |
| Harness CLI | `dsh 0.1.0-rc.6` | `dsh --version` |
| OS / 架构 | macOS 15.7.4 / arm64 | `sw_vers`、`uname -m` |
| Node / npm | 22.22.2 / 10.9.7 | `node -v`、`npm -v` |
| dsh 内置 pnpm | 9.12.2（编译进二进制，自带 Node 22.22.2） | `dsh plugin --profile web --help` |
| 安装入口 | `dsh plugin --profile web add …` → 转发 pnpm，工作目录 `~/.dsh/profiles/web` | `dsh --help`、`--help` 输出里的 `-C` 默认值 |
| 加载层来源 | profile 的 `package.json` → `dsh.profile.bundles`；`cordis.yml` 是空数组，注释写明"树由每个 bundle 组合" | `~/.dsh/profiles/web/cordis.yml` |
| profile | `~/.dsh/profiles/` 下有 **desktop** 与 **web** 两套 | `ls` |
| 本地 tgz 装机先例 | web profile 已装 `xyb-workbench`（0.1.20）与 `cancer-psych-support-workbench`（0.3.2），均为 `file:/…tgz`，且**同时**出现在 `dependencies` 与 `dsh.profile.bundles` | profile 的 `package.json` |

**两个必须记住的坑**：

1. 两套 profile 的 `dsh.profile.bundles` 不同（desktop 是 dshmarket 那一批，web 是 xyb 那两个）。**装错 profile 的表现是"安装成功但左侧没有入口"**，不是安装失败。V2 第一步永远是确认当前 Desktop 实际加载哪个 profile。
2. `dsh plugin add` 只是**转发 pnpm**，装完 `dependencies` 会变，但 `dsh.profile.bundles` **是否同步追加，本机尚未实测**。所以装完必须 `grep` 一次 bundles；若没有包名，改用 Desktop「工作台管理 / 已安装的工作台」的安装入口，不手工改锁文件、活动链接或插件树。

---

## 1. 三个身份，别混

| 标识 | 写在哪 | 本项目的取值 | 状态 |
| --- | --- | --- | --- |
| npm 包名 | `package.json` `name` | `@pinkypal-dsh/breast-cancer-workbench` | **已定**（与 `lib/identity.js` 同源） |
| 插件条目 id | `cordis.patch.yml` 的 `insert[].id` | `breast-cancer-workbench` | 建议值 |
| 工作台身份 | `package.json` `repository` → 市场派生 `owner/repo` | `xyb-openharness-dsh-plugins/breast-cancer-workbench` | **已定**（私仓） |

`register()` **不填 `id`**：新版桌面由 `repository` 派生身份，descriptor 自带 ID 会被拒绝（`workbenches.md`）。旧 `workbenchId` 只用于老条目迁移，新投稿不填。

### 版本号规则

- 包版本必须是完整 SemVer（`x.y.z`）。**设计文档的 v0.2 / SPEC v0.5 是文档版本，不进 semver**，两者不要互相借号。
- 建议：`0.1.0` = 首个本机可安装骨架（只读链路）；`0.2.0` = 写入与导出；`1.0.0` = 一期 8 模块可用 + 三道闸口签认 + 独立审查完成，同时作为**市场首发版本**。这是建议，**未确认**。
- 同一个版本号不重复打包；改内容就升版本，不靠"重新 pack 覆盖缓存"。

### `private` 与许可证

- `private: true` 能本地装、能进 GitHub Release，**但 npm 拒绝发布**。走 npm 来源前必须去掉；走 Release / 源码来源可以保留。
- 许可证：**已定 MIT**（用户 2026-10-17 决定，D30）。仓库已有根 `LICENSE`（MIT，版权方 PinkyPal 社区贡献者），`package.json` 的 `license` 同步为 `MIT`。市场要求的"有许可证"这一项已满足；`UNLICENSED` 不再出现。
- Logo：`assets/brand/pinkypal-logo-original.jpg` 由你提供，市场要求"拥有素材使用权"。**公开前需要你确认可公开**，否则截图与 README 里不出现该 Logo。

---

## 2. 接入（G3 通过后做）

顺序不可跳：**G2 签认 → G3 评审通过 → 生成骨架 → 按文件合并 → 建表 → 只读链路 → 写入与导出**（[SPEC §9](SPEC.md)）。

### 2.1 必须落的文件

| 文件 | 要点 | 判据 |
| --- | --- | --- |
| `package.json` | `version` 完整 semver；`main` 与 `exports["."]` 同指服务端入口；`dsh.bundle.patch`；`dsh.client.platform: "web"`；`dsh.client.inject` **必须含** `dsh-desktop-workbenches`；`exports["./client"]` 真实存在；`files` 含 patch、服务端、构建产物；`repository` 指回本仓库 | 缺一项不能装 |
| `cordis.patch.yml` | 一个 `insert`；`name:` **写 npm 包名**，不写相对路径；空文件或纯注释会启动失败，没有条目就写 `[]` | 空文件是常见事故 |
| `dsh/index.js` | `Config` 必须是 Schemastery schema；本机接口放 `/api/<id>/` 前缀；需要归属判断时注入 `desktopWorkbenchOwnership` | 普通对象当 Config 会报错 |
| `lib/client.js` | **已构建的单文件**；`window.__ModuleLoader__.load({ id: '<npm 包名>' })`；`register()` 给 `title` + 组件 + `repository`；注册返回的注销函数交给 `ctx.effect` | Desktop 不替你构建 |

`peerDependencies` 里的 `@deepseek-ai/*` 要写成含预发布分支的范围（例如 `">=0.1.5-rc.2 <0.2.0-0"`），否则 rc 版宿主会 `ERESOLVE`；且**不要**塞进 `dependencies`，避免装出第二份宿主代码。

### 2.2 骨架生成与合并纪律

在**临时目录**用社区生成器产出接入骨架，再**按文件**合并进本目录；不整目录覆盖。`docs/`、`prototypes/`、`assets/` 以本仓库为准，骨架只补 `package.json` / `cordis.patch.yml` / `dsh/` / `lib/` / `scripts/`。合并后 `git diff` 逐文件看，别把模板里的示例业务、示例数据、示例仓库地址带进来。

### 2.3 布局决策：2026-10-19 修订为 customFrame（业务区默认仍 0.65）

2026-10-17 定（D21 → D34）：`businessSide: 'right'`、`businessWidth: 0.65`、`customFrame: false`，参数唯一来源 `lib/layout.js`，判定条目 SPEC **A33**。

**2026-10-19 修订**：`customFrame` 改为 `true`（业务区默认仍是 `0.65`，与 `AGENT_PANE.default = 0.35` 互补）。原因不是"0.65 挤"，而是**标准分栏下 AI 面板根本不可调**：宿主把业务宽度写成注册时的静态值，服务里没有拖宽/关闭接口（源码证据见 `docs/AGENT-PANE-DESIGN.md` §0）。用户要求"AI 对话框可调"，只有 customFrame 这条路：宿主把原生会话节点作为 `conversation` prop 交给我们排版。代价是无会话态要自己引导，且要避让 macOS 窗口按钮。

定之前先量了一遍，而不是凭"65% 会挤"的印象选 B：

- 780 / 832 / 900 / 936 / 1040 五档宽度 × 34 个视图，`scrollWidth` 与 `clientWidth` 逐视图比对，**页面级横向溢出 0**；负向对照（注入 2000px 元素）能被检出，排除检测失灵。
- 唯一真拥挤：936 下「测量记录」六列表卡只有 313px、表需 417px，卡内横滚 146px 且被 `.card` 裁掉。规则改为该卡**整行跨列**（`grid-column: 1 / -1`），936 下卡宽 640、滚动归零。实测与取舍见 [UI-DESIGN §5.6](UI-DESIGN.md)。
- 代价：B 方案要自己实现首次进入与无会话态、避让窗口按钮；A 直接复用宿主引导链路（workbench-standard §6）。为一个已能用一条 CSS 修掉的问题换整页框架不划算。

因此：V3 中官方 §8 的「`customFrame` 内不越界」**不适用**（写理由，不空着）；「面板不遮挡侧栏/市场/管理入口，键盘可达」仍需 M5 装机后实机验——**宽度实测不等于界面边界签认**。

---

## 3. 版本验证：三层，缺一层不算通过

**"验证通过"的定义**：V1 有命令输出与 hash、V2 有安装与打开的真实证据、V3 有逐项结果；**脚本通过、构建成功、截图漂亮都不能替代签认**（A20）。

### V1 包级验证（可脚本化，约 3 分钟）

```bash
# 1) 语法与静态合同
node --check dsh/index.js && node --check lib/client.js
# 社区静态检查器随骨架生成（本仓库目前没有 scripts/）；没有就跳过并记"未执行"，不要伪造通过
[ -f scripts/check-workbench-package.mjs ] && node scripts/check-workbench-package.mjs .

# 2) 打包（按仓库锁文件选 pnpm；npm 的 --ignore-scripts 仍可能执行 prepare）
pnpm pack
PKG=$(ls -t ./*.tgz | head -1)

# 3) 清单必须含四样
tar -tzf "$PKG" | grep -E 'package/package\.json|package/cordis\.patch\.yml|package/dsh/|package/lib/'

# 4) 体积（≤ 8 MiB）
stat -f%z "$PKG" | awk '{printf "%.2f MiB\n", $1/1048576}'

# 5) 包内版本 == 仓库版本（并核对页面显示用的常量）
cat VERSION
tar -xzOf "$PKG" package/package.json | grep '"version"'
node scripts/check-version.mjs

# 6) 敏感内容与绝对路径
tar -xzOf "$PKG" package/package.json | grep -nE '/Users/|/home/|C:\\'
tar -tzf "$PKG" | grep -E '\.env|\.sqlite|\.db$|token|secret|\.pem|\.key' || echo "clean"

# 7) 记录 hash（写进 §3 记录表）
shasum -a 256 "$PKG"
```

判据：全部满足才算 V1 通过。**任一失败就改代码，不改判据。**

### V2 装机验证（人工为主）

1. 确认 Desktop 版本/架构（本文 §0 已有 0.12.0 / arm64），并确认**当前加载的是哪个 profile**：
   ```bash
   grep -n 'bundles' -A12 ~/.dsh/profiles/web/package.json
   grep -n 'bundles' -A12 ~/.dsh/profiles/desktop/package.json
   ```
2. 确认安装入口**确实支持本地 tgz**：`dsh plugin --profile <name> add --help`（本机已确认转发 pnpm 9.12.2，支持 `pnpm add <tarball file>`）。
3. 安装（装到上一步确认的 profile，不装到"看起来像"的那个）：
   ```bash
   dsh plugin --profile web add --save-exact "file:$(pwd)/<pkg>.tgz"
   # 装完立刻核对加载层是否包含包名（关键，见 §0 第 2 个坑）
   grep -n '<包名>' ~/.dsh/profiles/web/package.json
   ```
   包名只出现在 `dependencies`、没出现在 `dsh.profile.bundles`，就说明这个入口只做了依赖安装，**不要**据此宣称已接入；改走 Desktop 的安装入口。
4. **不自行重启**。若 Agent 正运行在这台 Desktop 内，必须由你完整退出并重新打开；你回来确认后，才继续下面几项（官方 §1「同机重启边界」）。
5. 重启后逐项取证，**分别记录**（三种证据不能互相替代）：
   - 配置：`dsh --profile web --dump-config | grep -n <包名>`
   - 列表：Desktop「工作台管理 / 已安装的工作台」出现条目
   - 界面：左侧入口可打开，业务面板真的渲染出来
6. 卸载/回滚：卸载只移除包与入口，**保留会话、项目文件与收藏**；回滚见 §6。

判据：三种证据齐全。缺 UI 证据就只能写"安装后未验证"，不能写"已加载"。

### V3 业务验收（官方 §8 全项 + 本项目 A1–A20）

官方 §8 的 12 项按责任分三类。本项目适用情况如下（"不适用"要写理由，不能空着）：

| 官方 §8 项 | 本项目怎么验 | 责任 |
| --- | --- | --- |
| 包与加载（2 项） | V1 + V2 | 插件 |
| 面板不遮挡侧栏/市场/管理入口，键盘可达 | 缩放窗口、切模式、Tab 走一遍主要操作 | 插件 |
| `customFrame` 内不越界 | **适用**（2026-10-19 起）：缩窄窗口后操作布局、弹层与分隔边拖动，确认不越出宿主主内容区、不遮左侧会话栏，且原生 `conversation` 节点可用 | 插件（需装机实机） |
| 目录选择器 | 资料库导入必须走宿主选择器；取消后不得留下目录/空项目/会话；原目录丢失要能重选 | 插件 |
| 无会话可用 + 草稿不自动发送 | 不建会话打开面板，先做记录；点"交给 Agent 预览"才建会话，草稿由你发送 | 插件 |
| 多会话归属 | 同一工作区建原生会话 + 两个工作台会话，核对只显示对应会话 | 宿主主导，插件配合 |
| 模式切换与保留 | 切模式只改可见会话；关闭重开、卸载后数据仍在 | 宿主主导 |
| 记录版本与未验证项 | 每次填 §3 记录表 | 插件 |

再叠加本项目自己的可执行验收：A1 零资料、A2 导入失败、A7 翻转不位移、A8 减少动效、A9 臂围差值、A12 私密边界、A14 更正传播、A16 术后上肢命名、A17 看法不升级、A18 不下诊断、A19 全模块可达、A20 闸口留痕。**A12/A17/A18 在发布前必须用真实构建重跑一遍**，原型阶段通过不等于安装版通过。

### 版本验证记录表（每次发版复制一份）

| 项 | 值 |
| --- | --- |
| 包版本 / commit / tag | |
| Desktop 版本 / OS / 架构 | |
| profile | |
| pack 产物名 / 大小 / SHA-256 | |
| V1 结果（逐条） | |
| V2 配置 / 列表 / 界面证据 | |
| V3 逐项结果（含不适用理由） | |
| 未验证项 | |
| 执行者 / 日期 | |

---

## 4. P1 发布到 Git

**边界**：你说"推送 Git"只授权当前相关提交推送，**不自动等于市场投稿**。两者分别记录。

### 4.1 建仓前要你确认的四件

1. 仓库归属与名称（`owner/repo` 一旦进市场就是身份，改名要迁移会话）。
2. 许可证：**已定 MIT**（2026-10-17，D30），无需再确认；确认 `LICENSE` 与 `package.json` 一致即可。
3. Logo 与截图能否公开。
4. 仓库可见性：公开才能上市场；私有只能自用或团队内用。

### 4.2 提交前扫描（每次 push 前都跑）

```bash
git status --short
git diff --cached --check
# 真实病历/截图/本机路径/凭据不得入库
git grep -nE '/Users/|/home/|C:\\' -- . ':!docs/RELEASE.md' || true
git grep -nI -E 'BEGIN (RSA|OPENSSH|PRIVATE) KEY|api[_-]?key|secret|token' || true
du -sh .git
```

`.gitignore` 至少：`node_modules/`、`*.tgz`、`.DS_Store`、`.dsh/`、`*.sqlite`、`data/`（真实数据目录）、`screenshots/`（若含未脱敏画面）。

### 4.3 tag 与 Release

```bash
git tag -a v0.1.0 -m "breast-cancer-workbench 0.1.0"
git push origin main --follow-tags
gh release create v0.1.0 ./*.tgz --title "v0.1.0" --notes-file /tmp/release-notes.md
```

Release 说明固定五段：本次包含的模块 / 包校验值 / 安装方式 / 已知限制 / 未验证项。**不要**写"稳定""可用于临床判断"这类表述。

---

## 5. P2 发布到市场

### 5.1 选来源（顺序是官方的，不是我们的偏好）

市场按 **npm → GitHub Release → 源码** 探测，**锁定到具体版本或 commit，校验失败就报错，不会换来源**。

| 来源 | 前提 | 适用判断 |
| --- | --- | --- |
| npm | 去掉 `private`；`repository` 指回仓库；包名与 registry 一致 | 最省事，更新自动被发现 |
| Release tarball | 上传 `.tgz`；YAML 填 `tarball`；用 `latest/download/<固定文件名>` 时文件名不带版本号 | 不想公开发 npm 时用 |
| 源码 | 默认分支已含**构建产物**；市场不代跑 build | 最差体验，仅兜底 |

不建议一上来就发 npm：医疗类工作台一旦发出去就撤不回（npm 不允许同名同版本重发）。

### 5.2 收录 YAML（占位，投稿时全部替换为真值）

文件：`data/workbenches/<owner>__<repo>.yml`。**只新增这一个文件**，不改生成目录、不提交图片二进制。

```yaml
url: https://github.com/<owner>/<repo>
name: 小粉宝乳腺癌工作台
nameEn: PinkyPal Breast Cancer Workbench
category: other
description:
  zh: 把散落的检查、用药与康复记录归拢成可核对、可回溯的资料，并整理成就诊时能带着走的问题清单。
  en: Organize scattered test results, treatments, and recovery records into traceable notes, and turn them into a question list for clinic visits.
screenshots:
  - https://raw.githubusercontent.com/<owner>/<repo>/<commit>/docs/screenshots/overview.webp
```

字段判据（以 `schema/workbench.schema.json` 为准）：

- 必填：`url`、`name`、`category`、`description.zh` + `description.en`、`screenshots`（1–5）。
- `category` 只能取七类之一：`development` / `productivity` / `content` / `data` / `research` / `operations` / `other`。本项目建议 `other`（无医疗类），**待定**。
- 不填：版本、commit、npm 包名、校验值、作者 ID、`workbenchId`（新投稿）。
- 描述**必须属实**，审核会对着代码读。**不得**出现疗效、诊断、预后类承诺。

### 5.3 截图（医疗项目的高危区）

1–5 张、PNG/JPEG/WebP、单张 ≤ 2 MiB、总像素 ≤ 16 MiPixels、完整 HTTPS raw 直链、第一张为封面、建议 16:9 且宽 ≥ 1280。

**必须在最终可安装版本上实拍**，不是原型截图。本项目额外红线：画面里不能出现真实姓名、住院号、病理号、门诊时间地点、真实医生姓名；一律用模拟数据，且模拟数据本身不能看起来像真人（别用真实生日的完整日期）。

### 5.4 提交流程

```bash
gh auth status
gh repo fork dataelement/awesome-dsh-workbench --clone=false
gh repo clone <your-account>/awesome-dsh-workbench
cd awesome-dsh-workbench
git switch -c add-pinkypal-workbench
# 写入唯一的 data/workbenches/<owner>__<repo>.yml
npm ci --ignore-scripts && npm run check
git add data/workbenches/<owner>__<repo>.yml
git diff --cached --check
git commit -m 'catalog: add pinkypal breast cancer workbench'
npm run validate:pr -- upstream/main HEAD
git push -u origin add-pinkypal-workbench
gh pr create --base main --head <your-account>:add-pinkypal-workbench \
  --title 'Add PinkyPal breast cancer workbench' --body-file /tmp/workbench-market-pr.md
```

PR 描述写：用途、安装来源与精确版本、Desktop 版本 / OS / 架构、V1–V3 结果与证据、外部依赖与数据位置、限制与未验证项。还要过 `docs/security-review.md` 的 GPT-6 Luna 内容门禁。

### 5.5 状态用词（不许含糊）

| 阶段 | 只能这么说 | 证据 |
| --- | --- | --- |
| 未提 PR | 未提交 | — |
| PR 已开 | **已提交，待检查** | 真实 PR URL |
| PR 已合并 | **已合并，待目录发布** | merge commit |
| 公开索引可查、Desktop 市场能看到并可装 | **市场可见** | `https://market.dshdesktop.com/index.json` 里有该条目 + 实机安装成功 |

**"PR 合并"不等于"上架"**；检查因网络/配额跳过记为"未完成"，不算通过。

两个时间差，别误判成失败：Desktop 从 `https://market.dshdesktop.com/index.json` 读目录，**成功结果缓存 15 分钟**（响应上限 2 MB、超时 10 秒）；条目可见后，安装走 `POST /api/desktop-workbenches/market-install`，装完要**重启 Harness 才生效**。所以"合并后立刻看不到 / 装了没变化"通常只是缓存与重启，不是条目有问题。

### 5.6 之后怎么更新

- npm 来源：发新版本即可，目录定期解析 `latest`，不用再提 PR。
- Release 来源：用固定资源名时跟随同名资源；固定 tag 才需要改 YAML。
- 只有**名称/分类/双语简介/截图地址或顺序/仓库地址/tarball 选择**变化才提 YAML 修改 PR。
- 下架是单独删除 YAML 的 PR，需说明原因与影响；不会自动卸载用户本机版本，也不会删用户数据。

---

## 6. 回滚

1. 先保留当前包与用户数据；再核验旧代码能否读已升级的数据库。**切回旧 tgz ≠ 数据库可降级**。
2. 数据库不兼容时走已验证的备份/迁移路径，不删数据。
3. 市场侧回滚靠发布修复版本；已合并条目不要靠"改回旧 YAML"当作版本回滚。
4. 回滚后同样填 §3 记录表，写清"回到哪个版本、哪些数据形态已验证"。

---

## 7. 发布前一页清单

- [ ] G2 逐页签认、G3 评审通过，留痕（确认人/日期/版本）
- [x] 布局已定 **A 标准分栏 0.65**（D34，写进 SPEC §8 与 A33；判定见 §2.3）
- [ ] 仓库归属、包名 scope、Logo 授权三项已确认（许可证已定 MIT）；
- [ ] `package.json` 合同字段逐条过（§2.1）
- [ ] V1 全过，记录 SHA-256 与体积
- [ ] V2 三种证据齐全（配置 / 列表 / 界面），记录 profile 名
- [ ] V3 官方 §8 全项 + A12/A17/A18 在安装版重跑
- [ ] 包内无真实数据、无本机路径、无凭据、无未授权素材
- [ ] 截图来自最终可安装版本，已脱敏
- [ ] README 写明：不做诊断、数据存本机、未验证平台
- [ ] 只推授权范围内的提交；市场投稿单独确认

---

## 8. 需要你定的事（当前阻塞）

1. **仓库**：`owner/repo`（决定市场身份，改名成本高）。
2. ~~**许可证**~~：**已定 MIT**（2026-10-17，D30），已落 `LICENSE` 与 `package.json`。
3. **包名**：是否沿用 `@xyb-community/` scope。
4. **首发版本号**：0.1.0 先自用，还是直接冲 1.0.0 上市场。

~~**布局 A/B**~~：**已定业务区默认 0.65**（2026-10-17，D34），参数进 `lib/layout.js`；**2026-10-19 起 `customFrame` 改为 `true`**（标准分栏下 AI 面板不可拖不可收），"§8 customFrame 不越界"随之从"不适用"变回"适用"。宽度与拖动区间的唯一来源仍是 `lib/layout.js` 的 `PANEL` 与 `AGENT_PANE`。

另有一项不是阻塞但会影响首发质量：**分类只能七选一，没有医疗类**，用 `other` 是可接受的，但简介里要把"做什么"写具体，别写成"健康管理"。

---

## 9. 来源核对

本文的命令与判据来自 §0 表里六份本地文档（2026-09-29 版 + 现行目录协议）。发布前若官网已改版，以 [dshdesktop.com/workbench/docs](https://dshdesktop.com/workbench/docs/) 与 [awesome-dsh-workbench](https://github.com/dataelement/awesome-dsh-workbench) 当前内容为准，并更新本文版本。
