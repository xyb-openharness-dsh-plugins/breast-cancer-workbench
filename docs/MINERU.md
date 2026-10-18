# MinerU 接入（解析层）

日期：2026-10-17。状态：**客户端与解析链路已实现并真实跑通**（1 页合成 PDF，8 项指标全部正确落库）；
界面上的"解析中/失败/重试"三态属 M2 第二段，尚未做。

## 1. 为什么选它

本地优先不等于本地解析。PDF 化验单、出院小结是扫描件或双栏排版，正则读不出来；
一期又不该让用户为了导入一份报告去装 Python 模型。所以解析这一步走云端，
**原件与解析结果都留在本机**，只把文件内容传给 MinerU 换回 markdown。

代价要写在明处：

| 代价 | 说明 | 我们怎么处理 |
| --- | --- | --- |
| 原件要出本机 | 上传到 `mineru.net` | 导入前明确提示；不自动上传，必须用户点"解析"；离线时功能不可用 |
| Token 要保管 | `sk-` 开头的长期凭证 | 只从环境变量或 `.secrets/mineru.json` 读，进 `.gitignore`；`npm run check` 有密钥扫描 |
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

优先级：`new MineruClient({ token })` 显式传入 > 环境变量 `MINERU_TOKEN` > `.secrets/mineru.json`。

```bash
# 方式一（推荐）：环境变量
export MINERU_TOKEN="sk-..."
# 方式二：本地文件（已在 .gitignore）
echo '{"token":"sk-..."}' > .secrets/mineru.json && chmod 600 .secrets/mineru.json
```

三条硬规则：

1. **不写进源码、文档、测试**。`npm run check` 里的 `scripts/check-secrets.mjs` 会扫全仓库；
   示例字符串确实需要时在同一行加 `secret-allow`。
2. **不进日志**。错误消息只给来源（`env:MINERU_TOKEN`）与掩码（`sk-ib****Ab`），给全串一律视为缺陷。
3. **`.secrets/` 不进包**。`package.json` 的 `files` 白名单里没有它。

轮换：拿到新 Token 换文件/环境变量即可，代码里没有硬编码，不需要改任何文件。

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
