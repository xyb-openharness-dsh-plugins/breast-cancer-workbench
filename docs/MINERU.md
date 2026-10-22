# MinerU 接入（解析层）

日期：2026-10-17 立项，2026-10-21 补失败三态。状态：**客户端与解析链路已实现并真实跑通**（1 页合成 PDF，8 项指标全部正确落库）；
界面的"解析中 / 失败 / 重试"三态已在 v0.8.1 补上（含按错误码给下一步，见 §5.1）。

## 1. 为什么选它

本地优先不等于本地解析。PDF 化验单、出院小结是扫描件或双栏排版，正则读不出来；
一期又不该让用户为了导入一份报告去装 Python 模型。所以解析这一步走云端，
**原件与解析结果都留在本机**，只把文件内容传给 MinerU 换回 markdown。

代价要写在明处：

| 代价 | 说明 | 我们怎么处理 |
| --- | --- | --- |
| 原件要出本机 | 上传到 `mineru.net` | 导入前明确提示；不自动上传，必须用户点"解析"；离线时功能不可用 |
| Token 要保管 | `sk-` 开头的长期凭证 | **唯一持久来源是 `.secrets/mineru.json`**（进 `.gitignore`）；环境变量只作临时覆盖；`npm run check` 有密钥扫描 |
| 有额度上限 | 单文件 200MB / 600 页；高优先级 2000 页/天 | 超限按失败处理并保留原件，可换方式重试 |
| 结果不保证对 | OCR 与表格还原都会错 | 解析结果**永远只是候选**，必须逐项核对后才进事实层 |

## 2. 协议（API v4）

```
① POST https://mineru.net/api/v4/file-urls/batch   → { batch_id, file_urls[] }
② PUT  <file_urls[0]>           （上传原件，**不设 Content-Type**）
③ GET  /api/v4/extract-results/batch/{batch_id}    → state: pending|running|converting|done|failed
④ GET  <full_zip_url>                              → zip：full.md / *_content_list.json
```

实现在 `dsh/mineru.js`（`MineruClient.parse()` 串起四步），ZIP 解包在 `lib/zip.js`
（手写中央目录解析，零依赖，不支持 ZIP64 时明确报错）。

`code !== 0` 或者 `state === 'failed'` 都算失败——**不把"跑完了"当"解析对了"**，
更不把空字符串当成功结果。

## 3. 密钥

**`.secrets/mineru.json` 是唯一的本地密钥文件**，也是唯一持久来源；不解密、不回显、不进包。
环境变量 `MINERU_TOKEN` 只用于临时注入（CI、一次性排查），不作为配置方式写进文档或界面。
不读 `~/.mineru/config.yaml`，也不认其它 MinerU 历史配置文件。

优先级：`new MineruClient({ token })` 显式传入（测试注入） > `.secrets/mineru.json`（唯一持久来源） > 环境变量 `MINERU_TOKEN`（仅在文件缺失时兜底）。

**文件优先于 env（2026-10-22 统一口径）**：界面里保存的 Token 永远生效，env 不会把它盖掉。历史教训——本机曾留一条过期 `MINERU_TOKEN`，用户在界面换了新 Token 仍持续 401，且看不出来为什么。

```bash
# 唯一持久配置方式（已在 .gitignore，权限 600）
echo '{"token":"sk-..."}' > .secrets/mineru.json && chmod 600 .secrets/mineru.json

# 临时覆盖（不进任何文件，只影响这一次进程）
MINERU_TOKEN="sk-..." npm start
```

三条硬规则：

1. **不写进源码、文档、测试**。`npm run check` 里的 `scripts/check-secrets.mjs` 会扫全仓库；
   示例字符串确实需要时在同一行加 `secret-allow`。
2. **不进日志**。错误消息只给来源（`.secrets/mineru.json` 或 `env:MINERU_TOKEN`）与掩码（`sk-ib****Ab`），给全串一律视为缺陷。
3. **`.secrets/` 不进包**。`package.json` 的 `files` 白名单里没有它。

轮换：改写 `.secrets/mineru.json` 即可，代码里没有硬编码，不需要改任何文件。

## 4. 从 markdown 到候选

`dsh/labparse.js` 只做抄写，不做判断：

| 输入 | 规则 |
| --- | --- |
| 指标名 | 只认字典里的 18 项（内置词表 + `metric_definition.aliases_json` 的用户别名）；拉丁名要词边界（`CRP` 不会被当成肌酐） |
| 数值 | 取指标名后第一个数；参考范围 `3.5-9.5` 不会被当成结果 |
| 不等式 | `<0.5` 原样保留、`value_num` 留空——折成 0.5 就是替用户下结论 |
| 单位 | 归一常见写法（`10^9/L`→`10⁹/L`、`umol/L`→`μmol/L`）；认不出就留空，草稿页标 `unit_missing` |
| 日期 | 先看带标签的行（采样/报告日期…），再看前 40 行的第一个日期；`2026-02-31` 这种不认 |
| 表格 | 按单元格对齐；MinerU 把整张表塞进一个单元格时**按位置对齐**，指标数与数值数不一致就整行放弃 |
| 结论 | 不产病理结论、不产"是否复发"、不写 `viewpoint` |

对不齐就整行放弃，是这里最重要的取舍：**宁可漏一条让用户手填，也不能把 8 个指标写成同一个数**。
（2026-10-17 实测确实踩到了：第一版给 8 项全写了 `18.6`，修好后 8 项各自正确。）

## 5. 失败语义（和 A2 一致）

```
startParse(engine=mineru) → 上传/轮询/解包 → 候选写入 + document=parsed + job=succeeded   （同一事务）
                                          ↘ 任一步失败：事务回滚 → document=parse_failed + job=failed
                                            （候选 0 条，原件保留，可重试；错误码与原文都留在 jobs 里）
```

- 失败不产候选：`parse_failed` 状态下 `addCandidate` 直接拒绝（A2）。
- 不静默降级：不做"云端失败就本地正则凑一份"——两套口径产出的数据没法比较。
- 重试不重置历史：重复导入不新建文档；重试会新增一条 `parse_job`，旧的失败记录留着。

### 5.1 错误码怎么变成人话（v0.8.1）

界面不把 `NO_TOKEN：没有 MinerU Token：设置环境变量…` 直接甩给用户。`public/js/parse-fault.js`
登记了错误码 → 「短标签 / 结论 / 下一步」三件套，单测 `test/parse-fault.test.mjs` 钉住：

| 错误码 | 卡片上的结论 | 给的下一步 |
| --- | --- | --- |
| `NO_TOKEN` | 还没有可用的 MinerU Token | 去填 Token（直达设置·文档解析）/ 手工录入指标 |
| `UNAUTHORIZED` | Token 无效或已过期 | 去填 Token |
| `CONSENT_REQUIRED` | 还没勾选云端解析同意 | 回导入框勾选后重试 |
| `TIMEOUT` | 等云端结果超时 | 直接重试 |
| `TASK_FAILED` | 云端没能解析这份文件 | 换清晰版本再试 / 手工录入 |
| `API_ERROR` | 接口返回错误 | 重试 + 核对 Token 与额度 |
| 未登记的错误码 | 这次解析没有成功（**不猜原因**） | 重试 / 手工录入 |

原始 `error_code` 与 `error_text` 收在卡片的「技术信息（排查用）」折叠块里，不占正文；
每条提示都写明"原件还在、这次没有产生候选"——用户最怕的是失败会不会丢资料。
**未做**：解析阶段只有"解析中（云端一般 10–30 秒）"一句话，没有百分比或分阶段进度
（MinerU 批次接口在 `done` 后才给结果，中途没有可信进度可展示，不编一个假的）。

### 5.2 模型选择：默认 vlm（2026-10-21 实测修订）

**结论**：默认提交 `model_version: 'vlm'`。`pipeline` 会把靠空格分列（而不是画线）的表格压成一整格。

同一份检验单 PDF（`cupsfilter` 由纯文本生成，1 页 5 项指标）真实上传两次：

| 模型 | 返回的表格 | 抽取结果 |
| --- | --- | --- |
| `pipeline`（原默认） | 整表只剩 3 个 `<td>`：`项目 白细胞 中性粒细胞绝对值 1.4 血红蛋白 血小板 ALT` / `结果 3.8 118 g/L` / `采样日期…单位…`；**210 与 22 文本里直接丢失** | **0 条候选**，只认出报告日期；页面显示"解析完成：新增 0 项" |
| `vlm`（现默认） | 4 列 6 行完整还原，项目/结果/单位/参考范围各就各位 | **5/5 全中**，单位正确，9.6 秒 |

用 HTML→PDF 生成的表格排版两种模型都能读对，所以这不是"vlm 全面更强"，而是**压平表格时 pipeline 会丢数据**。
代价与边界写清楚：vlm 的额度与耗时差异**未测**，真实医院 PDF 的批量准确率**未统计**，候选仍然必须逐项核对。

**退回规则**：只有接口明确说模型参数不受支持（`API_ERROR`/`BAD_INPUT` 且报文含 model/模型/version/参数）才退回 `pipeline`；
文件解析失败（`TASK_FAILED`）、没 Token、超时都不换模型重试——那是多花一次额度换同一个结论。
用户可用 `settings.mineruModel` 固定模型（只接受 `vlm` / `pipeline`），没有界面下拉框。

**另一个必须说清的状态**：解析成功但 0 项候选。草稿页给专门说明卡（原因 + 引擎 + 页数 + 查看原文 + 手工录入），
不再让用户对着"新增 0 项"猜是不是坏了。

## 6. 实测记录（2026-10-17）

| 项 | 结果 |
| --- | --- |
| 鉴权 | `GET /extract/task/<不存在>` 返回 `code=-60012`（而不是 401）→ Token 有效 |
| 一次完整解析 | 1 页合成 PDF（`cupsfilter` 生成，无真实患者数据）：申请→上传→轮询→下载 **8.6–9.7 秒** |
| 产出 | zip 内 `full.md` + `*_content_list.json` + `layout.json` + `model.json` + `images/` |
| 页数 | 批次接口在 `done` 后**不返回** `extract_progress`（`pages` 为 null）→ 改从 `content_list` 的 `page_idx` 上限推，单页即 1 |
| 抽取 | 8 项指标值与单位**全部正确**（修完对齐 bug 之后），报告日期 `2026-09-28` 自动识别并写进 `document.report_date` |
| 落库 | 候选项 → 批量接受 → `observation` 8 条，`reviewed_by` 仍为 NULL（接受≠临床审核） |

**未验证**：扫描件/图片 OCR 质量、双栏排版、多页报告、中文项目名的识别率、真实患者报告的错读率、
额度用尽时的表现、网络中断重试。这些要么等真实样本，要么属 M2 第二段。

## 7. 代码位置

| 文件 | 职责 |
| --- | --- |
| `dsh/mineru.js` | Token 解析、四个接口、轮询与超时、ZIP 内取 markdown |
| `lib/zip.js` | 最小 ZIP 读取器（中央目录 + deflateRaw） |
| `dsh/labparse.js` | markdown / content_list → 候选（词表、单位归一、表格对齐、日期） |
| `dsh/import.js` | `ImportService.parseWithMineru()`：状态机 + 事务 + 候选写入 |
| `scripts/check-secrets.mjs` | 密钥扫描（`sk-`、私钥、AWS/GitHub Token），并检查 `.gitignore` 含 `.secrets/` |
| `test/mineru.test.mjs` | 假 fetch 跑五个环节 + 出错分支（401/失败/超时/缺 full.md） |
| `test/labparse.test.mjs` | 抽取边界（参考范围、不等式、词边界、表格对齐、日期） |
