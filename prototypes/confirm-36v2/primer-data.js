/* 小粉宝 PinkyPal · 疾病概要数据（36 号 v2 · §2.5 指南链接版）
 * 口径：docs/DISEASE-PRIMER.md；规范：starter docs/36-DISEASE-PRIMER.md。
 * 全部内容属第 ② 层（解释）：只写定义、文件、指南列举过的手段、已发生的变化。
 * 任何「你该怎么办」的判断都不在这里，固定出口是「这一句需要问你的医生」。
 *
 * 【v2 改动】每条来源补 url / secondaryUrl（§2.5）。规则：
 *   original: true  → url 必须是可点开的 https 链接；
 *   original: false → secondaryUrl 必须可点。
 * 下列链接于 2026-10-27 逐条 curl 实测（状态码写在 note 里），失效的原链接已换掉：
 *   - Springer 的 AJCC 8th DOI（10.1007/978-3-319-40618-3）已跳 /deleted，不用；
 *   - cancerstaging.org 现 301 到 FACS 的 AJCC 页，直接写最终地址。
 *
 * 【本文件仍有一处红标】CACA-CBCS 2025 精要本：原件是本地 PDF 存档，
 * 全网没有公开全文链接 → 按现行 §2.5 判「缺链接」。这不是漏写，是需要你定夺的那件事。
 */
window.DISEASE_PRIMER = {
  brand: '小粉宝 PinkyPal',
  name: '乳腺癌',
  en: 'Breast Cancer',
  updated: '2026-10-27',
  sections: [
    {
      id: 'definition',
      title: '定义',
      intro: '乳腺癌是来源于乳腺上皮组织的恶性肿瘤的统称，不是一种病。病理类型、分子分型与分期的不同组合，'
        + '对应指南里不同的治疗与随访条目——所以这台工作台把「哪一型、哪一期」放在所有记录的第一层。',
      points: [
        '病理类型命名以世界卫生组织（WHO）《乳腺肿瘤分类》第 5 版为口径。本项目据 CACA-CBCS 2025 精要本转引，未取得 WHO 原件，页码待核。',
        '浸润性乳腺癌的分子分型按 ER / PR / HER2 / Ki-67 划分（精要本 P36、P40）。2025 版在 P40 增加了标注：Luminal-B HER2 阴性时，「PgR 低表达」与「Ki67 高表达」符合一项即可判定。',
        '分期用 AJCC 第 8 版 TNM：解剖学分期与预后分期是同一版里的两条口径，精要本 P35 在 2025 版按 AJCC 第 8 版原文做了系统性修改。',
        '本台只把病理报告与分期报告的原文抄进档案，不把分型或分期换算成「严重程度」，也不替报告补字。'
      ],
      sources: [
        { org: 'CACA-CBCS / CMA-CSO-BO', doc: '乳腺癌诊治指南与规范（2025 年版 精要本）', version: '2025 精要本（2024-12-22 发布）', original: true, page: 'P35–P36、P40', note: '原件为本地 PDF 存档（MinerU 抽取），全网无公开全文链接' },
        { org: 'WHO', doc: 'Classification of Tumours: Breast Tumours, 5th ed.', version: '第 5 版（2019）', original: false, page: '页码待核', secondaryUrl: 'https://publications.iarc.who.int/Book-And-Report-Series/Who-Classification-Of-Tumours/Breast-Tumours-2019', note: '出版方 IARC 页面（实测 200），未取得全书' },
        { org: 'AJCC', doc: 'Cancer Staging Manual, 8th ed.（乳腺章节）', version: '2017', original: false, page: '页码待核（据精要本 P35 转引）', secondaryUrl: 'https://www.facs.org/quality-programs/cancer-programs/american-joint-committee-on-cancer/', note: 'cancerstaging.org 现 301 到此处（实测 200）' }
      ]
    },
    {
      id: 'evidence',
      title: '医学资料规范和指南情况',
      intro: '这台工作台里出现的每一条「该查什么、怎么分级、多久复查」，都应能追到下面某一份文件。'
        + '拿到了原件的照实标「已取得」并给链接；只拿到转载件或二手引用的，写「未取得原件」并给二次来源。',
      table: {
        head: ['机构', '文件', '版本 / 年份', '原件', '本台的用途'],
        rows: [
          ['CACA-CBCS / CMA-CSO-BO', '中国抗癌协会与中华医学会肿瘤学分会乳腺癌诊治指南与规范', '2025 年版 精要本（2024-12-22 发布，246 页）', '已取得（本地 PDF 存档）', '主引用源：随访节奏（P208 表 9.5 / P209 表 9.6）、分级口径、分型与病理判读'],
          ['CACA-CBCS / CMA-CSO-BO', '中国抗癌协会乳腺癌诊治指南与规范', '2024 年版（全文，2024-06-10 发布）', { text: '未取得原件（转载件）· 协会解读页', url: 'https://wap.cacakp.com/appnews/detail/id/21936' }, '补充源：查 2025 精要本压缩掉的完整章节'],
          ['CSCO', 'CSCO 乳腺癌诊疗指南', '2023 版（58 页扫描 PDF）', '已取得（本地扫描件，未抽文本）', '对照源：看中国 I/II/III 级分层推荐的写法，不作阈值来源'],
          ['NCCN', 'NCCN Guidelines · Breast Cancer', '版本未核实', { text: '未取得原件 · 官方目录页', url: 'https://www.nccn.org/guidelines/category_1' }, '仅在 2025 精要本 P80 被引述；本台不单独引用其条文'],
          ['AJCC', 'Cancer Staging Manual, 8th ed.（乳腺章节）', '2017', { text: '未取得原件 · AJCC 官方页', url: 'https://www.facs.org/quality-programs/cancer-programs/american-joint-committee-on-cancer/' }, 'TNM 解剖学分期与预后分期的口径'],
          ['WHO', 'Classification of Tumours: Breast Tumours, 5th ed.', '第 5 版（2019）', { text: '未取得原件 · IARC 出版方页', url: 'https://publications.iarc.who.int/Book-And-Report-Series/Who-Classification-Of-Tumours/Breast-Tumours-2019' }, '组织学类型命名的唯一口径']
        ]
      },
      points: [
        '同一份指南隔一年，条目会变；所以本台引用一律带「机构 + 版本 + 页码」，不写「指南认为」。',
        '未取得原件的文件只记「存在」与「大致讲什么」，不引用其具体条文，页码写「页码待核」。',
        'CSCO 的分层推荐（I/II/III 级）在本台不做成产品菜单——分层是给医生的写法，不是给患者的选择题。'
      ],
      sources: [
        { org: 'CACA-CBCS / CMA-CSO-BO', doc: '乳腺癌诊治指南与规范（2025 年版 精要本）', version: '2025 精要本', original: true, page: 'P208–P209、P227', note: '本地 PDF 存档' },
        { org: 'CSCO', doc: 'CSCO 乳腺癌诊疗指南', version: '2023 版', original: true, page: '页码待核（扫描件未抽文本）', note: '本地扫描件存档；CSCO 指南无公开下载' },
        { org: 'NCCN', doc: 'NCCN Guidelines · Breast Cancer', version: '版本未核实', original: false, page: '页码待核', secondaryUrl: 'https://www.nccn.org/guidelines/category_1' }
      ]
    },
    {
      id: 'landscape',
      title: '目前治疗全景概要',
      intro: '下面按期别与线序列出指南里出现过的手段类别。这是「世界上大致有哪些办法」的地图，不是给你排的先后顺序，'
        + '也不含剂量、疗程与适用条件——那些必须由医生按你的病理与影像决定。',
      groups: [
        {
          label: '早期可手术（局限期）',
          points: [
            '手术：乳腺处理（保乳或全乳切除）与区域淋巴结处理（前哨淋巴结活检、腋窝清扫）在指南里分别成章。2025 版在 P65 增加了「保守性全乳切除」的写法，在 P79 增加了豁免前哨淋巴结活检的三条情形。术式取舍属医生判断。',
            '放疗：保乳术后放疗、术后胸壁放疗在指南结构中被列出；本台只记「做过没有、什么时候、几次」。',
            '新辅助与辅助系统治疗：按分子分型分层列出化疗、内分泌治疗、抗 HER2 治疗。新辅助方案与适用人群写在精要本 P109、P113。'
          ]
        },
        {
          label: '局部晚期 / 转移后',
          points: [
            '系统治疗按分子分型与线序分组：内分泌治疗、化疗、抗 HER2 靶向、CDK4/6 抑制剂、PARP 抑制剂、免疫治疗，在不同亚型与线序中被列出。具体药物是否国内获批、是否在医保内，需要单独核实。',
            '局部处理：寡转移灶的放疗或手术，在特定情形下被列出。',
            '临床研究：指南把「参加登记良好的临床试验」列为一项正式选项，不是最后手段。'
          ]
        },
        {
          label: '贯穿全程的两件事',
          points: [
            '随访节奏：精要本 P208 表 9.5 与 P209 表 9.6 列出复查项目与间隔（术后 2 年内每 3 个月、3–5 年每 6 个月、5 年后每年）。本台只并排显示「指南节奏 / 你最近一次 / 参考窗口」，不发提醒、不写「该复查了」。',
            '不良反应分级：主口径是 CTCAE v5.0；中国指南口径（如 P227 的中性粒、肝损、QTc）并列在卡片背面。两套级差不取严，取严等于替医生做判断。'
          ]
        }
      ],
      points: [
        '以上是文献与指南里列出的手段，按病期与线序排列，不代表任何一项适合你。选哪一个，这一句需要问你的医生。'
      ],
      sources: [
        { org: 'CACA-CBCS / CMA-CSO-BO', doc: '乳腺癌诊治指南与规范（2025 年版 精要本）', version: '2025 精要本', original: true, page: 'P65、P79、P109、P113、P208–P209、P227', note: '本地 PDF 存档' }
      ]
    },
    {
      id: 'trend',
      title: '发展趋势',
      intro: '这一段只写已经发生的事：哪份文件换了版本、哪一页改了什么、哪一天发布。不写预测，不做评价，也不给任何倾向。',
      points: [
        '2024-06-10：《中国抗癌协会乳腺癌诊治指南与规范（2024 年版）》全文版发布（本项目收录的是转载件）。',
        '2024-12-22：同系列《2025 年版 精要本》发布，共 246 页；本项目以精要本为主引用源。',
        '2025 精要本 P35「乳腺癌的 TNM 分期」按 AJCC 第 8 版分期原文，对本页内容做了系统性修改。',
        '2025 精要本 P29「乳腺常用影像学方法的比较」新增「乳腺断层 X 线」相关内容。',
        '2025 精要本 P93、P94 为新增页：自体皮瓣乳房重建技术、植入物乳房重建分类。',
        '2025 精要本 P80 记录：NCCN 等提出「腋窝临床体检阴性、影像学 1–2 枚淋巴结异常且细针穿刺阳性者可尝试前哨淋巴结活检」，国内专家团 2024 年 10 月投票同意率低于 50%。'
      ],
      sources: [
        { org: 'CACA-CBCS / CMA-CSO-BO', doc: '乳腺癌诊治指南与规范（2025 年版 精要本）· 修订汇总', version: '2025 精要本（2024-12-22 发布）', original: true, page: 'P23–P94', note: '本地 PDF 存档' },
        { org: 'CACA-CBCS / CMA-CSO-BO', doc: '中国抗癌协会乳腺癌诊治指南与规范（2024 年版）', version: '2024 版（2024-06-10）', original: false, page: '页码待核', secondaryUrl: 'https://wap.cacakp.com/appnews/detail/id/21936', note: '协会科普平台解读页（实测 200），非官方排版' }
      ]
    }
  ]
}
