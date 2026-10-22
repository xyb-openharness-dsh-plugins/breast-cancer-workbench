# 版本号规范

日期：2026-10-17。状态：生效。适用范围：原型、开发分支、打包产物、DSH 工作台清单。

## 1. 一句话规则

**版本号只有一个来源：仓库根目录的 `VERSION` 文件。页面上看到的每一个版本号，都必须由它渲染出来，不允许第二个人工维护的数字。**

## 2. 格式

语义化版本（SemVer 2.0）：

```
MAJOR.MINOR.PATCH[-prerelease]
```

- 正式：`0.3.0`、`1.2.4`
- 预发布：`1.0.0-rc.1`、`0.4.0-beta.2`
- **页面显示时加 `v` 前缀**：`v0.3.0`。数据里、文件名里、tag 里不加（tag 例外，见 §6）。
- 构建日期、commit、渠道**不写进版本号本体**，另用字段表达（§4）。

## 3. 什么时候升哪一位

| 变化 | 升位 | 例子 |
| --- | --- | --- |
| 数据结构不兼容：改表、删字段、改语义，旧数据需迁移 | MAJOR | `0.9.0 → 1.0.0` |
| 用户可见的新功能、新页面、新指标 | MINOR | `0.3.0 → 0.4.0` |
| 修缺陷、调文案、改样式、补测试 | PATCH | `0.3.0 → 0.3.1` |
| 只是改文档、改注释、改脚本 | **不升版本** | 版本号不动 |

判断口诀：**用户能不能感知到新东西 → MINOR；用户只觉得「以前不对的现在对了」→ PATCH；旧数据会不会读不出来 → MAJOR。**

当前阶段特殊约定：`0.x` 表示**设计迭代**（v0.1 原型、v0.3 原型），不是可安装产品。首个可安装版本由 [RELEASE](RELEASE.md) §8 决定；若定为 `1.0.0`，则把 `VERSION` 改成 `1.0.0` 并同步全部位置，不保留 `0.3.0 → 1.0.0` 的跳跃说明（在 CHANGELOG 里写一句即可）。

## 4. 版本相关的四个字段

| 字段 | 来源 | 是否显示 | 说明 |
| --- | --- | --- | --- |
| `version` | `VERSION` | 是（页面上必须可见） | 唯一来源 |
| `build` | 构建日期 `YYYY-MM-DD` | 是（页脚、关于） | 同一天多次构建不区分，靠 git 区分 |
| `channel` | 人工设定，三选一 | 是（关于弹窗标签） | `prototype` / `beta` / `stable` |
| `commit` | 构建时注入 | 否（只进 `title`） | 无 git 时写 `local` |

渠道影响用户预期，不能省：原型必须写「交互原型 · 未接入 DSH」，否则用户会以为数据是真的。接入后 `beta` 与 `stable` 的差别写在发布说明里。

## 5. 显示位置（三处，同源）

| 位置 | 桌面 | 窄屏（≤600） | 形式 |
| --- | --- | --- | --- |
| 顶栏右侧 | 显示 `v0.4.0` chip，可点开「关于」 | **隐藏**（让位给「资料目录 / 对话」两个功能入口） | `<button class="ver-chip">` |
| 页脚右侧 | `v0.4.0 · 2026-10-17` | 显示（窄屏唯一的常驻位置） | `.ver-line` |
| 设置 → 关于 | 完整四项：版本、构建日期、版本来源、渲染说明 | 同左 | 弹窗 |

硬约束：

1. **窄屏不能两处都没有**。顶栏可以让位，页脚必须留着。
2. 版本号不能做成纯装饰文字——顶部 chip 要能点开，用户能看到「这是什么版本、什么时候构建的」。
3. 不允许出现「设计草案」这类替代版本号的模糊说法作为唯一标识；描述可以留，但必须另有 `vX.Y.Z`。
4. 关于弹窗里的版本号与页脚必须逐字相同，不允许一个带 `v` 一个不带。

## 6. 发版时按顺序做

1. 改 `VERSION`（只改这一个文件里的数字）。
2. 让其他位置与它一致：开发版手工改 `public/index.html` 里所有 `vX.Y.Z` 字面量（标题、顶栏 chip、页脚、prototype-bar）与 `public/js/state.js` 的 `version` 默认值——它们是 JS 未运行时的降级值，运行时会由 `/api/state` 覆盖。**`prototypes/v0.3/` 不用改**：那是 G1/G2 签认过的快照，冻结在 `0.3.0`（D37）；`node scripts/check-version.mjs` 会核对它没被改动，也会核对它**没有**跟着新版本号跑。
3. 跑 `node scripts/check-version.mjs`，必须全绿。
4. 在 CHANGELOG 顶部加一条（日期 + 版本 + 一句话）。
5. 打 tag：`git tag v0.3.0`（tag 带 `v`，与页面一致）。
6. 打包 / 发布 / 接入 DSH 时，用同一个版本号写进 `package.json`、`dsh.profile.json` 等工作台清单；校验脚本会自动核对存在的清单文件。

## 7. 禁止事项

- ❌ 页面里再写一个手填的版本号（第二来源必然漂移）。HTML 里的降级字面量不算第二来源，但必须与 `VERSION` 相同，并由校验脚本锁定。
- ❌ 版本号与 git tag 不一致，或发布后忘记改 `VERSION`。
- ❌ 预发布版显示成正式版（`1.0.0-rc.1` 不能显示为 `v1.0.0`）。
- ❌ 用 commit 短哈希冒充版本号（`v3ed1d99e` 不是版本）。
- ❌ 只升版本不写 CHANGELOG，或只写 CHANGELOG 不升版本。

## 8. 校验

```bash
node scripts/check-version.mjs
```

核对项（共 8 处）：

1. `VERSION` 是否存在且合法；
2. `prototypes/v0.3/app.js` 的 `APP_INFO.version` = `0.3.0`（**快照冻结**，D37）；
3. `prototypes/v0.3/index.html` 的 `<title>` 与全部版本字面量 = `0.3.0`（同上）；
4. `public/index.html` 的 `<title>`（开发版页面）；
5. `public/index.html` 里全部版本字面量（去重后必须只有一个值）；
6. `public/js/state.js` 的 `version` 默认值（`/api/state` 回来之前的降级显示）；
7. `lib/version.js` 的 `version`（构建生成物，页面与包的取值来源）；
8. `package.json` 的 `version`；若存在 DSH 清单（`dsh.profile.json` / `workbench.json` / `dsh/manifest.json`）一并核对。

`lib/version.js` 由脚本生成，不要手改：

```bash
npm run build:version     # 从 VERSION + git 生成；内容不变则不写盘
npm run check             # 一条命令：版本同步 → 语法 → 文案红线 → 单测 → 版本一致
```

`package.json` 的 `version`、`lib/version.js` 的 `version`、`VERSION` 三者必须同时相同；M0 起 `npm run check` 会把这条钉死。

`build:version --check` **不比对 `commit` 那一行**：生成物一提交，HEAD 就前进一格，这一行永远落后（旧注释里写"提交后必然滞后一格"）。所以校验分两步——其余内容必须逐字一致；`commit` 只核对"它是本仓库的真实历史提交"（`merge-base --is-ancestor`）。**滞后放行，编造拒绝**：把哈希改成不存在的值会被判失败。这条不写死，`npm run check` 在每次提交后都会假红一次，久了就没人看了。

输出示例：

```
✓ prototypes/v0.3/app.js（快照冻结）                 0.3.0
✓ prototypes/v0.3/index.html（快照冻结）             0.3.0
✓ prototypes/v0.3/index.html 版本字面量（去重）         0.3.0
✓ public/index.html <title>                    0.4.0
✓ public/index.html 版本字面量（去重）                  0.4.0
✓ public/js/state.js version 默认值               0.4.0
✓ lib/version.js version                       0.4.0
✓ package.json version                         0.4.0

✓ 版本号一致：v0.4.0（共核对 8 处；原型快照冻结在 v0.3.0）
```

建议挂进提交前检查与 CI；开发阶段接入 `npm run check:version`，与 `npm test` 一起跑。
