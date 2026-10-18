# 贡献指南 · PinkyPal 小粉宝 · breast-cancer-workbench

> 立场先行：本项目只做**信息整理与就诊准备**，不做诊断、不做治疗建议、不替代临床判断。
> 组织级总指南见 <https://github.com/xyb-openharness-dsh-plugins/.github/blob/main/profile/README.md>，病种路线图与认领见 <https://github.com/xyb-openharness-dsh-plugins/.github/blob/main/ROADMAP.md>。

## 快速开始

```bash
npm install
npm run check   # 提交前必须通过
npm start       # 本地启动开发版界面
```

## 提交流程

1. 从 `main` 切出分支：`feat/xxx`、`fix/xxx`、`docs/xxx`。
2. 完成改动并自测，`npm run check` 全绿（检查链含：版本同步、结构/语法、文案红线、密钥扫描、单测、版本一致性）。
3. 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)：`feat: / fix: / docs: / chore: / test:`。
4. 发起 Pull Request（模板见 `.github/PULL_REQUEST_TEMPLATE.md`），至少一名维护者评审后合入。

## 项目红线（提交前自查）

- **文案红线**：不得出现「建议治疗」「可能复发」「可以停药」「无需就医」「治愈率」等表述；免责语句只能出现在否定语境。检查链会拦截，不要用注释绕过。
- **医疗内容**：新增医学相关文案必须标注来源；未核实项明确标注「未核实」。
- **隐私优先**：本机优先架构，任何改动不得把用户数据上传到远端；不提交患者可识别信息、截图、真实病历；不提交任何密钥（`.secrets/` 已 gitignore）。
- **测试**：新增功能带单测；测试一律用内存库，不依赖固定路径。
## 数据层与版本（本项目特有）
- `0001_initial.sql` 与 `0002_candidate_dates.sql` 已冻结（sha256 见 `schema/freeze-contract.md`），**只能新增 `0003_*.sql`**，修改历史迁移会被 `check:schema` 拦下。
- `lib/version.js` 是生成物（`npm run build:version`），不要手改；版本唯一来源是根目录 `VERSION`。

## 需要帮忙？

在 [Issues](https://github.com/xyb-openharness-dsh-plugins/breast-cancer-workbench/issues) 提问即可，维护者会尽快回复。
