/* 本文件由 scripts/build-primer-data.mjs 从 prototypes/v0.4/primer-data.js 同步生成，不要手改。
 * 改内容请改原型那份后重跑：node scripts/build-primer-data.mjs
 */
/* 小粉宝 PinkyPal · 疾病概要数据（36 号 v2）
 * 口径：docs/DISEASE-PRIMER.md；规范：starter docs/36-DISEASE-PRIMER.md。
 * 全部内容属第 ② 层（解释）：只写定义、文件、指南列举过的手段、已发生的变化。
 * 任何「你该怎么办」的判断都不在这里，固定出口是「这一句需要问你的医生」。
 *
 * 格式说明：本文件是 window.DISEASE_PRIMER 的纯字面量（无变量、无 IIFE），
 * 因为 starter 的 scripts/check-conformance.mjs 会用正则切 trend 段扫禁止词，
 * 也会被 HTML demo 直接 JSON 化读出。所以链接一律内联成字符串，不要抽成常量。
 *
 * 链接状态（2026-10-27 逐条 curl 验证可达，9/9）：
 * - 已取得原件 → url 指向官方 PDF（中国癌症杂志官网；CSCO 那条是第三方转载，已在 note 注明）；
 * - 未取得原件 → secondaryUrl 指向官方出版信息页 / 指南详情页 / PubMed 记录；
 * - 2025 精要本是图书（复旦大学出版社 ISBN 9787309177688），公开渠道无官方电子版，
 *   标 nolink:true + note 说明「本台原件为本地 PDF」，不编假链接。
 * 复核命令：node scripts/check-primer-links.mjs
 */
window.DISEASE_PRIMER = {
  brand: "小粉宝 PinkyPal",
  name: "乳腺癌",
  en: "Breast Cancer",
  updated: "2026-10-27",
  sections: [
    {
      id: "definition",
      title: "定义",
      intro: "乳腺癌是来源于乳腺上皮组织的恶性肿瘤的统称，不是一种病。病理类型、分子分型与分期的不同组合，对应指南里不同的治疗与随访条目——所以这台工作台把「哪一型、哪一期」放在所有记录的第一层。",
      points: [
        "病理类型命名以世界卫生组织（WHO）《乳腺肿瘤分类》第 5 版为口径。本项目据 CACA-CBCS 2025 精要本转引，未取得 WHO 原件，页码待核。",
        "浸润性乳腺癌的分子分型按 ER / PR / HER2 / Ki-67 划分（精要本 P36、P40）。2025 版在 P40 增加了标注：Luminal-B HER2 阴性时，「PgR 低表达」与「Ki67 高表达」符合一项即可判定。",
        "分期用 AJCC 第 8 版 TNM：解剖学分期与预后分期是同一版里的两条口径，精要本 P35 在 2025 版按 AJCC 第 8 版原文做了系统性修改。",
        "本台只把病理报告与分期报告的原文抄进档案，不把分型或分期换算成「严重程度」，也不替报告补字。"
      ],
      sources: [
        {
          org: "CACA-CBCS / CMA-CSO-BO",
          doc: "中国抗癌协会与中华医学会肿瘤学分会乳腺癌诊治指南与规范（2025 年版 精要本）",
          version: "2025 精要本（2024-12-22 发布）",
          original: true,
          nolink: true,
          page: "P35–P36、P40",
          note: "图书（复旦大学出版社，ISBN 9787309177688）；本台原件为本地 PDF 抽取件，公开渠道无官方电子版"
        },
        {
          org: "WHO",
          doc: "Classification of Tumours: Breast Tumours, 5th ed.",
          version: "第 5 版（2019）",
          original: false,
          secondaryUrl: "https://publications.iarc.who.int/Book-And-Report-Series/Who-Classification-Of-Tumours/Breast-Tumours-2019",
          page: "页码待核",
          note: "IARC 出版页，正文需订阅"
        },
        {
          org: "AJCC",
          doc: "Cancer Staging Manual, 8th ed.（乳腺章节）",
          version: "2017",
          original: false,
          secondaryUrl: "https://pubmed.ncbi.nlm.nih.gov/28294283/",
          page: "页码待核（据精要本 P35 转引）"
        }
      ]
    },
    {
      id: "evidence",
      title: "医学资料规范和指南情况",
      intro: "这台工作台里出现的每一条「该查什么、怎么分级、多久复查」，都应能追到下面某一份文件。拿到了原件的照实标「已取得」；只拿到转载件或二手引用的，写「未取得原件」。「原件」列每一行都给可点链接：拿不到公开电子版的（NCCN 全文、WHO 蓝皮书），链接指向官方出版信息页，文字里明写「未取得原件」。",
      table: {
        head: [
          "机构",
          "文件",
          "版本 / 年份",
          "原件",
          "本台的用途"
        ],
        rows: [
          [
            "CACA-CBCS / CMA-CSO-BO",
            "中国抗癌协会与中华医学会肿瘤学分会乳腺癌诊治指南与规范",
            "2025 年版 精要本（2024-12-22 发布，246 页）",
            {
              text: "已取得（本地 PDF 抽取）· 书目页",
              url: "https://book.cppinfo.cn/Encyclopedias/home/Index/4807429"
            },
            "主引用源：随访节奏（P208 表 9.5 / P209 表 9.6）、分级口径、分型与病理判读"
          ],
          [
            "CACA-CBCS / CMA-CSO-BO",
            "中国抗癌协会乳腺癌诊治指南与规范（2026 年版）",
            "中国癌症杂志 2025 年第 35 卷第 12 期，P1157–P1255",
            {
              text: "官方 PDF 可点 · 本台未核对页码",
              url: "https://www.china-oncology.com/rc-pub/front/front-article/download/145257590/lowqualitypdf/%E4%B8%AD%E5%9B%BD%E6%8A%97%E7%99%8C%E5%8D%8F%E4%BC%9A%E4%B9%B3%E8%85%BA%E7%99%8C%E8%AF%8A%E6%B2%BB%E6%8C%87%E5%8D%97%E4%B8%8E%E8%A7%84%E8%8C%83%EF%BC%882026%E5%B9%B4%E7%89%88%EF%BC%89.pdf"
            },
            "对照源：2025 精要本之后的新版全文；本台尚未按这一版改页码引用"
          ],
          [
            "CACA-CBCS / CMA-CSO-BO",
            "中国抗癌协会乳腺癌诊治指南与规范（2024 年版 全文）",
            "2024 年版（2024-06-10 发布）",
            {
              text: "已取得 · 期刊官网 PDF",
              url: "https://www.china-oncology.com/rc-pub/front/front-article/download/141011677/lowqualitypdf/%E4%B8%AD%E5%9B%BD%E6%8A%97%E7%99%8C%E5%8D%8F%E4%BC%9A%E4%B9%B3%E8%85%BA%E7%99%8C%E8%AF%8A%E6%B2%BB%E6%8C%87%E5%8D%97%E4%B8%8E%E8%A7%84%E8%8C%83%EF%BC%882024%E5%B9%B4%E7%89%88%EF%BC%89.pdf"
            },
            "补充源：查 2025 精要本压缩掉的完整章节"
          ],
          [
            "CSCO",
            "CSCO 乳腺癌诊疗指南",
            "2023 版（58 页扫描 PDF）",
            {
              text: "已取得（本地扫描件）· 转载 PDF",
              url: "https://www.healthcare-bio.com/upload/20231226/aa65e60b5180f43e34784c93dfbb2cf9.pdf"
            },
            "对照源：看中国 I/II/III 级分层推荐的写法，不作阈值来源；链接为第三方转载，非官方发布页"
          ],
          [
            "NCCN",
            "NCCN Guidelines · Breast Cancer",
            "V7.2026（nccn.org 指南页 2026-10-27 显示）",
            {
              text: "未取得原件（需机构订阅）· 官方指南页",
              url: "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1419"
            },
            "仅在 2025 精要本 P80 被引述；本台不单独引用其条文。该页版本随更新滚动，引用以页面当日显示为准"
          ],
          [
            "AJCC",
            "Cancer Staging Manual, 8th ed.（乳腺章节）",
            "2017",
            {
              text: "未取得原件（据精要本 P35 转引）· 二次来源",
              url: "https://pubmed.ncbi.nlm.nih.gov/28294283/"
            },
            "TNM 解剖学分期与预后分期的口径"
          ],
          [
            "WHO",
            "Classification of Tumours: Breast Tumours, 5th ed.",
            "第 5 版（2019）",
            {
              text: "未取得原件 · IARC 出版页",
              url: "https://publications.iarc.who.int/Book-And-Report-Series/Who-Classification-Of-Tumours/Breast-Tumours-2019"
            },
            "组织学类型命名的唯一口径"
          ]
        ]
      },
      points: [
        "同一份指南隔一年，条目会变；所以本台引用一律带「机构 + 版本 + 页码」，不写「指南认为」。",
        "未取得原件的文件只记「存在」与「大致讲什么」，不引用其具体条文，页码写「页码待核」。",
        "CSCO 的分层推荐（I/II/III 级）在本台不做成产品菜单——分层是给医生的写法，不是给患者的选择题。",
        "2026 年版全文已在期刊官网公开，但本台尚未逐页核对，所以仍以 2025 年版精要本作为页码来源；两版并列在表里，不合并成一个「最新版」。"
      ],
      sources: [
        {
          org: "CACA-CBCS / CMA-CSO-BO",
          doc: "乳腺癌诊治指南与规范（2025 年版 精要本）",
          version: "2025 精要本",
          original: true,
          nolink: true,
          page: "P208–P209、P227",
          note: "图书（复旦大学出版社，ISBN 9787309177688）；本台原件为本地 PDF 抽取件，公开渠道无官方电子版"
        },
        {
          org: "CACA-CBCS / CMA-CSO-BO",
          doc: "乳腺癌诊治指南与规范（2026 年版）",
          version: "中国癌症杂志 2025;35(12):1157-1255",
          original: true,
          url: "https://www.china-oncology.com/zh/article/doi/10.19401/j.cnki.1007-3639.2025.12.009/",
          page: "页码待核（本台未核对）"
        },
        {
          org: "CSCO",
          doc: "CSCO 乳腺癌诊疗指南",
          version: "2023 版",
          original: true,
          url: "https://www.healthcare-bio.com/upload/20231226/aa65e60b5180f43e34784c93dfbb2cf9.pdf",
          page: "页码待核（扫描件未抽文本）",
          note: "第三方转载 PDF"
        },
        {
          org: "NCCN",
          doc: "NCCN Guidelines · Breast Cancer",
          version: "V7.2026",
          original: false,
          secondaryUrl: "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1419",
          page: "页码待核"
        }
      ]
    },
    {
      id: "landscape",
      title: "目前治疗全景概要",
      intro: "下面按期别与线序列出指南里出现过的手段类别。这是「世界上大致有哪些办法」的地图，不是给你排的先后顺序，也不含剂量、疗程与适用条件——那些必须由医生按你的病理与影像决定。",
      groups: [
        {
          label: "早期可手术（局限期）",
          points: [
            "手术：乳腺处理（保乳或全乳切除）与区域淋巴结处理（前哨淋巴结活检、腋窝清扫）在指南里分别成章。2025 版在 P65 增加了「保守性全乳切除」的写法，在 P79 增加了豁免前哨淋巴结活检的三条情形。术式取舍属医生判断。",
            "放疗：保乳术后放疗、术后胸壁放疗在指南结构中被列出；本台只记「做过没有、什么时候、几次」。",
            "新辅助与辅助系统治疗：按分子分型分层列出化疗、内分泌治疗、抗 HER2 治疗。新辅助方案与适用人群写在精要本 P109、P113。"
          ]
        },
        {
          label: "局部晚期 / 转移后",
          points: [
            "系统治疗按分子分型与线序分组：内分泌治疗、化疗、抗 HER2 靶向、CDK4/6 抑制剂、PARP 抑制剂、免疫治疗，在不同亚型与线序中被列出。具体药物是否国内获批、是否在医保内，需要单独核实。",
            "局部处理：寡转移灶的放疗或手术，在特定情形下被列出。",
            "临床研究：指南把「参加登记良好的临床试验」列为一项正式选项，不是最后手段。"
          ]
        },
        {
          label: "贯穿全程的两件事",
          points: [
            "随访节奏：精要本 P208 表 9.5 与 P209 表 9.6 列出复查项目与间隔（术后 2 年内每 3 个月、3–5 年每 6 个月、5 年后每年）。本台只并排显示「指南节奏 / 你最近一次 / 参考窗口」，不发提醒、不写「该复查了」。",
            "不良反应分级：主口径是 CTCAE v5.0；中国指南口径（如 P227 的中性粒、肝损、QTc）并列在卡片背面。两套级差不取严，取严等于替医生做判断。"
          ]
        }
      ],
      points: [
        "以上是文献与指南里列出的手段，按病期与线序排列，不代表任何一项适合你。选哪一个，这一句需要问你的医生。"
      ],
      sources: [
        {
          org: "CACA-CBCS / CMA-CSO-BO",
          doc: "乳腺癌诊治指南与规范（2025 年版 精要本）",
          version: "2025 精要本",
          original: true,
          nolink: true,
          page: "P65、P79、P109、P113、P208–P209、P227",
          note: "图书（复旦大学出版社，ISBN 9787309177688）；本台原件为本地 PDF 抽取件，公开渠道无官方电子版"
        }
      ]
    },
    {
      id: "trend",
      title: "发展趋势",
      intro: "这一段只写已经发生的事：哪份文件换了版本、哪一页改了什么、哪一天发布。不写预测，不做评价，也不给任何倾向。",
      points: [
        "2024-06-10：《中国抗癌协会乳腺癌诊治指南与规范（2024 年版）》全文版发布（本项目收录的是公众号转载件）。",
        "2024-12-22：同系列《2025 年版 精要本》发布，共 246 页；本项目以精要本为主引用源。",
        "2025 精要本 P35「乳腺癌的 TNM 分期」按 AJCC 第 8 版分期原文，对本页内容做了系统性修改。",
        "2025 精要本 P29「乳腺常用影像学方法的比较」新增「乳腺断层 X 线」相关内容。",
        "2025 精要本 P93、P94 为新增页：自体皮瓣乳房重建技术、植入物乳房重建分类。",
        "2025 精要本 P80 记录：NCCN 等提出「腋窝临床体检阴性、影像学 1–2 枚淋巴结异常且细针穿刺阳性者可尝试前哨淋巴结活检」，国内专家团 2024 年 10 月投票同意率低于 50%。",
        "《中国癌症杂志》第 35 卷第 12 期（P1157–P1255）刊出《中国抗癌协会乳腺癌诊治指南与规范（2026 年版）》，期刊官网提供 PDF。本台当前仍以 2025 年版精要本作为页码来源，尚未按 2026 年版逐页核对。"
      ],
      sources: [
        {
          org: "CACA-CBCS / CMA-CSO-BO",
          doc: "乳腺癌诊治指南与规范（2025 年版 精要本）· 修订汇总",
          version: "2025 精要本（2024-12-22 发布）",
          original: true,
          nolink: true,
          page: "P23–P94",
          note: "图书（复旦大学出版社，ISBN 9787309177688）；本台原件为本地 PDF 抽取件，公开渠道无官方电子版"
        },
        {
          org: "CACA-CBCS / CMA-CSO-BO",
          doc: "中国抗癌协会乳腺癌诊治指南与规范（2024 年版）",
          version: "2024 版（2024-06-10）",
          original: true,
          url: "https://www.china-oncology.com/zh/article/doi/10.19401/j.cnki.1007-3639.2023.12.004/",
          page: "页码待核"
        },
        {
          org: "CACA-CBCS / CMA-CSO-BO",
          doc: "中国抗癌协会乳腺癌诊治指南与规范（2026 年版）",
          version: "中国癌症杂志 2025;35(12):1157-1255",
          original: true,
          url: "https://www.china-oncology.com/zh/article/doi/10.19401/j.cnki.1007-3639.2025.12.009/",
          page: "页码待核"
        }
      ]
    }
  ]
}
