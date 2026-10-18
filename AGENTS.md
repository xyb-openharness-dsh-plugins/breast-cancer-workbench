# 项目协作约定

- 当前阶段：G1/G2/G3 全部通过，开发中（M0 工程底座 + M1 数据层 + **M2 第一段：导入与草稿核对**已完成；`schema/0001_initial.sql` 与 `0002_candidate_dates.sql` 已冻结，**改结构只能新增 0003_**）。设计对齐仍在进行，需求变更走 DESIGN-SESSION 台账。先读 README、docs/DESIGN-PROMPT.md、docs/DESIGN-SESSION.md 和相关需求文档。
- 使用社区 xyb-workbench-starter；本项目仅预建目录，接入骨架生成后按需合入社区完整 AGENTS 约定，保留本项目决定。开发顺序与里程碑见 [docs/DEV-PLAN.md](docs/DEV-PLAN.md)：M0 工程底座可先做，**M1 建表必须等 G3 通过**。
- 区分用户要求、研究发现、设计建议、已确认决定和实际验证；每轮聚焦一个影响方案的关键问题，由 Agent 维护文档。
- 参考 xyb-workbench 的实际能力，逐项记录保留、改造或延期原因，不机械替换癌种名称。
- 保留 DSH 公共导航、设置、权限和原生 Agent 会话；业务数据放用户明确选择的资料目录。
- 原始资料、识别候选、用户核对记录、专业判断分开。云处理明确发送内容；不复制参考项目凭据、真实病历或患者数据库。
- **MinerU Token 不进仓库**：只走环境变量 `MINERU_TOKEN` 或 `.secrets/mineru.json`（已忽略）；`npm run check` 含密钥扫描，错误消息只允许出现掩码。解析结果永远只是候选，失败不产候选（A2）。见 [docs/MINERU.md](docs/MINERU.md)。
- 需求与原型未确认前不展开业务实现。独立审查、用户访谈、Desktop 加载未执行时标待完成。
- 先检查 git 状态；保留已有修改。不自动提交、推送、发布或安装插件。
- 未知大小命令输出按字节截断，默认 4000；测试/构建使用 pipefail。禁止交互命令及无超时长任务。

## 本次用户明确约束

- **三道审核闸口，顺序不可跳**：G1 业务流程与功能 → G2 HTML 交互 demo → G3 数据模型与数据流。**HTML 是确认闸口，通过后才能进入开发**；G3 未过不建表、不写迁移。闸口通过必须留痕（确认人、原话要点、日期、产物版本），截图与脚本检查不算签认。
- 先出可操作HTML工作台UI，用户确认具体版本和范围后，才开发对应业务；未确认不开始。静态图、检查通过或模拟保存不替代确认。
- 数据模型谨慎设计，支持前端和业务流程变化；领域事实、流程实例、页面读模型与偏好分离。**必读 docs/SCHEMA-SPEC.md 与 docs/DATA-FLOW-SPEC.md**（实体与写入语义的权威），docs/SCHEMA.md 只保留四层边界与变化矩阵。原型state不是数据库结构。
- 产品只提供信息，不做诊断：诊断与处置由医生判断；用户的判断/担心按"一条信息"记录（viewpoint），标注"不是医生结论"，不进趋势、不进摘要事实区。
- 术后康复相关模块与话题统一用「术后上肢」命名，不用「肩」作主题名；解剖描述可写"肩关节前屈"。
- UI以用户提供的PinkyPal小粉宝Logo为色系基准，保持原比例与完整；见assets/README.md。
  - **页面只能引用所在目录内的相对路径**：`../../assets/...` 在 `file://` 下能显示、经 HTTP 预览会 404（v0.3 的 logo 事故即此）。原型用 `prototypes/v0.3/assets/brand/`，见 UI-DESIGN §5.5。
- **版本号按 [docs/VERSIONING.md](docs/VERSIONING.md)**：唯一来源是仓库根 `VERSION`；页面顶栏 / 页脚 / 关于三处同源渲染，禁止手写第二份；改版本先改 `VERSION`，再跑 `node scripts/check-version.mjs`，并同步 CHANGELOG 与 git tag。窄屏可隐藏顶栏 chip，但页脚必须常驻。
- **发布按 [docs/RELEASE.md](docs/RELEASE.md)**：依据 `dsh-desktop/docs` 的工作台规范与 `awesome-dsh-workbench` 目录协议（**不是** Desktop 客户端的 `release-runbook`）。版本验证分 V1 包级 / V2 装机 / V3 业务三层，缺一层不算通过；Git 推送与市场投稿是两个独立授权。**"PR 已合并"不等于"上架"**，公开索引可查且实机可装才叫市场可见。当前已有 `package.json`（包名为临时占位、许可证 **MIT**）、`npm run check` 可跑，但 `dsh/index.js` 与 `lib/client.js` 是占位、`schema/` 冻结（2 个迁移）、**非 Git 仓库、未接入 DSH、未装过**，不得声称已接入或已安装。
