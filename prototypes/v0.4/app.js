'use strict';
/* 小粉宝 v0.4.0 — 交互原型（v0.3.0 冻结基准之上补 36 号 v2：看板状态卡 + 指南可点）。所有数据为模拟；不读写真实文件、不调用模型或宿主 API。 */

/* 版本号的唯一来源是仓库根目录的 VERSION 文件；这里必须与它逐字一致。
   改动任一处都要同时改另一处，并用 `node scripts/check-version.mjs` 校验。
   接入 DSH 后改为从 package.json / dsh 清单读取，不再手写常量。 */
const APP_INFO = {
  version: '0.4.0',
  build: '2026-10-27',
  channel: 'prototype',
  channelLabel: '交互原型 · 未接入 DSH'
};

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let uidSeq = 0;
const uid = (p) => p + (++uidSeq);

/* ---------------- icons & nav ---------------- */
const icons = {
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  folder: 'M3 7h7l2 2h9v12H3ZM3 7V4h7l2 3',
  chart: 'M4 3v17h17M7 14l4-5 4 3 5-7',
  clinical: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z',
  food: 'M7 3v8m-3-8v5a3 3 0 0 0 6 0V3M7 11v10M19 3c-4 3-4 9 0 10V3Zm0 10v8',
  heart: 'M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 8 15 8 15s13-10 8-15Z',
  calendar: 'M4 5h16v16H4ZM8 3v4m8-4v4M4 10h16m-12 4h2m4 0h2m-8 3h2',
  bookmark: 'M6 3h12v19l-6-4-6 4Z'
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[k]}"/></svg>`;

const PAGES = [
  ['dashboard', '看板', 'home'], ['records', '病情整理', 'folder'], ['timeline', '病情一图秀', 'chart'],
  ['clinical', '临床', 'clinical'], ['nutrition', '营养支持', 'food'], ['mind', '心理支持', 'heart'],
  ['care', '全程与康复', 'calendar'], ['review', '收藏与回顾', 'bookmark']
];
const SUBPAGES = {
  records: ['资料库', '整理草稿 / 核对', '病情档案', '指标检测', '病情汇总'],
  clinical: ['治疗历程', '病理 / 分子档案', '试验线索', '资料对照', '我的关注', '数据来源'],
  nutrition: ['当下困扰', '进食与体重', '建议与回顾'],
  mind: ['当下感受', '我的记录', '支持资源', '身体与亲密'],
  care: ['近期安排', '术后恢复', '上肢与淋巴水肿', '不适记录', '就诊准备', '长期生活'],
  review: ['问题清单', '已保留结果', '报告与任务']
};
const SUBTITLES = {
  dashboard: '把眼前的事情理清楚，让每次记录都能继续帮到你。',
  records: '原始材料有出处，整理结果可核对，一次记录多处复用。',
  timeline: '治疗、检查、症状与上肢变化，放回同一段时间里。',
  clinical: '看懂自己的治疗资料，也为下一次讨论做好准备。',
  nutrition: '从今天吃得怎么样开始，少量记录也有意义。',
  mind: '这里可以放下感受，不需要整理好情绪再开始。',
  care: '治疗之外，也照顾手臂、体力与日常的节奏。',
  review: '重要的问题和结果，在需要的时候找得到。'
};

/* ---------------- simulation data ---------------- */
const CATS = [
  ['肿瘤标志物', '#c2416b'], ['血常规', '#b4700f'], ['生化', '#a85a3c'],
  ['心功能与骨健康', '#7c6aae'], ['营养与体重', '#2f7d6b'], ['康复测量', '#a8410a']
];
const METRICS = {
  ca153: { name: 'CA15-3', unit: 'U/mL', cat: '肿瘤标志物', color: '#c2416b', dec: 1, note: '同一实验室方法可比', points: [
    { d: '2026-01-12', v: 18.4, src: '术前检验报告' }, { d: '2026-04-14', v: 12.1, src: '化疗第 4 周期前检验' },
    { d: '2026-07-20', v: 14.6, src: '放疗结束复查' }, { d: '2026-10-09', v: 16.2, src: '随访复查检验' }] },
  cea: { name: 'CEA', unit: 'ng/mL', cat: '肿瘤标志物', color: '#d9839b', dec: 1, note: '同一实验室方法可比', points: [
    { d: '2026-01-12', v: 2.1, src: '术前检验报告' }, { d: '2026-04-14', v: 1.8, src: '化疗第 4 周期前检验' },
    { d: '2026-07-20', v: 2.0, src: '放疗结束复查' }, { d: '2026-10-09', v: 2.3, src: '随访复查检验' }] },
  wbc: { name: '白细胞', unit: '10⁹/L', cat: '血常规', color: '#3f6f7e', dec: 1, note: '不同医院参考区间不合并', points: [
    { d: '2026-01-12', v: 5.8, src: '术前检验报告' }, { d: '2026-03-03', v: 2.9, src: '化疗第 2 周期后' },
    { d: '2026-04-14', v: 4.1, src: '化疗第 4 周期前' }, { d: '2026-07-20', v: 5.2, src: '放疗结束复查' },
    { d: '2026-10-09', v: 6.0, src: '随访复查检验' }] },
  anc: { name: '中性粒细胞绝对值', unit: '10⁹/L', cat: '血常规', color: '#5b8a97', dec: 1, note: '不与其他指标互算', points: [
    { d: '2026-01-12', v: 3.4, src: '术前检验报告' }, { d: '2026-03-03', v: 1.2, src: '化疗第 2 周期后' },
    { d: '2026-04-14', v: 2.1, src: '化疗第 4 周期前' }, { d: '2026-07-20', v: 3.0, src: '放疗结束复查' },
    { d: '2026-10-09', v: 3.6, src: '随访复查检验' }] },
  hgb: { name: '血红蛋白', unit: 'g/L', cat: '血常规', color: '#8d5b4c', dec: 0, note: '输注后需标注', points: [
    { d: '2026-01-12', v: 128, src: '术前检验报告' }, { d: '2026-03-03', v: 106, src: '化疗第 2 周期后' },
    { d: '2026-04-14', v: 114, src: '化疗第 4 周期前' }, { d: '2026-07-20', v: 121, src: '放疗结束复查' },
    { d: '2026-10-09', v: 126, src: '随访复查检验' }] },
  plt: { name: '血小板', unit: '10⁹/L', cat: '血常规', color: '#b07a5e', dec: 0, note: '不同方法不合并', points: [
    { d: '2026-01-12', v: 236, src: '术前检验报告' }, { d: '2026-03-03', v: 148, src: '化疗第 2 周期后' },
    { d: '2026-04-14', v: 188, src: '化疗第 4 周期前' }, { d: '2026-07-20', v: 210, src: '放疗结束复查' },
    { d: '2026-10-09', v: 224, src: '随访复查检验' }] },
  alt: { name: 'ALT', unit: 'U/L', cat: '生化', color: '#a85a3c', dec: 0, note: '化疗期肝损回顾', points: [
    { d: '2026-01-12', v: 22, src: '术前检验报告' }, { d: '2026-03-03', v: 48, src: '化疗第 2 周期后' },
    { d: '2026-05-05', v: 61, src: '化疗第 5 周期前' }, { d: '2026-07-20', v: 31, src: '放疗结束复查' },
    { d: '2026-10-09', v: 24, src: '随访复查检验' }] },
  cr: { name: '肌酐', unit: 'μmol/L', cat: '生化', color: '#c07a5c', dec: 0, note: '不与 eGFR 混算', points: [
    { d: '2026-01-12', v: 62, src: '术前检验报告' }, { d: '2026-03-03', v: 68, src: '化疗第 2 周期后' },
    { d: '2026-05-05', v: 71, src: '化疗第 5 周期前' }, { d: '2026-07-20', v: 64, src: '放疗结束复查' },
    { d: '2026-10-09', v: 63, src: '随访复查检验' }] },
  lvef: { name: 'LVEF', unit: '%', cat: '心功能与骨健康', color: '#7c6aae', dec: 0, note: '需记录测量方法', points: [
    { d: '2026-01-08', v: 64, src: '术前心脏超声' }, { d: '2026-05-20', v: 60, src: '化疗结束时心脏超声' },
    { d: '2026-10-09', v: 62, src: '随访心脏超声' }] },
  bmd: { name: '腰椎骨密度 T 值', unit: '', cat: '心功能与骨健康', color: '#9a86c4', dec: 1, note: '仅 DXA，不与超声合并', points: [
    { d: '2026-06-05', v: -1.4, src: '内分泌治疗前 DXA' }, { d: '2026-10-09', v: -1.6, src: '随访 DXA' }] },
  weight: { name: '体重', unit: 'kg', cat: '营养与体重', color: '#2f7d6b', dec: 1, note: '单点不连线', points: [
    { d: '2026-01-12', v: 61.2, src: '术前记录' }, { d: '2026-03-24', v: 58.6, src: '化疗期间记录' },
    { d: '2026-05-26', v: 57.2, src: '化疗结束时记录' }, { d: '2026-08-15', v: 58.4, src: '本人记录' },
    { d: '2026-10-09', v: 59.1, src: '随访记录' }] },
  bmi: { name: 'BMI', unit: 'kg/m²', cat: '营养与体重', color: '#4c9483', dec: 1, note: '按身高 1.62m 计算', points: [
    { d: '2026-01-12', v: 23.4, src: '计算值' }, { d: '2026-03-24', v: 22.4, src: '计算值' },
    { d: '2026-05-26', v: 21.9, src: '计算值' }, { d: '2026-08-15', v: 22.3, src: '计算值' },
    { d: '2026-10-09', v: 22.6, src: '计算值' }] },
  arm: { name: '患健侧臂围差', unit: 'cm', cat: '康复测量', color: '#a8410a', dec: 1, note: '四点位最大值；同协议可比', points: [] },
  shoulder: { name: '患侧上肢前屈', unit: '°', cat: '康复测量', color: '#c26e35', dec: 0, note: '肩关节主动前屈；需注明测量者', points: [
    { d: '2026-07-28', v: 95, src: '康复科门诊' }, { d: '2026-08-25', v: 120, src: '康复科门诊' },
    { d: '2026-09-22', v: 140, src: '本人自测（家属协助）' }, { d: '2026-10-14', v: 152, src: '本人自测（家属协助）' }] },
  grip: { name: '患侧握力', unit: 'kg', cat: '康复测量', color: '#b5652f', dec: 0, note: '同一握力计可比', points: [
    { d: '2026-07-28', v: 18, src: '康复科门诊' }, { d: '2026-08-25', v: 21, src: '康复科门诊' },
    { d: '2026-09-22', v: 23, src: '本人自测' }, { d: '2026-10-14', v: 24, src: '本人自测' }] }
};
const ARM_PROTOCOL = { id: 'p1', label: '坐位·双臂自然下垂·四点位', points: ['wrist', 'fore', 'elbow', 'ax'] };
const ARM_POINT_LABEL = { wrist: '腕横纹', fore: '前臂中段', elbow: '肘上 10cm', ax: '腋下 10cm' };
const ARM = [
  { id: 'a1', d: '2026-07-28', pos: ARM_PROTOCOL.label, by: '本人 + 家属', pts: { wrist: [16.4, 16.2], fore: [24.8, 24.6], elbow: [30.6, 30.3], ax: [38.2, 37.9] } },
  { id: 'a2', d: '2026-08-25', pos: ARM_PROTOCOL.label, by: '本人 + 家属', pts: { wrist: [16.6, 16.1], fore: [25.2, 24.7], elbow: [31.0, 30.5], ax: [38.7, 38.2] } },
  { id: 'a3', d: '2026-09-22', pos: ARM_PROTOCOL.label, by: '本人 + 家属', pts: { wrist: [16.9, 16.2], fore: [25.8, 24.9], elbow: [31.5, 30.4], ax: [39.2, 38.3] } },
  { id: 'a4', d: '2026-10-14', pos: ARM_PROTOCOL.label, by: '本人 + 家属', pts: { wrist: [17.2, 16.3], fore: [26.4, 24.9], elbow: [32.0, 30.3], ax: [39.9, 38.1] } }
];
const armDiff = (a, p) => Math.round((a.pts[p][0] - a.pts[p][1]) * 10) / 10;
const armMax = (a) => Math.max(...Object.keys(a.pts).map((p) => armDiff(a, p)));
const syncArm = () => { METRICS.arm.points = ARM.map((a) => ({ d: a.d, v: armMax(a), src: '上肢测量记录 · 四点位' })); };
syncArm();

const TREATMENTS = [
  { id: 't1', kind: 'surgery', label: '手术 01.20', long: '左乳改良根治 + 腋窝淋巴结清扫', from: '2026-01-20', to: '2026-01-20', color: '#c2416b', actual: true },
  { id: 't2', kind: 'chemo', label: '化疗 02.10–07.07', long: 'EC × 4 → 紫杉醇 × 4', from: '2026-02-10', to: '2026-07-07', color: '#d98324', actual: true },
  { id: 't3', kind: 'radio', label: '放疗 06.15–07.24', long: '胸壁 + 锁骨上，25 次', from: '2026-06-15', to: '2026-07-24', color: '#7c6aae', actual: true },
  { id: 't4', kind: 'endo', label: '内分泌治疗 06.20 起', long: '来曲唑，计划 5 年', from: '2026-06-20', to: '2026-10-17', color: '#2f7d6b', actual: true }
];
const DATA_END = '2026-10-17';

/* 五套演示画像：切换只改元数据与空态，指标序列仍为 DEMO-1（在界面上明写，不假装五套全量数据） */
const PROFILES = [
  /* anchor = 状态卡的计算锚点（第 0 天）。一律来自档案里已有的日期，不手填天数：
     p1 的锚点 2026-01-21 由引流记录推出（01-22 起 45→30→15→0 ml，术后第 1 天起记量），
     与病理报告 01-23、出院小结 01-25 一致。未手术（p2）没有锚点，状态卡显示「待初始化」。 */
  { id: 'p1', name: '林女士', side: '左', surgery: '改良根治 + 腋窝清扫', stage: '内分泌治疗', full: true, tag: 'DEMO-1 全程完整', root: '/Users/lin/Documents/PinkyPal', anchor: '2026-01-21', anchorLabel: '手术日', stageState: '进行中 · 2026-06 起' },
  { id: 'p2', name: '周女士', side: '右', surgery: '未手术', stage: '刚确诊', full: false, tag: 'DEMO-2 资料极少', root: '', anchor: null, anchorLabel: '', stageState: '尚未开始治疗' },
  { id: 'p3', name: '陈女士', side: '右', surgery: '保乳 + 前哨淋巴结', stage: '放疗期间', full: false, tag: 'DEMO-3 保乳 + SLNB', root: '/Users/chen/BreastCare', anchor: '2026-04-08', anchorLabel: '手术日', stageState: '进行中 · 2026-08 起' },
  { id: 'p4', name: '吴女士', side: '双侧', surgery: '两次手术', stage: '复发后治疗', full: false, tag: 'DEMO-4 双侧 + 复发', root: '/Users/wu/BreastCare', anchor: '2025-09-17', anchorLabel: '最近一次手术日', stageState: '进行中' },
  { id: 'p5', name: '赵女士', side: '左', surgery: '改良根治', stage: '随访', full: false, tag: 'DEMO-5 数据冲突', root: '/Users/zhao/BreastCare', anchor: '2025-11-04', anchorLabel: '手术日', stageState: '随访中' }
];

const state = {
  page: 'dashboard', sub: {}, stage: '内分泌治疗', profileId: 'p1',
  /* session=null 表示「对话未进入激活」；有对象表示已在本工作台创建/恢复会话 */
  session: null,
  cfg: {
    root: '/Users/lin/Documents/PinkyPal',
    size: { doc: 12.4, derived: 3.1, db: 1.8 },
    backupAt: '2026-10-16 21:40',
    consent: true,
    showToken: false,
    tokenMasked: 'sk-····pJqM',
    tokenSrc: '内置公益 Token',
    dbStatus: '未接入',
    dbChecked: '—'
  },
  range: 'all', zoom: 100, sel: ['ca153', 'wbc', 'arm'],
  toggles: { treatment: true, keypoints: true, changes: false },
  pin: null, flipped: new Set(), query: '', parsing: false, parseError: false, loaded: false,
  armStage: '术后 3 个月以上',
  docs: [
    { id: 'd1', name: '病理报告 · 左乳', date: '2026-01-23', type: '病理', status: '已核对' },
    { id: 'd2', name: '出院小结 · 术后', date: '2026-01-25', type: '住院', status: '已核对' },
    { id: 'd3', name: '化疗记录 · 8 周期', date: '2026-07-07', type: '治疗', status: '已核对' },
    { id: 'd4', name: '放疗小结', date: '2026-07-24', type: '治疗', status: '待核对' },
    { id: 'd5', name: '血常规 · 随访', date: '2026-10-09', type: '检验', status: '已核对' }
  ],
  candidates: [
    { id: 'c1', name: '放疗结束日期', value: '2026-07-24', source: '放疗小结 · 第 1 页', status: 'candidate' },
    { id: 'c2', name: '放疗部位', value: '胸壁 + 锁骨上', source: '放疗小结 · 第 1 页', status: 'candidate' },
    { id: 'c3', name: '腋窝处理方式', value: '原文未写明清扫范围', source: '手术记录 · 第 2 页', status: 'needs_review' }
  ],
  questions: [
    { id: 'q1', text: '左上肢臂围差从 0.3cm 增加到 1.8cm，需要做哪些评估？', source: '上肢测量衍生 · 本人保留', selected: true, kind: 'fact' },
    { id: 'q2', text: '来曲唑期间手指关节晨僵，是否需要调整或加做检查？', source: '本人记录 · 内分泌治疗', selected: true, kind: 'fact' },
    { id: 'q3', text: '下次复查需要带哪些报告？放疗小结还没核对完。', source: '本人保留', selected: false, kind: 'fact' },
    { id: 'q4', text: '我总觉得手臂比上个月沉，是不是变得更严重了？', source: '本人看法 · 2026-10-14', selected: true, kind: 'view' }
  ],
  viewpoints: [
    { id: 'v1', d: '2026-10-14', text: '我总觉得这条手臂比上个月沉，晚上更明显。', role: 'patient' }
  ],
  tasks: [
    { id: 'k1', date: '2026-10-20', title: '把上肢测量记录带去康复科', note: '本人安排 · 已预约', done: false },
    { id: 'k2', date: '2026-10-24', title: '核对放疗小结', note: '资料整理 · 1 项待确认', done: false },
    { id: 'k3', date: '2026-11-05', title: '复查（乳腺外科）', note: '医院安排 · 时间以短信为准', done: false }
  ],
  drains: [
    { d: '2026-01-22', v: 45, note: '淡血性' }, { d: '2026-01-23', v: 30, note: '淡血性' },
    { d: '2026-01-24', v: 15, note: '淡黄色' }, { d: '2026-01-25', v: 0, note: '拔管' }
  ],
  symptoms: [
    { id: 's1', d: '2026-10-14', code: 'le_symptom', label: '上肢沉重 / 紧绷', level: 2, note: '下午和晚上更明显，抬高手臂会轻一些' },
    { id: 's2', d: '2026-09-20', code: 'le_symptom', label: '上肢沉重 / 紧绷', level: 1, note: '袖口略紧' },
    { id: 's3', d: '2026-10-14', code: 'ai_joint', label: '关节痛 / 僵硬', level: 2, note: '晨起手指僵硬约 20 分钟' }
  ],
  nutrition: [], moods: [], saved: [], favorite: false, toastTimer: null
};

/* ---------------- generic UI ---------------- */
const btn = (text, action, cls = '', attr = '') => `<button class="${cls}" data-action="${action}" ${attr}>${text}</button>`;
const go = (text, page, sub = '', cls = '') => btn(text, 'go', cls, `data-page="${page}" data-sub="${esc(sub)}"`);
const pill = (text, cls = '') => `<span class="pill ${cls}">${esc(text)}</span>`;
const shortDate = (d) => String(d).slice(5).replace('-', '.');
const longDate = (d) => String(d).replace(/-/g, '.');
const fmtNum = (v, dec) => (dec === 0 ? String(Math.round(v)) : Number(v).toFixed(dec ?? 1));

function toast(t) {
  clearTimeout(state.toastTimer);
  const el = $('#toast'); el.textContent = t; el.classList.add('visible');
  state.toastTimer = setTimeout(() => el.classList.remove('visible'), 3600);
}
function openModal(title, body, foot = '', eyebrow = '小粉宝 · 交互演示') {
  $('#dialog-title').textContent = title;
  $('#dialog-eyebrow').textContent = eyebrow;
  $('#dialog-body').innerHTML = body;
  $('#dialog-foot').innerHTML = foot;
  if (!$('#dialog').open) $('#dialog').showModal();
  document.body.style.overflow = 'hidden';
}
const closeModal = () => $('#dialog').close();
$('#dialog').addEventListener('close', () => { document.body.style.overflow = ''; });

function navigate(page, sub) {
  state.page = page;
  if (sub) state.sub[page] = sub;
  state.query = '';
  try { history.replaceState(null, '', '#' + page + (sub ? '/' + encodeURIComponent(sub) : '')); } catch (e) { /* file:// 下忽略 */ }
  render();
  $('#main').focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}
const section = (title, desc = '', action = '') => `<div class="section-title"><div><h2>${title}</h2>${desc ? `<p>${desc}</p>` : ''}</div>${action}</div>`;
const head = (title, desc, action = '') => `<div class="page-head"><div><span class="eyebrow">PINKYPAL / YOUR CARE COMPANION</span><h1>${title}</h1><p>${desc}</p></div><div class="actions">${action}</div></div>`;
const subnav = () => {
  const items = SUBPAGES[state.page]; if (!items) return '';
  const sel = state.sub[state.page] || items[0];
  return `<nav class="subnav" role="tablist" aria-label="${PAGES.find((p) => p[0] === state.page)[1]}二级页面">${items.map((s) => `<button role="tab" aria-selected="${sel === s}" data-action="sub" data-sub="${esc(s)}">${s}</button>`).join('')}</nav>`;
};

/* ---------------- charts ---------------- */
const CW = 980, CH = 400, CX0 = 62, CX1 = 954, CY0 = 100, CY1 = 352;

function domain() {
  const end = Date.parse(DATA_END);
  const months = { '3m': 3, '6m': 6, '12m': 12 }[state.range];
  const start = months ? new Date(new Date(end).setMonth(new Date(end).getMonth() - months)) : new Date('2026-01-01');
  const span = end - start.getTime();
  const kept = span * state.zoom / 100;
  return [end - kept, end];
}
const inDomain = (d, t0, t1) => { const t = Date.parse(d); return t >= t0 && t <= t1; };
const xOf = (t, t0, t1) => CX0 + (t - t0) / Math.max(1, t1 - t0) * (CX1 - CX0);

function smoothPath(coords) {
  if (!coords.length) return '';
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
  return coords.reduce((d, p, i) => {
    if (!i) return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    const prev = coords[i - 1], before = coords[i - 2] || prev, after = coords[i + 1] || p;
    const c1x = prev.x + (p.x - before.x) / 6, c1y = prev.y + (p.y - before.y) / 6;
    const c2x = p.x - (after.x - prev.x) / 6, c2y = p.y - (after.y - prev.y) / 6;
    return `${d} C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }, '');
}

function treatmentBands(t0, t1) {
  const items = TREATMENTS.filter((tr) => Date.parse(tr.to) >= t0 && Date.parse(tr.from) <= t1)
    .sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
  return items.map((tr, lane) => {
    const s = Math.max(Date.parse(tr.from), t0), e = Math.min(Date.parse(tr.to), t1);
    return { ...tr, x1: xOf(s, t0, t1), x2: xOf(e, t0, t1), lane };
  });
}

function monthTicks(t0, t1) {
  const out = []; const d = new Date(t0); let cur = new Date(d.getFullYear(), d.getMonth(), 1);
  if (cur.getTime() < t0) cur.setMonth(cur.getMonth() + 1);
  while (cur.getTime() <= t1) {
    const x = xOf(cur.getTime(), t0, t1);
    if (x > CX0 + 6 && x < CX1 - 6) out.push({ x, label: `${cur.getMonth() + 1}月` });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  if (out.length > 7) return out.filter((_, i) => i % 2 === 0);
  return out;
}

function seriesFor(code, t0, t1) {
  const m = METRICS[code];
  const all = m.points.map((p) => p.v);
  const lo = Math.min(...all), hi = Math.max(...all);
  const span = hi - lo || Math.max(Math.abs(hi) * 0.08, 1);
  const pts = m.points.filter((p) => inDomain(p.d, t0, t1));
  return { code, m, lo, hi, span, pts };
}

function chartSVG(t0, t1) {
  const bands = state.toggles.treatment ? treatmentBands(t0, t1) : [];
  const series = state.sel.map((c) => seriesFor(c, t0, t1)).filter((s) => s.pts.length);
  if (!series.length) {
    return `<div class="empty"><h3>这个时间窗里没有所选指标</h3><p>扩大时间范围，或在左侧加选一个指标。</p></div>`;
  }
  const yOf = (s, v) => CY1 - (v - s.lo) / s.span * (CY1 - CY0);
  const grid = [0, 1, 2, 3, 4].map((i) => { const y = CY0 + i * (CY1 - CY0) / 4; return `<line class="grid" x1="${CX0}" x2="${CX1}" y1="${y}" y2="${y}"/>`; }).join('');

  // 治疗条：独立于数据区，避免标签压住曲线
  const strip = bands.map((b) => {
    const row = b.kind === 'surgery' ? 16 : 44 + (b.lane - 1) * 15;
    if (b.kind === 'surgery') {
      const x = b.x1.toFixed(1);
      return `<g><path d="M ${x} ${row - 4} l4 4 -4 4 -4 -4 Z" fill="${b.color}"/>
        <text x="${(+x + 8).toFixed(1)}" y="${row + 3.5}" font-size="9.5" fill="${b.color}" font-weight="600">${esc(b.label)}</text></g>`;
    }
    const w = Math.max(b.x2 - b.x1, 8).toFixed(1);
    return `<g><rect x="${b.x1.toFixed(1)}" y="${row - 3}" width="${w}" height="6" rx="3" fill="${b.color}" opacity=".28"/>
      <text x="${(b.x1 + 2).toFixed(1)}" y="${row - 7}" font-size="9.5" fill="${b.color}" font-weight="500">${esc(b.label)}</text></g>`;
  }).join('');

  const surgeryLines = bands.filter((b) => b.kind === 'surgery').map((b) =>
    `<line x1="${b.x1.toFixed(1)}" x2="${b.x1.toFixed(1)}" y1="${CY0}" y2="${CY1}" stroke="${b.color}" stroke-width="1.2" stroke-dasharray="3 6" opacity=".45"/>`).join('');

  const lines = series.map((s, si) => {
    const coords = s.pts.map((p) => ({ x: xOf(Date.parse(p.d), t0, t1), y: yOf(s, p.v) }));
    const path = s.pts.length > 1 ? `<path class="line" d="${smoothPath(coords)}" stroke="${s.m.color}" pathLength="1"/>` : '';
    const points = coords.map((c, i) => {
      const p = s.pts[i]; const prev = s.pts[i - 1];
      const isLast = i === s.pts.length - 1;
      const r = isLast ? 5.2 : (i === 0 ? 4.6 : 4);
      const nearRight = c.x > CX1 - 46;
      let tag = '', val = '';
      if (prev) {
        const chg = p.v - prev.v;
        const usePct = s.m.cat !== '康复测量';
        const big = usePct ? Math.abs(chg / prev.v) >= 0.2 : Math.abs(chg) >= 0.2;
        if (state.toggles.changes && big) {
          const txt = usePct ? `${chg > 0 ? '+' : ''}${Math.round(chg / Math.abs(prev.v) * 100)}%` : `${chg > 0 ? '+' : ''}${fmtNum(chg, s.m.dec)}${s.m.unit}`;
          const ty = (isLast && nearRight) ? c.y + 17 : c.y - 8 - (si % 2) * 11;
          tag = `<text class="delta-tag" x="${(c.x + (nearRight ? -8 : 8)).toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${nearRight ? 'end' : 'start'}" fill="${s.m.color}">${txt}</text>`;
        }
      }
      if (state.toggles.keypoints && isLast) {
        val = `<text x="${(c.x - 4).toFixed(1)}" y="${(c.y - 11 - (si % 2) * 13).toFixed(1)}" text-anchor="end" fill="${s.m.color}" font-size="11" font-weight="600">${fmtNum(p.v, s.m.dec)}</text>`;
      }
      return `<circle class="pt${state.pin && state.pin.code === s.code && state.pin.d === p.d ? ' active' : ''}" data-action="pin" data-code="${s.code}" data-d="${p.d}" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${r}" fill="${s.m.color}"><title>${esc(s.m.name)} ${fmtNum(p.v, s.m.dec)} ${esc(s.m.unit)} · ${longDate(p.d)}</title></circle>${tag}${val}`;
    }).join('');
    return `<g>${path}${points}</g>`;
  }).join('');

  const ticks = monthTicks(t0, t1).map((t) => `<text class="tick" x="${t.x.toFixed(1)}" y="${CY1 + 22}" text-anchor="middle">${t.label}</text>`).join('');

  return `<div class="chart-wrap" id="chart-wrap">
    <svg class="chart" id="timeline-svg" viewBox="0 0 ${CW} ${CH}" role="img"
      aria-label="已选指标与治疗时间轴；每条线按自身范围绘制，点选可查看数值与来源">
      ${grid}
      <line class="axis" x1="${CX0}" x2="${CX1}" y1="${CY1}" y2="${CY1}"/>
      ${state.toggles.treatment ? `<text x="10" y="26" font-size="9.5" fill="#a2949b">治疗</text>${strip}${surgeryLines}` : ''}
      ${lines}${ticks}
      <text class="tick" x="${CX0}" y="${CH - 6}">↑ 每条线按该指标全部记录范围缩放，不代表不同指标数值可比</text>
    </svg>
    <div class="chart-tip" id="chart-tip"></div>
  </div>
  <p class="small-note scroll-hint">图表可左右滑动，查看完整时间段</p>`;
}

function pinHTML() {
  if (!state.pin) return `<p class="small-note">点击曲线上的记录点，可查看数值、日期与来源；悬停可快速预览。</p>`;
  const m = METRICS[state.pin.code]; const p = m.points.find((x) => x.d === state.pin.d);
  if (!p) return `<p class="small-note">这个记录点已不在当前时间窗内。</p>`;
  return `<div class="pin"><div><b>${esc(m.name)} ${fmtNum(p.v, m.dec)} ${esc(m.unit)}</b>
    <p>${longDate(p.d)} · 来源：${esc(p.src)} · ${m.note}</p>
    <p class="small-note">这是已核对的模拟记录；趋势只用于回顾，不构成诊断或疗效判断。</p></div>
    <div class="actions">${btn('查看原文 ↗', 'source', 'source-link', `data-source="${esc(p.src)}"`)}${btn('收起', 'unpin', 'text-link text-button')}</div></div>`;
}

function legendHTML() {
  const sel = state.sel.map((c) => METRICS[c]);
  if (!sel.length) return '';
  return `<div class="legend">${sel.map((m) => {
    const last = m.points[m.points.length - 1];
    const lo = Math.min(...m.points.map((p) => p.v)), hi = Math.max(...m.points.map((p) => p.v));
    return `<span><i style="background:${m.color}"></i><b>${esc(m.name)}</b> ${fmtNum(last.v, m.dec)} ${esc(m.unit)}<span class="range">全期 ${fmtNum(lo, m.dec)}–${fmtNum(hi, m.dec)}</span></span>`;
  }).join('')}</div>`;
}

function chartPanel() {
  const [t0, t1] = domain();
  return `<section class="chart-panel" id="chart-panel">
    <div class="chart-top"><div><h2>病程时间轴</h2>
      <p class="small-note" style="margin-top:2px">${new Date(t0).getFullYear()}.${new Date(t0).getMonth() + 1} — ${new Date(t1).getFullYear()}.${new Date(t1).getMonth() + 1} · 只呈现已核对的模拟记录</p></div>
      <div class="actions">${pill(`${state.sel.length} 个指标`, 'pink')}${pill('仅已核对记录', 'green')}</div></div>
    ${legendHTML()}
    ${chartSVG(t0, t1)}
    <div id="pin-slot">${pinHTML()}</div>
    ${state.toggles.treatment ? `<div class="legend" style="margin-top:10px;border-top:1px solid var(--line);padding-top:9px">
      ${TREATMENTS.map((t) => `<span><i style="background:${t.color};border-radius:2px"></i>${esc(t.long)}</span>`).join('')}
    </div>` : ''}
  </section>`;
}

function rail() {
  const groups = CATS.map(([cat]) => `<div class="cat-label">${esc(cat)}</div>${Object.entries(METRICS).filter(([, m]) => m.cat === cat).map(([code, m]) => {
    const last = m.points[m.points.length - 1];
    return `<label class="metric-pick"><input type="checkbox" data-metric="${code}" ${state.sel.includes(code) ? 'checked' : ''}><i style="background:${m.color}"></i><span>${esc(m.name)}</span><small>${last ? fmtNum(last.v, m.dec) : '—'}</small></label>`;
  }).join('')}`).join('');
  return `<aside class="rail" aria-label="一图秀筛选项">
    <section><h3>时间范围</h3><div class="chips">
      ${[['3m', '近 3 月'], ['6m', '近 6 月'], ['12m', '近 12 月'], ['all', '全部']].map(([k, l]) => `<button class="chip" data-range="${k}" aria-pressed="${state.range === k}">${l}</button>`).join('')}
    </div></section>
    <section><details class="pick" ${window.innerWidth > 900 ? 'open' : ''}>
      <summary><span>选择指标</span><small>最多 4 个 · 已选 ${state.sel.length}</small></summary>
      <div class="metric-list">${groups}</div>
      <p class="small-note" style="margin-top:6px">共 16 项，可滚动 · 点选后图表立即更新</p>
    </details></section>
    <section><h3>显示内容</h3><div class="chips">
      <button class="chip" data-toggle="treatment" aria-pressed="${state.toggles.treatment}">治疗节点</button>
      <button class="chip" data-toggle="keypoints" aria-pressed="${state.toggles.keypoints}">关键点数值</button>
      <button class="chip" data-toggle="changes" aria-pressed="${state.toggles.changes}">变化 ≥20%</button>
    </div>
    <label class="form-label" style="margin-top:14px">缩放</label>
    <div class="zoom"><input type="range" id="zoom" min="40" max="100" step="5" value="${state.zoom}" aria-label="时间窗缩放"><span id="zoom-val">${state.zoom}%</span></div>
    </section>
  </aside>`;
}

/* metric card: true 3D flip, fixed height */
function sparkline(pts, color, dec) {
  const w = 220, h = 62, pad = 7;
  const vals = pts.map((p) => p.v); const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || Math.max(Math.abs(hi) * .08, 1);
  const coords = pts.map((p, i) => ({ x: pad + i * (w - pad * 2) / Math.max(pts.length - 1, 1), y: h - 12 - (p.v - lo) / span * (h - 24) }));
  const path = pts.length > 1 ? smoothPath(coords) : '';
  const last = coords[coords.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="最近 ${pts.length} 次记录折线">
    <line class="base" x1="${pad}" x2="${w - pad}" y1="${h - 12}" y2="${h - 12}"/>
    ${path ? `<path class="sp-line" d="${path}" stroke="${color}" pathLength="1"/>` : ''}
    ${coords.map((c, i) => `<circle class="sp-dot" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${i === coords.length - 1 ? 3.6 : 2.6}" fill="${color}" style="animation-delay:${i * 45}ms"/>`).join('')}
    <text x="${Math.min(last.x, w - 24)}" y="${Math.max(last.y - 8, 10)}" text-anchor="middle" font-size="9.5" fill="${color}" font-weight="600">${fmtNum(pts[pts.length - 1].v, dec)}</text>
  </svg>`;
}

function metricCard(code) {
  const m = METRICS[code]; const pts = m.points;
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const delta = prev ? last.v - prev.v : null;
  const flipped = state.flipped.has(code);
  const label = `${m.name}，${fmtNum(last.v, m.dec)} ${m.unit}，${longDate(last.d)}；${flipped ? '点击返回摘要' : `点击翻转查看最近 ${pts.length} 次记录`}`;
  const trend = delta === null ? '首次记录' : `较前次 ${delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} <em>${fmtNum(Math.abs(delta), m.dec)} ${esc(m.unit)}</em>`;
  const back = pts.length > 1
    ? `<span class="cat"><i style="background:${m.color}"></i>${esc(m.cat)}</span>
       <span class="name">${esc(m.name)} · 最近 ${pts.length} 次</span>
       ${sparkline(pts, m.color, m.dec)}
       <span class="spark-labels"><span>${longDate(pts[0].d)}</span><span>${longDate(last.d)}</span></span>
       <span class="foot">仅回顾已核对记录 · 点击返回</span>`
    : `<span class="cat"><i style="background:${m.color}"></i>${esc(m.cat)}</span>
       <span class="name">${esc(m.name)}</span>
       <span class="na">只有 1 次记录，暂不连线。<br>再记录一次后显示趋势。</span>
       <span class="foot">${longDate(last.d)} · 点击返回</span>`;
  return `<button class="mcard" data-action="flip" data-code="${code}" aria-pressed="${flipped}" aria-label="${esc(label)}">
    <span class="mcard-inner">
      <span class="mface front" aria-hidden="true">
        <span class="cat"><i style="background:${m.color}"></i>${esc(m.cat)}</span>
        <span class="name">${esc(m.name)}</span>
        <span class="val">${fmtNum(last.v, m.dec)}<small>${esc(m.unit)}</small></span>
        <span class="delta">${trend}</span>
        <span class="rec">共 ${pts.length} 次记录${pts.length > 1 ? ' · 点击翻转看趋势' : ''}</span>
        <span class="meta"><span>${longDate(last.d)} · ${esc(last.src)}</span><span class="hint">翻转 ↗</span></span>
      </span>
      <span class="mface back" aria-hidden="true">${back}</span>
    </span></button>`;
}

function metricGroups(limitTo) {
  return CATS.map(([cat]) => {
    const codes = Object.keys(METRICS).filter((c) => METRICS[c].cat === cat && (!limitTo || limitTo.includes(c)));
    if (!codes.length) return '';
    return `<div class="metric-group"><div class="metric-group-head"><h3>${esc(cat)}</h3><span>${codes.length} 项</span></div>
      <div class="metric-grid">${codes.map(metricCard).join('')}</div></div>`;
  }).join('');
}

/* ---------------- settings ---------------- */
const CFG_TABS = [['store', '工作区'], ['parse', '文档解析'], ['clinic', '临床数据库']];

function cfgStore() {
  const c = state.cfg;
  return `<div class="notice plain">下面是示意值。真实版本由宿主目录选择器返回<b>绝对路径</b>，并拒绝根目录、用户主目录与桌面根目录。</div>
  <div class="cfg-block">
    <span class="form-label">业务资料根目录</span>
    <div class="path-row"><code>${esc(c.root)}</code>${btn('更改位置', 'pick-dir', 'soft')}</div>
    <p class="small-note">原件、解析出的派生文件与数据库都放在这里；该目录不进安装包、不进日志、不进 Git。更改后下次导入生效，已有记录不搬家。</p>
  </div>
  <div class="grid three" style="margin:16px 0">
    <div class="stat-tile"><span>原件</span><b>${c.size.doc.toFixed(1)} MB</b></div>
    <div class="stat-tile"><span>派生文件</span><b>${c.size.derived.toFixed(1)} MB</b></div>
    <div class="stat-tile"><span>数据库</span><b>${c.size.db.toFixed(1)} MB</b></div>
  </div>
  <div class="row"><div><b>备份</b><p>上次备份 ${esc(c.backupAt)} · 位置在资料根目录下的 <code>backup/</code></p></div>
    <div class="actions">${btn('立即备份', 'backup-now', 'soft')}${btn('从备份恢复', 'backup-restore', 'text-button')}</div></div>
  <p class="small-note" style="margin-top:12px">恢复会覆盖当前数据库与派生文件，原件保留；执行前需二次确认，并列出被覆盖的范围。</p>`;
}

function cfgParse() {
  const c = state.cfg;
  return `<div class="choice ${c.consent ? 'on' : 'off'}" role="group" aria-label="解析方式">
    <div class="choice-head"><b>MinerU 解析</b>${pill(c.consent ? '已启用' : '待确认', c.consent ? 'green' : 'yellow')}</div>
    <p class="small-note">默认推荐。TXT / MD / CSV 始终先走本地抽取，不上传；只有扫描件、图片、PDF 与 Office 才送到 MinerU。</p>
    <label class="check-row"><input type="checkbox" id="consent" ${c.consent ? 'checked' : ''} data-action="consent">
      <span>我了解：所选文件会上传到 MinerU 云端解析。只传文件本身，不传档案、病理结论、治疗记录与收藏；可随时关闭。</span></label>
    ${c.consent ? '' : '<p class="small-note" style="color:var(--warn)">未勾选前不会上传，也不会调用 MinerU。</p>'}
  </div>

  <div class="choice" style="margin-top:14px">
    <div class="choice-head"><b>API Token</b><span class="status-inline">${esc(c.tokenSrc)}</span></div>
    <div class="token-row"><code class="masked">${esc(c.tokenMasked)}</code><span class="small-note">只显示后 4 位，不提供"查看完整值"</span></div>
    <form id="mineru-form" style="margin-top:10px">
      <label><span class="form-label">替换为我的 Token（可选）</span>
        <div class="token-row">
          <input name="token" type="${c.showToken ? 'text' : 'password'}" placeholder="sk-..." autocomplete="off" spellcheck="false" ${c.consent ? '' : 'disabled'}>
          <button type="button" class="text-button" data-action="mineru-show">${c.showToken ? '隐藏' : '显示'}</button>
        </div></label>
      <div class="form-actions">
        <button type="submit" class="primary">校验并保存</button>
        <button type="button" class="text-button" data-action="mineru-guide">如何申请？</button>
      </div>
    </form>
    <p class="small-note">Token 存于 <code>~/.mineru/config.yaml</code>，不写进患者库、不进日志、不进导出。保存前先校验一次，失败分三种原因：401 无效 / 429 配额用尽 / 网络错误。</p>
    <div id="mineru-guide" hidden><div class="notice plain" style="margin:12px 0 0">
      <b>4 步拿到自己的 Token</b>
      <ol style="padding-left:18px;margin:8px 0 0">
        <li>访问 mineru.net，注册并登录</li>
        <li>进入「API」→「API 管理」</li>
        <li>创建 Token 并复制</li>
        <li>回到这里粘贴，点「校验并保存」</li>
      </ol>
      <p style="margin-top:8px"><button type="button" class="text-button" data-action="ext-link">打开 mineru.net/token 申请页 ↗</button></p>
      <p class="small-note">外部链接，点击前会先说明去向。为什么不让你去跑命令行：工作台已经装好，再开终端执行 <code>mineru-open-api auth</code> 会挡住大部分人。</p>
    </div></div>
  </div>

  <div class="row" style="margin-top:6px"><div><b>解析模型：pipeline（固定）</b><p>面向病历优先保留来源内容，不做生成式补写。VLM 可能生成原文不存在的内容，本流程不提供该选项。</p></div>${pill('不可切换', 'grey')}</div>
  <div class="notice warn" style="margin-top:12px">Flash 免费解析单文件上限 10 MB / 20 页，真实扫描病历常超过这个范围。超限时保留原件并提示换 Token 或稍后重试，不丢文件。认证失败会自动尝试 Flash，成功时界面明确标注「Flash 降级解析」。</div>`;
}

function cfgClinic() {
  const c = state.cfg;
  return `<div class="notice plain">临床数据库用来做试验与登记信息的离线检索。<b>二期可补，不作为一期限定</b>；未接入时其它模块照常可用。</div>
  <div class="row"><div><b>状态：${esc(c.dbStatus)}</b><p>最后检查：${esc(c.dbChecked)}</p></div>
    <div class="actions">${btn('导入离线库', 'db-import', 'soft')}${btn('检查更新', 'db-check', 'text-button')}</div></div>
  <div class="row"><div><b>数据来源</b><p>ChiCTR 归档 / CDE 归档 / 本地索引；每条都要保留来源与更新日期</p></div>${pill('未接入', 'grey')}</div>
  <div class="row"><div><b>离线可用</b><p>未接入或断网时，临床页给空态与获取说明，不报错、不假装有结果</p></div>${pill('设计约束', 'green')}</div>
  <p class="small-note" style="margin-top:12px">原型没有真实数据库，按钮只演示状态变化。</p>`;
}

function settingsModal(tab = 'store') {
  const body = `<div class="cfg-tabs" role="tablist" aria-label="设置分区">${CFG_TABS.map(([id, label]) => `<button role="tab" aria-selected="${tab === id}" data-settings-tab="${id}">${label}</button>`).join('')}</div>
    <div style="margin-top:16px">${tab === 'store' ? cfgStore() : tab === 'parse' ? cfgParse() : cfgClinic()}</div>`;
  openModal('设置', body, btn('完成', 'close', 'primary'), '本机设置 · 原型演示');
}

/* 关于：版本号在这里给出完整四段信息（版本 / 构建日期 / 渠道 / 来源），
   是全页唯一带「怎么取到版本号」说明的地方。 */
function aboutModal() {
  const body = `<div class="about">
      <img class="about-logo" src="assets/brand/pinkypal-logo-full.png" width="150" height="150" alt="小粉宝 PinkyPal 完整标识：粉色机器人抱着橙色爱心，下方为品牌名与「乳腺肿瘤患者 AI 助手」">
      <div class="about-meta">
        <div class="about-ver"><b>v${esc(APP_INFO.version)}</b><span class="pill grey">${esc(APP_INFO.channelLabel)}</span></div>
        <dl>
          <div><dt>构建日期</dt><dd>${esc(APP_INFO.build)}</dd></div>
          <div><dt>版本来源</dt><dd>仓库根目录 VERSION 文件（唯一来源）</dd></div>
          <div><dt>页面渲染</dt><dd>顶栏、页脚、本弹窗同源，不各自手写</dd></div>
        </dl>
      </div>
    </div>
    <div class="notice plain" style="margin-top:14px">当前是交互原型：所有资料、指标与结论都是模拟数据，不读写本机文件，不调用模型，不做诊断。版本号用于区分设计迭代，不是可安装包版本。</div>`;
  openModal('关于小粉宝', body, btn('关闭', 'close', 'primary'), '小粉宝 · PinkyPal');
}

/* 版本号只写一次：所有出现位置由 APP_INFO 渲染，避免三处各写一个数字。 */
function paintVersion() {
  const v = `v${APP_INFO.version}`;
  $$('[data-app-version]').forEach((el) => { el.textContent = v; });
  const chip = $('#ver-chip'); if (chip) { chip.textContent = v; chip.title = `v${APP_INFO.version} · ${APP_INFO.build} · ${APP_INFO.channel}`; }
  const foot = $('#app-version'); if (foot) foot.textContent = v;
  const build = $('#app-build'); if (build) build.textContent = APP_INFO.build;
  const init = $('#about-init'); if (init) init.textContent = `${v}（${APP_INFO.build}）`;
}

/* 图片加载失败不能让品牌位变成破图：失败时收成文字首字，保持版面与可读性。 */
function guardBrand() {
  const img = $('#brand-mark'); if (!img) return;
  const fallback = () => { img.hidden = true; img.closest('.brand')?.classList.add('no-mark'); };
  if (img.complete && img.naturalWidth === 0) fallback();
  else img.addEventListener('error', fallback, { once: true });
}

/* ---------------- 36 号 §2.6 病程状态卡 ---------------- */
/* 四件结构：卡头（D+N · 距下一阶段）／大字天数／现状行／出口按钮排。
   天数一律由锚点日派生，不手填；无锚点（未手术）→ 整卡「待初始化」指向三步向导，不编数字。
   「下次」只取用户自己记下的未完成安排，不由指南间隔推算（那是替医生排日程）。 */
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayGap = (from, to = todayISO()) => Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86400000);

function stageCard(prof) {
  const today = todayISO();
  /* state.tasks 只属于 DEMO-1：别的画像（联调空的）若沿用这批待办，会凭空给出一场「已预约的复查」。
     所以只有该档案自己的数据时才读待办，其余一律「还没有记下安排」。 */
  const next = prof.id === 'p1'
    ? state.tasks.filter((t) => !t.done && t.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]
    : null;
  /* 事项标题自己带括号（「复查（乳腺外科）」），外面再套一层会变成双括号，所以用中点分隔 */
  const nextText = next ? `下次：${longDate(next.date)} · ${esc(next.title)} · ${esc(next.note)}` : '下次：还没有记下安排';
  const gap = prof.anchor ? dayGap(prof.anchor) : null;
  const toNext = next ? dayGap(today, next.date) : null;
  const eyebrow = gap == null
    ? 'D+N 状态卡 · 待初始化'
    : `D+${gap} 状态卡 · ${toNext == null ? '距下一阶段：待记录' : `距下次安排 ${toNext} 天`}`;
  /* 副按钮只带 data-primer-open：由 primer.js 接管点击、补 aria 并走 history，不接 app 自己的 data-action */
  const primerBtn = '<button class="soft" data-primer-open aria-label="疾病概要：乳腺癌是什么？定义、医学资料与指南情况、治疗全景、发展趋势">疾病概要：乳腺癌是什么？</button>';

  if (gap == null) {
    return `<section class="card stage-card is-empty" aria-label="病程状态卡：待初始化">
      <span class="eyebrow">${eyebrow}</span>
      <div class="stage-day"><b>待初始化</b><small>没有${esc(prof.anchorLabel || '手术日')}或治疗起始日，天数算不出来</small></div>
      <div class="stage-now">
        <span>${pill('阶段：' + prof.stage, 'grey')}<span class="stage-state">${esc(prof.stageState || '状态未记录')}</span></span>
        <span>三步初始化：① 选资料目录 ② 导入手术记录或出院小结 ③ 核对日期</span>
        <span>${nextText}</span>
      </div>
      <div class="stage-actions">
        ${btn('开始三步初始化', 'pick-dir', 'primary')}
        ${primerBtn}
      </div>
    </section>`;
  }

  return `<section class="card stage-card" aria-label="病程状态卡：${esc(prof.tag)}">
    <span class="eyebrow">${eyebrow}</span>
    <div class="stage-day">
      <b>第 ${gap} 天</b>
      <small>锚点 ${longDate(prof.anchor)}（${esc(prof.anchorLabel)} = Day 0）· 由档案日期算出，不手填</small>
    </div>
    <div class="stage-now">
      <span>${pill(prof.stage, 'pink')}<span class="stage-state">${esc(prof.stageState || '状态未记录')}</span></span>
      <span>${nextText}</span>
    </div>
    <div class="stage-actions">
      ${go('看治疗历程（按次）→', 'clinical', '治疗历程', 'primary')}
      ${primerBtn}
    </div>
  </section>`;
}

/* ---------------- dashboard ---------------- */
function tasksList() {
  return state.tasks.map((t) => `<div class="row ${t.done ? 'completed' : ''}"><div class="row-main">
    ${btn(t.done ? '✓' : '', 'task-toggle', `icon-button${t.done ? ' done' : ''}`, `data-id="${t.id}" aria-label="${t.done ? '重开' : '完成'}：${esc(t.title)}"`)}
    <div><small>${longDate(t.date)}</small><b>${esc(t.title)}</b><p>${esc(t.note)}</p></div></div>
  </div>`).join('');
}
function latestArm() { return ARM[ARM.length - 1]; }

/* 首页（工作台顶栏）两个状态按钮 = 宿主就绪状态，不是业务数据状态。
   1) 资料目录（数据目录）：已激活 / 未设置
   2) 对话（工作台会话）：未进入激活 / 进行中
   依据 workbench-standard §6：无会话时业务面板照常可用；只有依赖会话的动作才引导创建。 */
function paintReady() {
  const root = state.cfg.root;
  const sess = state.session;
  const store = $('#ready-store'), chat = $('#ready-session');
  if (!store || !chat) return;
  store.innerHTML = `<i class="${root ? '' : 'grey'}"></i><span>资料目录</span><b>${root ? '已激活' : '未设置'}</b>`;
  store.dataset.action = root ? 'open-store' : 'pick-dir';
  store.setAttribute('aria-label', root ? `资料目录：已激活，${root}；点击查看或更改目录` : '资料目录：未设置；点击选择目录');
  store.title = root ? root : '选择资料目录（不使用默认路径）';
  chat.innerHTML = `<i class="${sess ? '' : 'grey'}"></i><span>对话</span><b>${sess ? '进行中' : '未进入激活'}</b>`;
  chat.dataset.action = sess ? 'session-info' : 'start-session';
  chat.setAttribute('aria-label', sess ? `对话：进行中，${sess.started} 开始；点击查看会话` : '对话：未进入激活；点击创建会话并查看开场草稿');
  chat.title = sess ? `会话 ${sess.started} 开始` : '创建本工作台会话（需要先有资料目录）';
}

function miniArmChart() {
  const pts = ARM.map((a) => ({ d: a.d, v: armMax(a) }));
  const w = 460, h = 108, pad = 10, lo = 0, hi = Math.max(2.2, ...pts.map((p) => p.v));
  const coords = pts.map((p, i) => ({ x: pad + i * (w - pad * 2) / Math.max(pts.length - 1, 1), y: h - 18 - (p.v - lo) / (hi - lo || 1) * (h - 34) }));
  const path = smoothPath(coords);
  return `<svg class="mini-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="患健侧臂围差最近四次记录：0.3、0.5、1.1、1.8 厘米">
    <line x1="${pad}" x2="${w - pad}" y1="${h - 18}" y2="${h - 18}" stroke="#eee2e7"/>
    <line x1="${pad}" x2="${w - pad}" y1="${h - 18 - 2 / hi * (h - 34)}" y2="${h - 18 - 2 / hi * (h - 34)}" stroke="#d8a6b6" stroke-dasharray="4 4"/>
    <text x="${pad + 4}" y="${h - 18 - 2 / hi * (h - 34) - 4}" font-size="9" fill="#a9788a">2cm 参考关注线</text>
    <path d="${path}" fill="none" stroke="#a8410a" stroke-width="2.2" stroke-linecap="round" pathLength="1" class="line"/>
    ${coords.map((c, i) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${i === coords.length - 1 ? 4.4 : 3}" fill="#a8410a" stroke="#fff" stroke-width="1.6" class="sp-dot" style="animation-delay:${i * 50}ms"/>`).join('')}
    <text x="${coords[coords.length - 1].x - 4}" y="${coords[coords.length - 1].y - 9}" text-anchor="end" font-size="10" fill="#a8410a" font-weight="600">${pts[pts.length - 1].v}</text>
  </svg>`;
}

function dashboard() {
  const arm = latestArm(); const prev = ARM[ARM.length - 2]; const dNow = armMax(arm), dPrev = armMax(prev);
  const prof = PROFILES.find((p) => p.id === state.profileId) || PROFILES[0];
  const done = state.docs.filter((d) => d.status === '已核对').length;
  const pending = state.docs.length - done;
  /* DEMO-2 是「资料极少」画像：首页进度必须给空态，不能沿用 DEMO-1 的 5 份 */
  const docsText = prof.id === 'p2'
    ? '还没有资料 · 先导入一份'
    : `${done} / ${state.docs.length} 份已核对${pending ? ` · ${pending} 份待核对` : ' · 无待核对'}`;
  return `${head('今天，先照顾眼前的一件事。', SUBTITLES.dashboard, btn(`当前阶段：${state.stage}`, 'stage-pick', 'soft'))}
  ${stageCard(prof)}
  ${prof.full ? '' : `<div class="notice warn">当前档案：<b>${esc(prof.tag)}</b> · ${esc(prof.name)} · ${esc(prof.side)}侧 · ${esc(prof.surgery)}。该画像在原型里只演示<b>元数据与空态</b>，下方指标与记录仍是 DEMO-1 的模拟数据，不能当成这位患者的病历。</div>`}
  ${state.cfg.root ? '' : `<div class="notice plain">资料位置还没设置，所以<b>对话未进入激活</b>。这不影响你浏览看板、翻指标卡：规范要求业务面板不依赖会话。需要向助手提问或保存文件时，再选目录并创建会话。</div>`}
  <div class="alert-strip">
    <div><b>左上肢臂围差 ${fmtNum(dNow, 1)} cm，较上次 +${fmtNum(dNow - dPrev, 1)} cm</b>
      <p>10.14 四点位测量 · 已同步到一图秀；是否需要处理请与治疗团队讨论，工作台不做判断。</p></div>
    <div class="actions">${go('看上肢趋势 →', 'care', '上肢与淋巴水肿', 'primary')}${btn('带去复诊的问题', 'questions', 'soft')}</div>
  </div>
  <div class="grid three" style="margin-bottom:16px">
    <button class="task-entry" data-action="stage-help"><span class="entry-icon">◔</span><b>${esc(state.stage)}，现在该注意什么</b><span>按阶段列出可记录、可询问的事</span><span class="arrow">↗</span></button>
    <button class="task-entry" data-action="go" data-page="care" data-sub="上肢与淋巴水肿"><span class="entry-icon">＋</span><b>今天手臂有点沉</b><span>记症状，或量一次四点位</span><span class="arrow">↗</span></button>
    <button class="task-entry" data-action="go" data-page="records" data-sub="资料库"><span class="entry-icon">▤</span><b>资料很多，帮我理清楚</b><span>${docsText}</span><span class="arrow">↗</span></button>
  </div>
  <div class="dashboard-grid">
    <div>
      ${section('最近的变化', '同一份记录，同时出现在一图秀、指标卡和就诊准备里。', go('打开一图秀 ↗', 'timeline', '', 'text-button'))}
      <section class="card">
        <div class="card-head"><div><h3>患健侧臂围差</h3><p>四点位最大值 · ${ARM.length} 次记录 · 07.28 起</p></div>${pill('康复测量', 'rose')}</div>
        ${miniArmChart()}
        <div class="stat-band"><span><b>${fmtNum(dNow, 1)}</b>cm 最新差值</span><span><b>${ARM.length}</b>次测量</span><span><b>${state.questions.length}</b>个待问问题</span></div>
      </section>
      <div class="grid two" style="margin-top:14px">
        <section class="card"><div class="card-head"><h3>治疗相关的变化</h3>${pill('副作用记录', 'yellow')}</div>
          <div class="row"><div><b>手指晨僵约 20 分钟</b><p>10.14 · 来曲唑治疗中 · 0–3 自评 2</p></div>${go('记录 →', 'care', '不适记录', 'text-button')}</div>
          <div class="row"><div><b>CA15-3 16.2 U/mL</b><p>10.09 · 较 7 月 +1.6 · 仅回顾</p></div>${go('看曲线 →', 'timeline', '', 'text-button')}</div>
        </section>
        <section class="card"><div class="card-head"><h3>营养与体重</h3>${pill('轻记录', 'green')}</div>
          <p>体重 59.1 kg（10.09）。不需要每天称，记一次也有意义。</p>
          ${go('记一次体重 →', 'nutrition', '进食与体重', 'text-button')}
        </section>
      </div>
    </div>
    <div>
      ${section('接下来的安排', `${state.tasks.filter((t) => !t.done).length} 项待办`, btn('＋ 添加', 'add-task', 'text-button'))}
      <section class="card">${tasksList()}</section>
      ${section('就诊前，想问的事', '', btn('编辑', 'questions', 'text-button'))}
      <section class="card accent">${state.questions.filter((q) => q.selected).slice(0, 2).map((q) => `<div class="row"><div><b>${esc(q.text)}</b><p>${esc(q.source)}</p></div>${q.kind === 'view' ? pill('看法', 'grey') : ''}</div>`).join('')}
        <div class="small-note">问题会保留到「收藏与回顾」，下次不用重新整理。标了「看法」的只作信息，不当结论。</div></section>
    </div>
  </div>`;
}

/* ---------------- records ---------------- */
function docsTable() {
  const docs = state.docs.filter((d) => d.name.includes(state.query) || d.type.includes(state.query));
  return `<div class="table-wrap"><table><thead><tr><th>材料名称</th><th>日期</th><th>类型</th><th>整理状态</th><th>操作</th></tr></thead><tbody>
    ${docs.map((d) => `<tr><td><b>${esc(d.name)}</b><br><small>模拟资料 · 无真实文件</small></td><td>${longDate(d.date)}</td><td>${d.type}</td>
      <td>${pill(d.status, d.status === '已核对' ? 'green' : 'yellow')}</td>
      <td>${btn('原文', 'source', 'source-link', `data-source="${esc(d.name)}"`)} ${d.status === '待核对' ? go('看草稿', 'records', '整理草稿 / 核对', 'source-link') : ''}</td></tr>`).join('')}
  </tbody></table></div>${!docs.length ? '<div class="empty"><h3>没有找到这份材料</h3><p>试试「病理」「检验」或清空搜索。</p></div>' : ''}`;
}
function candidateRows() {
  return state.candidates.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.value)}</td>
    <td>${btn('第 1 页 ↗', 'source', 'source-link', `data-source="${esc(c.source)}"`)}</td>
    <td>${pill(c.status === 'accepted' ? '已核对' : c.status === 'needs_review' ? '需要确认' : '未核对', c.status === 'accepted' ? 'green' : 'yellow')}</td>
    <td>${btn('查看 / 更正', 'candidate', 'text-button', `data-id="${c.id}"`)}</td></tr>`).join('');
}
function records() {
  const sub = state.sub.records || SUBPAGES.records[0]; let body = '';
  if (sub === '资料库') body = `<div class="toolbar"><input id="search" aria-label="搜索模拟材料" placeholder="搜索材料名称或类型" value="${esc(state.query)}">
    <div class="actions">${pill('全部为模拟数据', 'pink')}${btn('载入模拟报告', 'load-report', 'primary')}${btn('演示解析失败', 'parse-fail')}</div></div>
    ${state.parsing ? '<div class="card" role="status">正在整理模拟材料，切换页面也不会丢失进度…</div>' : ''}
    ${state.parseError ? `<div class="notice warn">模拟解析失败。材料仍保留，可重试或手工核对。${btn('重试', 'retry', 'text-button')}</div>` : ''}
    <div class="card" id="docs-table">${docsTable()}</div>
    <div class="help-box">这版只演示资料组织方式。导入、OCR、真实文件和云端处理均未接入。</div>`;
  else if (sub === '整理草稿 / 核对') body = `<div class="flow-steps"><span class="on">原始材料</span>→<span>整理草稿</span>→<span>按需核对</span>→<span>病程 / 就诊准备</span></div>
    <div class="notice pink">整理草稿 · 以下仍有未核对内容。可以先看轮廓，暂时不处理疑点。</div>
    <div class="card"><div class="card-head"><div><h2>这份放疗小结，先帮你理到这里</h2><p>模拟摘录 · 不含治疗建议</p></div>${btn('查看原文', 'source', 'soft', 'data-source="放疗小结"')}</div>
      <p>材料记载了放疗部位、次数与结束日期。结束日期和部位待核对；腋窝清扫范围原文未写明，单独标为需要确认。</p>
      <div class="table-wrap"><table><thead><tr><th>项目</th><th>材料中的内容</th><th>来源</th><th>状态</th><th>操作</th></tr></thead><tbody>${candidateRows()}</tbody></table></div>
      <div class="form-actions">${go('现在先不核对', 'timeline')}${btn('保留核实问题', 'add-review-question', 'primary')}</div></div>`;
  else if (sub === '病情档案') body = `<div class="notice pink">不同标本、时间与来源的结果分别保留。不能用一份最新报告覆盖全部历史；未检测不等于阴性。</div>
    <div class="grid two">
      <section class="card"><div class="card-head"><h2>病理资料 · 左乳</h2>${pill('模拟转录 · 已核对', 'green')}</div>
        <dl style="display:grid;grid-template-columns:104px 1fr;gap:8px 10px;font-size:12.5px;margin:0">
          <dt style="color:var(--muted)">取样日期</dt><dd style="margin:0">2026-01-23</dd>
          <dt style="color:var(--muted)">部位 / 侧别</dt><dd style="margin:0">左乳 · 外上象限</dd>
          <dt style="color:var(--muted)">术式</dt><dd style="margin:0">改良根治术</dd>
          <dt style="color:var(--muted)">腋窝处理</dt><dd style="margin:0">淋巴结清扫（3/14 阳性）</dd>
          <dt style="color:var(--muted)">组织学 / 分级</dt><dd style="margin:0">浸润性导管癌 · G2</dd>
          <dt style="color:var(--muted)">肿瘤大小</dt><dd style="margin:0">2.6 cm</dd>
          <dt style="color:var(--muted)">切缘</dt><dd style="margin:0">阴性</dd>
          <dt style="color:var(--muted)">ER / PR</dt><dd style="margin:0">90% / 70%（阳性）</dd>
          <dt style="color:var(--muted)">HER2</dt><dd style="margin:0">1+（未扩增）</dd>
          <dt style="color:var(--muted)">Ki-67</dt><dd style="margin:0">25%</dd>
        </dl>
        ${btn('查看原报告 ↗', 'source', 'text-button', 'data-source="病理报告 · 左乳"')}</section>
      <section class="card"><h2>这份档案还缺什么</h2><p>缺项表示尚未录入，不代表需要补做检查。</p>
        <div class="row"><div><b>放疗小结核对</b><p>结束日期与部位待确认</p></div>${pill('待核对', 'yellow')}</div>
        <div class="row"><div><b>腋窝清扫范围</b><p>手术记录原文未写明，需向团队核实</p></div>${pill('需要确认', 'yellow')}</div>
        <div class="row"><div><b>生育力相关讨论</b><p>未记录；如需要可单独保留，默认不进分享</p></div>${pill('未记录', 'grey')}</div>
        ${go('继续整理材料 →', 'records', '资料库', 'text-button')}</section>
    </div>`;
  else if (sub === '指标检测') body = `<div class="notice">以下为模拟数值。趋势只呈现记录，不代表疗效、复发或诊断判断；不同单位与方法需分开核对。</div>
    ${metricGroups()}
    <div class="help-box">点卡片会在原位翻转（不改变布局），背面是最近几次记录的迷你折线；每张卡的状态彼此独立。</div>`;
  else body = summary();
  return head('病情整理', SUBTITLES.records, btn('准备问题清单', 'questions', 'primary')) + subnav() + body;
}

function summary() {
  return `<div class="grid two">
    <section class="card"><div class="card-head"><h2>就诊摘要预览</h2>${pill('模拟资料', 'pink')}</div>
      <p>范围：2026-01 至 2026-10 · 本次只预览资料组织与分享选择。</p>
      <div class="row"><div><b>病情与治疗材料</b><p>${state.docs.length} 份示例材料，保留各自日期与核对状态。</p></div></div>
      <div class="row"><div><b>最近变化</b><p>臂围差 ${fmtNum(armMax(latestArm()), 1)} cm（10.14）；体重 59.1 kg（10.09）。</p></div></div>
      <div class="row"><div><b>准备讨论的问题</b><p>${state.questions.length} 个，可编辑与选择。</p></div></div>
      <div class="notice pink">心理、性健康与生育相关记录默认不进入这份摘要。</div>
      ${btn('编辑并导出问题清单', 'questions', 'primary')}</section>
    <section class="card"><h2>分享之前，再看一眼</h2>
      <p>未核对内容与来源状态在所有格式中都要保留。原型下载只包含主动选择的问题。</p>
      <div class="notice plain" style="margin-top:14px">一期只做 Markdown 导出；PDF/JPEG/HTML/DOCX 需要逐格式验收，未实现。</div>
      <details><summary>导出会包含什么</summary><p>资料范围、来源版本、已核对与草稿区分、选入的问题；不含病历原文、心理与私密记录。</p></details></section></div>`;
}

/* ---------------- timeline page ---------------- */
function symptomTrack() {
  const months = ['5月', '6月', '7月', '8月', '9月', '10月'];
  const rows = [
    ['le_symptom', '上肢沉重 / 紧绷', [0, 1, 1, 2, 2, 3]],
    ['ai_joint', '关节痛 / 僵硬', [0, 0, 1, 1, 1, 2]],
    ['hot_flash', '潮热 / 盗汗', [0, 1, 1, 2, 2, 2]]
  ];
  return `<div class="symptom-track"><span></span>${months.map((m) => `<span class="head">${m}</span>`).join('')}
    ${rows.map(([, label, vals]) => `<span class="label">${label}</span>${vals.map((v) => `<span class="cell${v ? ' l' + v : ''}" title="${label} · 强度 ${v}/3"></span>`).join('')}`).join('')}
  </div><p class="small-note">症状以强度色块呈现，不画成曲线：0–3 是体验强度，不是检验值。色块越深表示自评强度越高。</p>`;
}

function timelinePage() {
  const [t0, t1] = domain();
  return head('病情一图秀', SUBTITLES.timeline, btn('准备讨论的问题', 'questions', 'primary')) +
  `<div class="overview">${rail()}<div class="timeline-main">${chartPanel()}
     <section class="card"><div class="card-head"><div><h3>症状轨道</h3><p>与曲线同处一段时间，但不与数值混在一起。</p></div>${pill('0–3 自评', 'grey')}</div>${symptomTrack()}</section>
   </div></div>
   ${section('指标卡片', '点一张卡，原地翻转看最近几次；卡片位置和尺寸不变。', go('去指标检测 ↗', 'records', '指标检测', 'text-button'))}
   <div>${metricGroups()}</div>
   ${section('治疗时间线', '计划与实际分开；这里只列已确认的实际治疗。')}
   <section class="card">
     ${TREATMENTS.map((t) => `<div class="row"><div><b>${esc(t.long)}</b><p>${longDate(t.from)}${t.to !== t.from ? ' — ' + longDate(t.to) : ''} · 实际接受 · 来源：${t.kind === 'surgery' ? '手术记录' : t.kind === 'chemo' ? '化疗记录' : t.kind === 'radio' ? '放疗小结' : '门诊记录'}</p></div>${pill(t.kind === 'endo' ? '进行中' : '已完成', t.kind === 'endo' ? 'green' : 'grey')}</div>`).join('')}
     <p class="small-note">治疗色带只做背景参照，不表示因果；关闭「治疗节点」后色带消失，数据点位置不变。</p>
   </section>`;
}

/* ---------------- care ---------------- */
function careStageTopics(stage) {
  const map = {
    '术后 0–2 周': [
      ['伤口与引流', '记录引流量、颜色与伤口外观；按出院医嘱换药。出现发热、红肿渗液增多或异味时联系治疗团队。', '术后恢复'],
      ['患侧上肢的“不做”清单', '按出院医嘱限制患侧提重物与大幅度外展；具体范围由手术/康复团队给出，工作台不替代。', '术后恢复'],
      ['皮肤与患肢保护', '避免患肢抽血、输液、测血压（除非团队另有安排）；防晒、防蚊虫、防割伤。', '上肢与淋巴水肿']
    ],
    '术后 2–6 周': [
      ['术后上肢：活动与肿胀', '按康复科给出的范围练习；记录前屈、外展角度和抬臂时的手臂感受，不追求进度。', '上肢与淋巴水肿'],
      ['伤口与瘢痕', '记录牵拉感、瘢痕周围紧绷；不自行处理增生或粘连。', '术后恢复'],
      ['体力恢复', '记录疲劳与睡眠，不设打卡目标；逐步恢复日常，不追求“进度”。', '术后恢复']
    ],
    '术后 3 个月以上': [
      ['上肢围度', '四点位（腕横纹、前臂中段、肘上 10cm、腋下 10cm）健患侧成对测量，取最大差值。', '上肢与淋巴水肿'],
      ['症状与功能', '记录沉重、紧绷、肿胀与抬臂受限；症状常早于围度变化。', '上肢与淋巴水肿'],
      ['长期随访', '复查安排与资料归档；不自动生成复查方案。', '近期安排']
    ]
  };
  return map[stage] || map['术后 3 个月以上'];
}

function care() {
  const sub = state.sub.care || SUBPAGES.care[0]; let body = '';
  if (sub === '近期安排') body = `<div class="card"><div class="card-head"><div><h2>近期的安排</h2><p>本人待办与医院安排分开；当前日期全部为模拟。</p></div>${btn('＋ 新安排', 'add-task', 'primary')}</div>
    ${tasksList()}<p class="small-note">完成待办不会生成治疗记录；未接入系统后台通知。</p></div>`;
  else if (sub === '术后恢复') body = `<div class="notice pink">阶段由你自己选择，工作台不根据日期推断。以下只整理“可记录的事”和“该问的事”，不给动作处方。</div>
    <div class="stage-row">${['术后 0–2 周', '术后 2–6 周', '术后 3 个月以上'].map((s) => `<button class="stage-chip" data-stage="${s}" aria-pressed="${state.armStage === s}">${s}</button>`).join('')}</div>
    <div class="grid three">${careStageTopics(state.armStage).map(([t, d, link]) => `<section class="topic-card"><h3>${t}</h3><p>${d}</p><div class="actions">${go('记录 / 查看 →', 'care', link, 'text-button')}</div></section>`).join('')}</div>
    ${section('引流记录（术后带管期）', '只保留短期记录，拔管后归档。')}
    <section class="card"><div class="table-wrap"><table><thead><tr><th>日期</th><th>引流量</th><th>性状</th><th>备注</th></tr></thead><tbody>
      ${state.drains.map((d) => `<tr><td>${longDate(d.d)}</td><td>${d.v} mL</td><td>${esc(d.note)}</td><td>${d.v === 0 ? '当日拔管' : '—'}</td></tr>`).join('')}
    </tbody></table></div>${btn('＋ 记一次引流量', 'add-drain', 'text-button')}<p class="small-note">引流量的“正常范围”由手术团队按术式说明；工作台不判断是否异常。</p></section>
    ${section('已存的康复建议', '按来源与日期保留；不把产品文案当成医嘱。')}
    <section class="card">
      <div class="advice"><b>患肢避免提重物（>5kg）、避免长时间下垂；按康复科指导使用压力袖套</b><p>来源：出院康复指导 · 2026-01-25</p><small>状态：已存原文摘要 · 待专业复核</small></div>
      <div class="advice"><b>术后 2 周内以患侧上肢的被动/辅助活动为主，具体范围按康复科门诊评估</b><p>来源：康复科门诊记录 · 2026-02-03</p><small>状态：已存原文摘要 · 待专业复核</small></div>
      <p class="small-note">这两条是模拟摘要，用于演示“建议带来源与日期”的结构；真实版本需保留原文并标注是否仍适用。</p>
    </section>`;
  else if (sub === '上肢与淋巴水肿') body = armPage();
  else if (sub === '不适记录') body = `<div class="card"><div class="card-head"><div><h2>把变化记下来，方便描述</h2><p>强度是自评，不是评分；不用于判断病情。</p></div>${btn('＋ 记录不适', 'symptom', 'primary')}</div>
    ${state.symptoms.length ? state.symptoms.map((s) => `<div class="saved-item"><b>${esc(s.label)} · 强度 ${s.level}/3</b><p>${esc(s.note)}</p><small>${longDate(s.d)} · 本人自述 · 原型记录，不是诊断</small></div>`).join('') : '<div class="empty"><h3>这里还没有记录</h3><p>记录当时的感受、时间和想问的问题即可。</p></div>'}
    <div class="help-box">内分泌治疗的关节痛/潮热、放疗区皮肤反应都可以记在这里；工作台不做因果归因，也不建议停药。</div></div>`;
  else if (sub === '就诊准备') body = viewpointsCard() + questionsBody(true);
  else body = `<div class="notice">这些是可选择的话题，不会要求每个人都经历或完成。</div>
    <div class="grid three">
      ${[['身体形象与穿衣', '术后外观、义乳/内衣、照镜子时的感受；由你决定谈不谈。'], ['亲密关系与性健康', '阴道干涩、性欲变化、伴侣沟通；默认私密，不进摘要。'], ['生育与月经', '化疗后月经变化、生育力保存的转介问题；不按年龄推断。'], ['工作与体力', '返岗节奏、通勤、家务分工；记录困难而不是“完成度”。'], ['复发担忧', '允许表达；把担忧整理成问题，不用标志物曲线安抚。'], ['睡眠', '入睡困难、夜间醒来；与潮热/关节痛分开记录。']].map(([t, d]) => `<section class="card"><h3>${t}</h3><p style="font-size:11.5px;margin-top:5px">${d}</p>${btn('准备一个讨论问题 →', 'topic-question', 'text-button', `data-topic="${t}"`)}</section>`).join('')}
    </div><div class="help-box">工作台不提供心理治疗、不评估危机状态；如出现自伤想法，请联系当地急救或专业机构。</div>`;
  const headAction = sub === '就诊准备'
    ? `${btn('下载所选 · Markdown', 'download', 'primary')}`
    : btn('预览交给 Agent 的内容', 'agent');
  return head('全程与康复', SUBTITLES.care, headAction) + subnav() + body;
}

function armPage() {
  const last = latestArm(); const prev = ARM[ARM.length - 2];
  const dNow = armMax(last), dPrev = armMax(prev);
  const over = dNow >= 2;
  return `<div class="arm-hero">
    <div><span class="eyebrow">患健侧臂围差 · 四点位最大值</span>
      <div class="big">${fmtNum(dNow, 1)}<small>cm</small></div>
      <div class="delta">较上次（${longDate(prev.d)}）<em>+${fmtNum(dNow - dPrev, 1)} cm</em> · ${ARM.length} 次记录</div>
      <div class="range-bar"><i style="width:${Math.min(100, dNow / 2.5 * 100)}%"></i></div>
      <div class="range-scale"><span style="left:0">0</span><span style="left:40%">1</span><span style="left:80%">2</span><span style="right:0">2.5 cm</span></div>
      <p class="small-note">${over ? '已到达 2cm 参考关注线。是否需要处理由治疗团队判断；这里只提示“值得报告”。' : '虚线为 2cm 参考关注线（提示进一步评估的常用阈值，具体口径待专业确认）。'}</p>
    </div>
    <div class="actions" style="flex-direction:column;align-items:stretch">
      ${btn('＋ 记录一次测量', 'add-arm', 'primary')}
      ${btn('记录症状', 'symptom', 'soft')}
      ${go('记一句我的看法 →', 'care', '就诊准备', 'text-button')}
      ${pill('同一测量协议 · 可比较', 'green')}
    </div>
  </div>
  <section class="card" style="margin-bottom:14px">
    <div class="card-head"><div><h3>臂围差趋势</h3><p>每次取四点位差值最大值 · 参考线 2cm（需专业确认）</p></div>${pill('模拟数据', 'grey')}</div>
    <div class="chart-wrap">${armChart()}</div>
    <p class="small-note scroll-hint">图表可左右滑动，查看完整时间轴</p>
  </section>
  <div class="grid two" style="margin-bottom:14px">
    <section class="card"><div class="card-head"><h3>测量记录</h3><span class="pill green">${ARM_PROTOCOL.label}</span></div>
      <div class="table-wrap"><table class="measure-table"><thead><tr><th>日期</th><th>腕横纹</th><th>前臂中段</th><th>肘上 10cm</th><th>腋下 10cm</th><th>最大差<br><span style="font-weight:500">cm</span></th></tr></thead><tbody>
        ${ARM.slice().reverse().map((a) => `<tr><td>${longDate(a.d)}</td>${ARM_PROTOCOL.points.map((p) => `<td class="num">${fmtNum(armDiff(a, p), 1)}</td>`).join('')}<td class="num"><b>${fmtNum(armMax(a), 1)}</b></td></tr>`).join('')}
      </tbody></table></div>
      <p class="small-note">表内为患侧减健侧的差值（cm）。原始两侧数值在详情里，可回源到测量记录。</p>
    </section>
    <section class="card"><div class="card-head"><h3>症状与功能</h3>${btn('＋ 记录', 'symptom', 'text-button')}</div>
      ${state.symptoms.filter((s) => s.code === 'le_symptom').slice(0, 2).map((s) => `<div class="saved-item"><b>强度 ${s.level}/3 · ${esc(s.label)}</b><p>${esc(s.note)}</p><small>${longDate(s.d)}</small></div>`).join('')}
      <div class="divider"></div>
      <h3 style="font-size:12.5px">哪些情况先联系治疗团队</h3>
      <div class="flag-list"><div>手臂突然明显肿胀、发红发热或疼痛加重</div><div>抬臂明显受限，影响穿衣、梳头</div><div>皮肤有破损、感染或反复丹毒样发作</div></div>
      <p class="small-note">以上是沟通提示，不是急诊分诊规则；出现呼吸困难、胸痛等情况请按当地急救流程处理。</p>
    </section>
  </div>
  ${section('患肢保护与护理要点', '来自已存专业建议；工作台不生成新的护理处方。')}
  <section class="card"><div class="grid two">
    <div class="advice"><b>避免患肢抽血、输液、测血压</b><p>除非治疗团队另有安排；就诊时主动说明手术侧别。</p><small>来源：出院康复指导 · 2026-01-25 · 待专业复核</small></div>
    <div class="advice"><b>皮肤护理：防晒、防蚊虫、防割伤</b><p>做家务戴手套；出现红肿热痛及时说明，不自行热敷或按摩。</p><small>来源：康复科门诊记录 · 2026-02-03 · 待专业复核</small></div>
  </div>
  <p class="small-note">压力袖套的压力等级、佩戴时长、手法引流等，均需由淋巴水肿专科/康复治疗师个体化给出；工作台不提供这些参数。</p></section>`;
}

function armChart() {
  const w = 900, h = 240, L = 52, R = 20, T = 22, B = 34;
  const lo = 0, hi = 2.6;
  const t0 = Date.parse(ARM[0].d), t1 = Date.parse(ARM[ARM.length - 1].d) || t0 + 86400000;
  const x = (d) => L + (Date.parse(d) - t0) / Math.max(1, t1 - t0) * (w - L - R);
  const y = (v) => h - B - (v - lo) / (hi - lo) * (h - T - B);
  const pts = ARM.map((a) => ({ d: a.d, v: armMax(a) }));
  const coords = pts.map((p) => ({ x: x(p.d), y: y(p.v) }));
  const path = smoothPath(coords);
  const area = `${path} L ${coords[coords.length - 1].x} ${h - B} L ${coords[0].x} ${h - B} Z`;
  return `<svg class="arm-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="患健侧臂围差四次记录：0.3、0.5、1.1、1.8 厘米">
    ${[0, 0.5, 1, 1.5, 2, 2.5].map((v) => `<line x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}" stroke="#f3e8ec"/><text x="${L - 8}" y="${y(v) + 3}" text-anchor="end" class="tick">${v}</text>`).join('')}
    <line x1="${L}" x2="${w - R}" y1="${y(2)}" y2="${y(2)}" stroke="#d8a6b6" stroke-dasharray="5 5"/>
    <text x="${L + 8}" y="${y(2) - 6}" text-anchor="start" font-size="10" fill="#a9788a" class="ref-label">参考关注线 2cm（需专业确认）</text>
    <path d="${area}" fill="#c2416b" opacity=".07"/>
    <path d="${path}" fill="none" stroke="#a8410a" stroke-width="2.6" stroke-linecap="round" pathLength="1" class="line"/>
    ${coords.map((c, i) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${i === coords.length - 1 ? 5 : 3.8}" fill="#a8410a" stroke="#fff" stroke-width="1.8" class="pt" style="animation-delay:${i * 50}ms"><title>${longDate(pts[i].d)} · ${pts[i].v} cm</title></circle>
      ${i === 0 ? '' : `<text x="${c.x.toFixed(1)}" y="${c.y - 11}" text-anchor="middle" font-size="10.5" fill="#a8410a" font-weight="600">${pts[i].v}</text>`}
      <text x="${c.x.toFixed(1)}" y="${h - 12}" text-anchor="middle" class="tick">${shortDate(pts[i].d)}</text>`).join('')}
  </svg>`;
}

/* ---------------- questions & exports ---------------- */
function viewpointsCard() {
  const list = state.viewpoints.map((v) => `<div class="saved-item"><p>${esc(v.text)}</p>
    <small>${longDate(v.d)} · ${v.role === 'patient' ? '本人' : '照护者'}记录 · 这是一条看法，不是医生结论</small></div>`).join('');
  return `<section class="card" style="margin-bottom:14px">
    <div class="card-head"><div><h3>我的看法与担心</h3><p>只作为一条信息保留，方便你说明；不进入趋势、不写进摘要的事实区，也不参与任何判断。</p></div>${pill('不是医生结论', 'grey')}</div>
    ${list || '<div class="empty" style="margin-top:8px"><p>还没有记录。想到什么就写一句，不需要整理好。</p></div>'}
    <form id="viewpoint-form" style="margin-top:12px"><label><span class="form-label">记一句我的看法</span>
      <input name="viewpoint" maxlength="200" placeholder="例如：我觉得这条手臂比上个月沉"></label>
      <div class="form-actions"><button type="submit">＋ 记一条</button></div></form>
    <p class="small-note">诊断与处理由治疗团队判断。这里记的是你的感受与想法，导出时会单独标注。</p></section>`;
}
function questionsBody(withSuggest = false) {
  const suggest = withSuggest ? `<div class="notice warn"><b>根据最近记录生成的建议问题</b><br>已加入下方清单，可编辑或删除；工作台不替你判断是否需要处理。
    <div class="actions" style="margin-top:8px">${btn('＋ 从臂围趋势生成', 'gen-arm-q', 'soft')}${btn('＋ 从关节痛生成', 'gen-joint-q', 'soft')}</div></div>` : '';
  return `${suggest}<div class="notice pink">模拟问题清单 · 可编辑、选择、删除。导出只包含勾选的问题，不含病历或私密记录。<br>「我的看法」只作为一条信息记录，导出时单独分区，不写成结论。</div>
    <div class="question-list">${state.questions.map((q) => `<div class="saved-item"><div style="display:flex;gap:10px;align-items:flex-start">
      <input type="checkbox" data-q-select="${q.id}" aria-label="选入问题：${esc(q.text)}" ${q.selected ? 'checked' : ''} style="width:16px;height:16px;margin-top:4px;flex:0 0 16px">
      <div style="flex:1"><textarea data-q-edit="${q.id}" aria-label="编辑就诊问题" style="min-height:60px">${esc(q.text)}</textarea>
        <small>${esc(q.source)}</small>${q.kind === 'view' ? ' <span class="pill grey" style="margin-left:6px">我的看法 · 不是医生结论</span>' : ''}</div>
      ${btn('×', 'delete-question', 'icon-button', `data-id="${q.id}" aria-label="删除此问题"`)}</div></div>`).join('')}</div>
    ${!state.questions.length ? '<div class="empty"><p>问题清单为空，可以从下面添加一个。</p></div>' : ''}
    <form id="question-form" style="margin-top:16px"><label><span class="form-label">再加一条</span><textarea name="question" required maxlength="500" placeholder="用自己的话写下来"></textarea></label>
    <div class="form-actions" style="align-items:center;gap:14px;flex-wrap:wrap">
      <label style="display:flex;flex-direction:row;align-items:center;gap:6px;font-size:12px;white-space:nowrap"><input type="radio" name="qkind" value="fact" checked> 想问的事</label>
      <label style="display:flex;flex-direction:row;align-items:center;gap:6px;font-size:12px;white-space:nowrap"><input type="radio" name="qkind" value="view"> 我的看法 / 担心</label>
      <button type="submit">＋ 加入清单</button></div>
    <p class="small-note">选「我的看法」时，这句话会标注为本人观点，不作为事实或结论使用。</p></form>`;
}
function questionsModal() {
  openModal('下次就诊，想问的事', questionsBody(true), `${btn('稍后继续', 'close')}${btn('下载所选问题 · Markdown', 'download', 'primary')}`);
}
function review() {
  const sub = state.sub.review || SUBPAGES.review[0]; let body = '';
  if (sub === '问题清单') body = `<div class="card"><div class="card-head"><h2>就诊问题清单</h2>${btn('编辑与导出', 'questions', 'primary')}</div>
    ${state.questions.map((q) => `<div class="row"><div><b>${esc(q.text)}</b><p>${esc(q.source)}</p></div>${q.kind === 'view' ? pill('我的看法', 'grey') : ''}${pill(q.selected ? '已选入' : '未选入', q.selected ? 'green' : 'grey')}</div>`).join('') || '<p>暂无问题。</p>'}</div>`;
  else if (sub === '已保留结果') body = `<div class="card"><h2>保留的准备结果</h2>
    ${state.saved.length ? state.saved.map((s) => `<div class="saved-item"><b>${esc(s.title)}</b><p>${esc(s.note)}</p></div>`).join('') : '<div class="empty" style="margin-top:16px"><h3>还没有保留的结果</h3><p>导出问题后，会在这里留一条记录。</p></div>'}</div>`;
  else body = `<div class="grid two"><section class="card"><h2>报告</h2><p>当前可下载模拟问题清单的 Markdown 文件；其他格式未实现。</p>${btn('预览问题并下载', 'questions', 'primary')}</section>
    <section class="card"><h2>原生 Agent 任务</h2><p>此原型未连接 DSH 或模型，不会创建会话或读取目录。</p>${btn('预览未来发送内容', 'agent', 'soft')}</section></div>`;
  return head('收藏与回顾', SUBTITLES.review) + subnav() + body;
}

/* ---------------- clinical ---------------- */
function clinical() {
  const sub = state.sub.clinical || SUBPAGES.clinical[0]; let body = '';
  if (sub === '治疗历程') body = `<div class="notice pink">计划与实际分别保存。完成待办不会自动生成实际治疗。</div>
    <section class="card">${TREATMENTS.map((t) => `<div class="row"><div><b>${esc(t.long)}</b><p>${longDate(t.from)}${t.to !== t.from ? ' — ' + longDate(t.to) : ''} · 实际接受</p></div>${pill(t.kind === 'endo' ? '进行中' : '已完成', t.kind === 'endo' ? 'green' : 'grey')}</div>`).join('')}
    <div class="row"><div><b>下一次复查</b><p>2026-11-05 · 乳腺外科 · 时间以医院短信为准</p></div>${pill('计划', 'yellow')}</div>
    <p class="small-note">治疗记录关联原始文书；未核对材料只作草稿，不进入实际治疗列表。</p></section>`;
  else if (sub === '病理 / 分子档案') body = `<div class="card"><h2>按标本和时间保留每一份结果</h2>
    <p>病理、分子与遗传材料各有来源；没有检测、未录入和未检出分别表达。</p>
    <div class="row"><div><b>2026-01-23 · 左乳病理</b><p>浸润性导管癌 G2 · ER 90% / PR 70% / HER2 1+ / Ki-67 25% · 淋巴结 3/14</p></div>${go('查看档案', 'records', '病情档案', 'soft')}</div>
    <div class="empty"><h3>分子 / 遗传材料尚未载入</h3><p>此状态不表示结果阴性，也不提示必须检测。</p></div></div>`;
  else if (sub === '试验线索') body = `<div class="notice">以下是虚构交互条目，不是临床试验信息。没有接入登记平台或真实研究数据。</div>
    <section class="card"><div class="card-head"><h2>研究线索的查看方式</h2>${btn(state.favorite ? '已关注 ✓' : '关注示例条目', 'favorite', state.favorite ? 'soft' : 'primary')}</div>
    <h3>乳腺癌相关研究 · 示例条目 A</h3><p>原型只演示「详情 → 资料对照 → 核实问题 → 关注」的路径。研究名称、中心、状态与条件均未填入真实信息。</p>
    <div class="actions" style="margin-top:18px">${btn('查看示例详情', 'trial-detail')}${go('用我的资料对照', 'clinical', '资料对照', 'soft')}</div></section>`;
  else if (sub === '资料对照') body = `<section class="card"><h2>先列出已知和未知，交给研究中心核实</h2>
    <div class="table-wrap"><table><thead><tr><th>资料项</th><th>目前记录</th><th>需要做的沟通</th></tr></thead><tbody>
      <tr><td>病理资料</td><td>有已核对报告</td><td>核实标本与报告信息是否完整</td></tr>
      <tr><td>腋窝处理</td><td>清扫范围待确认</td><td>向手术团队核对记录</td></tr>
      <tr><td>既往治疗</td><td>手术/化疗/放疗已记录</td><td>确认周期与结束日期</td></tr>
      <tr><td>研究条件</td><td>未接入真实数据</td><td>以登记原文及中心答复为准</td></tr>
    </tbody></table></div>
    <p class="small-note">资料对照不输出适合率、匹配排名或入组结论。</p>${btn('加入核实问题', 'add-trial-question', 'primary')}</section>`;
  else if (sub === '我的关注') body = state.favorite ? `<section class="card"><h2>示例条目 A</h2><p>虚构条目 · 仅验证关注后的回顾路径。</p><div class="actions" style="margin-top:16px">${btn('查看详情', 'trial-detail')}${btn('取消关注', 'favorite', 'text-button')}</div></section>` : `<div class="empty"><h3>还没有关注的研究线索</h3><p>可以先体验一个明确标记的示例条目。</p>${go('查看示例', 'clinical', '试验线索', 'primary')}</div>`;
  else body = `<section class="card"><h2>数据来源与时效</h2>
    <div class="row"><div><b>临床试验数据</b><p>未接入。真实版本需保留登记 URL、获取日期、更新责任与过期状态。</p></div>${pill('待开发', 'grey')}</div>
    <div class="row"><div><b>个人资料</b><p>当前仅在内存中保留模拟数据；刷新重置。</p></div>${pill('原型')}</div>
    <div class="row"><div><b>康复参考线</b><p>2cm 为常用提示阈值，中国临床口径与测量规范待核验。</p></div>${pill('待核验', 'yellow')}</div>
    <p class="small-note">工作台不会把“获取成功”标成“医学已核实”。</p></section>`;
  return head('临床', SUBTITLES.clinical, btn('预览交给 Agent 的内容', 'agent')) + subnav() + body;
}

/* ---------------- nutrition & mind ---------------- */
function nutrition() {
  const sub = state.sub.nutrition || SUBPAGES.nutrition[0]; let body = '';
  if (sub === '当下困扰') body = `<div class="grid two">
    <section class="card"><span class="eyebrow">从眼前的感受开始</span><h2 style="margin-top:8px">最近吃东西，有什么不一样？</h2><p>不必先计算摄入。可以记下食欲、吃不下的原因，或已存的专业建议。</p>
      <div class="actions" style="margin-top:18px">${go('记录进食变化', 'nutrition', '进食与体重', 'primary')}${btn('整理我想问的问题', 'nutrition-question')}</div></section>
    <section class="card"><h2>已有建议，值得留好</h2><p>正式版本会保留专业建议的日期与来源；不会把模拟内容当成营养处方。</p>
      <div class="empty" style="margin-top:14px"><p>尚未保存专业建议。</p></div></section></div>`;
  else if (sub === '进食与体重') {
    const w = METRICS.weight.points;
    body = `<div class="grid two">
      <section class="card"><h2>今天，记一点就好</h2><p>以下任选一项，模拟记录只在本页保留。</p>
        <form id="nutrition-form"><div class="form-grid" style="margin-top:16px">
          <label><span class="form-label">进食情况（可不选）</span><select name="intake"><option value="">暂不记录</option><option>和平常差不多</option><option>比平常少一些</option><option>比平常少很多</option></select></label>
          <label><span class="form-label">体重 kg（选填）</span><input name="weight" type="number" step="0.1" min="1" max="400" placeholder="不填也可以"></label>
          <label class="wide"><span class="form-label">困难或想说的话（选填）</span><textarea name="note" maxlength="500" placeholder="例如：想把最近吃得少的情况告诉营养师"></textarea></label>
        </div><div class="form-actions"><button class="primary" type="submit">保存模拟记录</button></div></form></section>
      <section class="card"><h2>我的记录</h2>${state.nutrition.length ? state.nutrition.map((n) => `<div class="saved-item"><b>${esc(n.intake || '进食情况未填')}</b><p>${n.weight ? `体重 ${esc(n.weight)} kg · ` : ''}${esc(n.note || '无补充描述')}</p><small>本次原型记录 · ${esc(n.by)}</small></div>`).join('') : '<div class="empty" style="margin-top:16px"><h3>从第一条开始</h3><p>缺失不会记成零，也不影响其他功能。</p></div>'}
        <div class="divider"></div><h3 style="font-size:12.5px">体重趋势</h3>${sparkline(w, METRICS.weight.color, 1)}<p class="small-note">单点不连线；体重记录会同步到一图秀的「营养与体重」分类。</p></section></div>`;
  } else body = `<section class="card"><h2>把变化带到下一次沟通里</h2><p>已保存 ${state.nutrition.length} 条营养记录；专业建议和 AI 解释尚未接入。</p>
    ${btn('保留一个营养问题', 'nutrition-question', 'primary')}${btn('查看我的问题', 'questions', 'text-button')}</section>`;
  return head('营养支持', SUBTITLES.nutrition) + subnav() + body;
}

function mind() {
  const sub = state.sub.mind || SUBPAGES.mind[0]; let body = '';
  if (sub === '当下感受') body = `<div class="notice pink">私密空间 · 这里的内容默认不进入一图秀、就诊摘要、导出或 Agent 预览。</div>
    <div class="grid two"><section class="card"><span class="eyebrow">不必马上找到答案</span><h2 style="margin-top:8px">今天，你想给自己留些什么？</h2>
      <form id="mind-form" style="margin-top:16px"><label><span class="form-label">这条记录属于谁？</span><select name="owner"><option>患者本人</option><option>照护者自己</option></select></label>
      <label style="margin-top:14px"><span class="form-label">感受、睡眠，或者一个小小的困扰</span><textarea name="note" required maxlength="1000" placeholder="可以只写一句，也可以暂时不说。"></textarea></label>
      <div class="form-actions"><button type="button" data-action="go" data-page="dashboard">现在先不写</button><button class="primary" type="submit">私密保存（模拟）</button></div></form></section>
      <section class="card"><h2>可以慢慢来</h2><p>记录没有打卡要求，也不评价你是否“足够积极”。</p>
      <div class="private" style="margin-top:16px"><h3>照护者，也值得被照顾</h3><p style="font-size:11.5px;margin-top:4px">家属自己的感受单独保留，不写成患者的症状。</p></div>
      ${go('看看支持资源 →', 'mind', '支持资源', 'text-button')}</section></div>`;
  else if (sub === '我的记录') body = `<section class="card"><div class="card-head"><h2>只留给记录主体的内容</h2>${pill('私密', 'pink')}</div>
    ${state.moods.length ? state.moods.map((m) => `<div class="saved-item private"><b>${esc(m.owner)}</b><p>${esc(m.note)}</p><small>模拟记录 · 未进入分享或导出</small></div>`).join('') : '<div class="empty"><h3>这里还没有记录</h3><p>不记录也可以使用其他帮助。</p></div>'}</section>`;
  else if (sub === '支持资源') body = `<div class="grid two"><section class="card"><h2>如何向别人表达我需要帮助</h2><p>先从自己的话开始：眼前最困扰的是什么，希望别人帮哪一件事。</p>${btn('整理一个求助问题', 'support-question', 'primary')}</section>
    <section class="card"><h2>支持资源的位置</h2><p>真实版本需要核实地区、服务范围、开放时间与更新日期。本原型未接入转介、真人咨询或危机服务。</p>${btn('查看资源设计说明', 'resource-info', 'text-button')}</section></div>`;
  else body = `<div class="notice pink">这些话题默认私密，只有你主动选择才会进入分享。</div>
    <div class="grid three">${[['身体形象', '术后外观、穿衣、照镜子时的感受。'], ['亲密关系', '性欲变化、疼痛、伴侣沟通；可以只记不分享。'], ['生育与月经', '化疗后月经变化、生育力保存的转介问题。']].map(([t, d]) => `<section class="card"><h3>${t}</h3><p style="font-size:11.5px;margin-top:5px">${d}</p>${btn('留一个私密问题 →', 'private-question', 'text-button', `data-topic="${t}"`)}</section>`).join('')}</div>`;
  return head('心理支持', SUBTITLES.mind) + subnav() + body;
}

/* ---------------- render ---------------- */
function render() {
  const prof = PROFILES.find((p) => p.id === state.profileId) || PROFILES[0];
  $('#profile-avatar').textContent = prof.name.slice(0, 1);
  $('#profile-name').textContent = `${prof.name}的资料`;
  $('#profile-meta').textContent = `${prof.tag} · ${prof.side}侧`;
  $('#nav').innerHTML = PAGES.map(([id, label, ic]) => `<button class="nav-button" data-action="go" data-page="${id}" ${state.page === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></button>`).join('');
  $('#breadcrumb').textContent = PAGES.find((p) => p[0] === state.page)[1];
  const map = { dashboard, records, timeline: timelinePage, clinical, nutrition, mind, care, review };
  $('#main').innerHTML = `<div class="page-enter">${map[state.page]()}</div>`;
  paintReady();
  paintVersion();
}

function updateTimeline() {
  const panel = $('#chart-panel');
  if (!panel) return;
  panel.outerHTML = chartPanel();
}

/* ---------------- actions ---------------- */
function addQuestion(text, source = '本人添加 · 模拟问题', kind = 'fact') {
  state.questions.push({ id: uid('q'), text, source, selected: true, kind });
  toast(kind === 'view' ? '已作为一条「我的看法」保存，不会被当成结论' : '已加入问题清单，可在收藏与回顾中编辑');
  if ($('#dialog').open) questionsModal(); else render();
}
function addViewpoint(text) {
  state.viewpoints.push({ id: uid('v'), d: DATA_END, text, role: 'patient' });
  toast('已记下这句看法；它只作为一条信息，不进入趋势或结论');
  render();
}
function source(name) {
  openModal('材料原文 · 模拟示例', `<div class="notice">这不是实际报告。以下内容为交互测试编写，不代表个人病情。</div>
    <article style="font-size:13px;line-height:1.8"><h3>${esc(name || '材料')}</h3><p style="color:var(--muted);font-size:11.5px">【模拟材料 / 第 1 页】</p>
    <p>本页用于演示来源回溯。报告名称、日期、标本信息或治疗记录应与对应字段关联，而不是分散存在每个页面。</p>
    <p>示例摘录：放疗部位「胸壁 + 锁骨上」，共 25 次，结束日期手写不清；腋窝处理原文仅写“清扫”，未注明范围。</p>
    <p>所有内容均为虚构，无真实机构、身份或患者记录。</p></article>`, btn('返回工作台', 'close', 'primary'));
}
function addTask() {
  openModal('添加一项安排', `<form id="task-form"><label><span class="form-label">安排内容</span><input name="title" required maxlength="120" placeholder="例如：整理下次就诊的问题"></label>
    <label style="margin-top:14px"><span class="form-label">日期</span><input type="date" name="date" required value="2026-10-20"></label>
    <label style="margin-top:14px"><span class="form-label">补充说明（选填）</span><textarea name="note" maxlength="500" placeholder="这项安排来自哪里？还有什么需要确认？"></textarea></label></form>`,
    `${btn('取消', 'close')}<button type="submit" form="task-form" class="primary">保存模拟安排</button>`);
}
function agent() {
  openModal('交给原生 Agent 之前', `<div class="notice">原型未接入 DSH、AI 或任何外部服务。下面只预览内容，不会发送。</div>
    <h3>拟定任务</h3><p>请根据本次选择的资料，帮助整理需要进一步核实的问题。</p>
    <details open><summary>本次内容范围</summary><ul style="font-size:12.5px;line-height:1.8">
      <li>当前业务页面：${esc(PAGES.find((p) => p[0] === state.page)[1])}</li>
      <li>模拟材料目录，共 ${state.docs.length} 份；不读取实际文件</li>
      <li>上肢测量 ${ARM.length} 次（含四点位差值）</li>
      <li>患者/照护者的私密心理与性健康记录不加入</li>
      <li>未核对内容保留草稿状态与来源</li></ul></details>
    <p class="small-note">一期 AI 只做整理与提问；解释性建议为二期开关，默认关闭。</p>`,
    `${btn('返回', 'close')}<button disabled>未接入，无法发送</button>`);
}

const actions = {
  go: (el) => { if ($('#dialog').open) closeModal(); navigate(el.dataset.page, el.dataset.sub); },
  sub: (el) => { state.sub[state.page] = el.dataset.sub; render(); },
  close: closeModal,
  questions: questionsModal,
  source: (el) => source(el.dataset.source),
  agent,
  flip: (el) => {
    const code = el.dataset.code;
    if (state.flipped.has(code)) state.flipped.delete(code); else state.flipped.add(code);
    const on = state.flipped.has(code);
    el.setAttribute('aria-pressed', String(on));
    const m = METRICS[code]; const last = m.points[m.points.length - 1];
    el.setAttribute('aria-label', `${m.name}，${fmtNum(last.v, m.dec)} ${m.unit}，${longDate(last.d)}；${on ? '点击返回摘要' : `点击翻转查看最近 ${m.points.length} 次记录`}`);
  },
  pin: (el) => {
    const code = el.dataset.code, d = el.dataset.d;
    if (state.pin && state.pin.code === code && state.pin.d === d) state.pin = null; else state.pin = { code, d };
    $$('#timeline-svg .pt').forEach((c) => c.classList.toggle('active', !!state.pin && c.dataset.code === state.pin.code && c.dataset.d === state.pin.d));
    const slot = $('#pin-slot'); if (slot) slot.innerHTML = pinHTML();
  },
  unpin: () => { state.pin = null; $$('#timeline-svg .pt').forEach((c) => c.classList.remove('active')); const s = $('#pin-slot'); if (s) s.innerHTML = pinHTML(); },
  'task-toggle': (el) => { const t = state.tasks.find((x) => x.id === el.dataset.id); t.done = !t.done; render(); toast(t.done ? '安排已完成；不会生成治疗记录' : '已重新打开安排'); },
  'add-task': addTask,
  'load-report': () => {
    if (state.parsing) return;
    if (state.loaded) { toast('模拟报告已载入，没有重复新增'); return; }
    state.parsing = true; state.parseError = false; render();
    setTimeout(() => { state.docs.push({ id: 'd6', name: '复查记录 · 新模拟报告', date: '2026-10-16', type: '其他', status: '待核对' }); state.loaded = true; state.parsing = false; render(); toast('模拟材料整理完成，可查看草稿'); }, 900);
  },
  'parse-fail': () => { state.parseError = true; render(); },
  retry: () => { state.parseError = false; toast('模拟重试完成；原件始终保留'); render(); },
  candidate: (el) => {
    const c = state.candidates.find((x) => x.id === el.dataset.id);
    openModal('核对这一项内容', `<div class="notice">核对表示转录已检查，不等于医学专业审核。</div>
      <form id="candidate-form" data-id="${c.id}"><label><span class="form-label">${esc(c.name)}</span><input name="value" value="${esc(c.value)}" required maxlength="160"></label>
      <p class="small-note">来源：${esc(c.source)}。如暂时不清楚，可保留待核对状态。</p></form>
      ${btn('查看原文 ↗', 'source', 'text-button', `data-source="${esc(c.source)}"`)}`,
      `${btn('现在先不核对', 'close')}<button form="candidate-form" type="submit" class="primary">接受这项模拟记录</button>`);
  },
  'add-review-question': () => addQuestion('请帮我核实放疗小结中的结束日期、部位和腋窝清扫范围。', '整理草稿衍生 · 核实问题'),
  symptom: () => openModal('记录一点身体变化', `<form id="symptom-form">
      <label><span class="form-label">哪一类</span><select name="code"><option value="le_symptom">上肢沉重 / 紧绷 / 肿胀</option><option value="ai_joint">关节痛 / 僵硬</option><option value="hot_flash">潮热 / 盗汗</option><option value="fatigue">疲乏</option><option value="skin_rxn">放疗区皮肤反应</option></select></label>
      <label style="margin-top:14px"><span class="form-label">强度（0 没有 – 3 明显影响日常）</span><input name="level" type="range" min="0" max="3" step="1" value="1" style="padding:0"></label>
      <label style="margin-top:14px"><span class="form-label">发生了什么（时间、位置、什么时候更明显）</span><textarea name="note" required maxlength="500" placeholder="例如：下午更明显，抬手会轻一些"></textarea></label>
      <p class="small-note">这是本人自述；原型不评估症状或给出处理方案。</p></form>`,
      `${btn('取消', 'close')}<button type="submit" form="symptom-form" class="primary">保存模拟记录</button>`),
  'add-arm': () => openModal('记录一次四点位测量', `<form id="arm-form">
      <div class="form-grid"><label><span class="form-label">日期</span><input type="date" name="date" required value="2026-10-17"></label>
      <label><span class="form-label">测量人</span><select name="by"><option>本人 + 家属</option><option>本人</option><option>康复治疗师</option></select></label></div>
      <p class="small-note" style="margin:10px 0 6px">${ARM_PROTOCOL.label} · 同一体位、同一位置成对测量。单位 cm。</p>
      <div class="table-wrap"><table><thead><tr><th>点位</th><th>患侧（左）</th><th>健侧（右）</th><th>差值</th></tr></thead><tbody>
      ${ARM_PROTOCOL.points.map((p) => `<tr><td>${ARM_POINT_LABEL[p]}</td><td><input name="${p}_l" type="number" step="0.1" min="5" max="80" placeholder="—"></td><td><input name="${p}_r" type="number" step="0.1" min="5" max="80" placeholder="—"></td><td class="num" data-diff="${p}">—</td></tr>`).join('')}
      </tbody></table></div>
      <p class="small-note">至少填一对。工作台只计算差值，不判断水肿分期或是否异常。</p></form>`,
      `${btn('取消', 'close')}<button type="submit" form="arm-form" class="primary">保存并同步到一图秀</button>`),
  'add-drain': () => openModal('记录引流量', `<form id="drain-form"><div class="form-grid">
      <label><span class="form-label">日期</span><input type="date" name="date" required value="2026-10-17"></label>
      <label><span class="form-label">引流量 mL</span><input name="v" type="number" min="0" max="2000" required placeholder="例如 45"></label>
      <label class="wide"><span class="form-label">性状 / 备注（选填）</span><input name="note" maxlength="100" placeholder="例如：淡血性"></label></div>
      <p class="small-note">这不是术后带管期演示之外的记录；原型不判断是否异常。</p></form>`,
      `${btn('取消', 'close')}<button type="submit" form="drain-form" class="primary">保存模拟记录</button>`),
  settings: () => settingsModal('store'),
  about: () => aboutModal(),
  'open-store': () => settingsModal('store'),
  'start-session': () => {
    /* 规范 §6：需要保存文件或创建工作区时，必须先由用户选目录；不能静默建目录 */
    if (!state.cfg.root) {
      openModal('先选资料位置，再开始对话',
        `<div class="notice plain">这一步的顺序是固定的：<b>先由你在系统选择器里选定目录，再创建会话</b>。工作台不会在默认位置、用户主目录或当前仓库里静默新建文件夹。</div>
         <div class="row"><div><b>第一步 · 选择资料位置</b><p>原件、解析派生文件与数据库都放在你选的目录</p></div>${btn('选择目录', 'pick-dir', 'soft')}</div>
         <div class="row"><div><b>第二步 · 创建会话</b><p>开场草稿写好但不代发，由你确认后发送</p></div>${pill('待第一步完成', 'grey')}</div>
         <div class="notice warn">取消不会留下空目录、空项目、工作区、会话或绑定。</div>`,
        btn('稍后再说', 'close'));
      return;
    }
    const drafts = {
      '刚确诊': '我刚拿到确诊结果，想先把病理报告看明白，再列几个下次门诊要问的问题。',
      '术前治疗': '我在术前治疗阶段，想记录每次用药后的反应，并整理下次复诊要问的事。',
      '术后恢复': '我想先把术后伤口、引流和上肢的情况记下来，复诊时能说清楚。',
      '放疗期间': '我在放疗期间，想记录皮肤反应和疲劳程度，看看有没有规律。',
      '内分泌治疗': '我在内分泌治疗期间，想记录手指晨僵和上肢的感受，整理成复诊要问的问题。',
      '随访': '我在随访期，想把最近的检查和上肢测量放到一起看，看看有没有变化。'
    };
    state.session = { started: '14:31', draft: drafts[state.stage] || drafts['随访'] };
    render();
    openModal('会话已创建 · 未发送任何内容',
      `<div class="notice plain">已在 <code>${esc(state.cfg.root)}</code> 下创建<b>本工作台的会话</b>并登记归属。下面是按「${esc(state.stage)}」生成的开场草稿，<b>不会自动发送</b>。</div>
       <div class="row"><div><b>开场草稿（可改）</b><p>${esc(state.session.draft)}</p></div>${pill('待你发送', 'yellow')}</div>
       <div class="row"><div><b>会话归属</b><p>小粉宝工作台 · 绑定该资料位置；切换工作台不会串会话</p></div>${pill('已登记', 'green')}</div>
       <p class="small-note">原型不真的创建 DSH 工作区与会话。真实版本走宿主接口，由宿主校验目录与归属。</p>`,
      `${btn('关闭', 'close')}${btn('模拟发送（演示）', 'send-draft', 'primary')}`);
  },
  'send-draft': () => { closeModal(); toast('已发送开场草稿（演示）；对话在宿主侧，工作台只负责资料与记录'); },
  'session-info': () => openModal('工作台对话 · 进行中',
    `<div class="notice plain">对话本身由 DSH 宿主提供，工作台不复制聊天界面。这里只显示归属与会话状态，消息在宿主会话面板里看。</div>
     <div class="row"><div><b>状态</b><p>${esc(state.session ? state.session.started : '—')} 开始 · 归属小粉宝工作台</p></div>${pill('进行中', 'green')}</div>
     <div class="row"><div><b>资料位置</b><p><code>${esc(state.cfg.root || '未设置')}</code></p></div>${pill(state.cfg.root ? '已激活' : '未设置', state.cfg.root ? 'green' : 'grey')}</div>
     <div class="row"><div><b>结束会话后</b><p>资料、记录、问题清单都留在原位置；会话不代你删除业务数据</p></div></div>`,
    btn('关闭', 'close')),
  profiles: () => openModal('演示档案 · 5 套画像', `<div class="notice warn">这五套用来覆盖边界，不是五份随机数据：全程完整 / 资料极少 / 保乳 + 前哨淋巴结 / 双侧 + 复发 / 数据冲突。原型切换时会改元数据与空态标记，<b>指标序列仍是 DEMO-1</b>，界面会明确标出，不假装五套全量数据。</div>
    ${PROFILES.map((p) => `<button class="profile-row ${p.id === state.profileId ? 'on' : ''}" data-action="use-profile" data-id="${p.id}" aria-pressed="${p.id === state.profileId}">
      <div><b>${esc(p.tag)} · ${esc(p.name)}</b><p>${esc(p.side)}侧 · ${esc(p.surgery)} · ${esc(p.stage)}</p></div>
      <span class="profile-caret" aria-hidden="true">${p.id === state.profileId ? '当前' : '切换'}</span></button>`).join('')}`,
    btn('关闭', 'close', 'primary')),
  'use-profile': (el) => {
    const p = PROFILES.find((x) => x.id === el.dataset.id);
    state.profileId = p.id; state.stage = p.stage;
    state.cfg.root = p.root;
    /* 会话归属单个业务档案：换档案后不沿用上一个档案的会话 */
    state.session = null;
    closeModal(); render();
    toast(`已切到「${p.tag}」${p.root ? '' : '；该档案未设置资料位置，对话未进入激活'}；指标序列仍为 DEMO-1 的模拟数据`);
  },
  'stage-pick': () => openModal('当前关注阶段', `<div class="notice plain">阶段由你自己选，工作台<b>不按治疗日期推断</b>。换阶段只改推荐话题，<b>不改任何记录</b>。</div>
    <div class="stage-grid">${['刚确诊', '术前治疗', '术后恢复', '放疗期间', '内分泌治疗', '随访'].map((v) => `<button data-action="stage-set" data-stage="${v}" aria-pressed="${state.stage === v}" class="${state.stage === v ? 'on' : ''}">${v}</button>`).join('')}</div>`,
    btn('取消', 'close')),
  'stage-set': (el) => {
    state.stage = el.dataset.stage; closeModal(); render();
    toast(`阶段已改为「${state.stage}」；话题随之变化，记录一条没动`);
  },
  'pick-dir': () => openModal('更改资料根目录', `<div class="notice plain">真实版本由宿主目录选择器返回绝对路径。这里演示选完之后如何校验与回显。</div>
    <button class="choice on" data-action="set-dir" data-path="/Volumes/资料盘/PinkyPal" style="width:100%;text-align:left">
      <b>/Volumes/资料盘/PinkyPal</b><p class="small-note">可用 · 剩余 84 GB · 已有 PinkyPal 结构</p></button>
    <button class="choice" data-action="set-dir" data-path="/Users/lin" style="width:100%;text-align:left;margin-top:10px">
      <b>/Users/lin</b><p class="small-note">应被拒绝：不能把用户主目录当作资料根</p></button>
    <p class="small-note" style="margin-top:12px">拒绝规则：根目录、用户主目录、桌面根目录、不可写路径。拒绝必须给可读原因，不能静默失败。</p>`,
    btn('取消', 'close')),
  'set-dir': (el) => {
    const p = el.dataset.path;
    if (p === '/' || p === '/Users/lin' || /\/Desktop$/.test(p)) { toast('已拒绝：请选择主目录下的子目录'); return; }
    const wasEmpty = !state.cfg.root;
    state.cfg.root = p; settingsModal('store');
    render();
    toast(wasEmpty ? '资料位置已激活；现在可以开始对话（首页第二个状态）' : '路径已更新；下次导入生效，已有记录不搬家');
  },
  'mineru-show': () => { state.cfg.showToken = !state.cfg.showToken; settingsModal('parse'); },
  'mineru-guide': () => { const g = $('#mineru-guide'); if (g) g.hidden = !g.hidden; },
  'ext-link': () => openModal('即将打开外部链接', `<p>去向：<code>https://mineru.net/token</code>（MinerU 官方 Token 申请页）。</p>
    <p class="small-note" style="margin-top:10px">原型不真正打开外链。真实版本会先在系统浏览器确认，且不把患者信息带进 URL。</p>`, btn('返回', 'close', 'primary')),
  consent: (el) => {
    state.cfg.consent = el.checked; settingsModal('parse');
    toast(el.checked ? '已开启 MinerU 云端解析；TXT/MD/CSV 仍走本地' : '已关闭；未勾选前不会上传文件');
  },
  'backup-now': () => { state.cfg.backupAt = '2026-10-17 14:20'; settingsModal('store'); toast('已创建模拟备份（原型不写盘）'); },
  'backup-restore': () => openModal('从备份恢复', `<div class="notice warn">恢复会<b>覆盖</b>当前数据库与解析派生文件，原件保留。这一步在执行前必须列出被覆盖范围并要求二次确认。</div>
    <div class="row"><div><b>将被覆盖</b><p>业务数据库、指标记录、测量记录、问题清单草稿</p></div></div>
    <div class="row"><div><b>不受影响</b><p>资料原件、备份文件本身</p></div></div>`,
    `${btn('取消', 'close')}${btn('确认恢复（演示）', 'confirm-restore', 'primary')}`),
  'confirm-restore': () => { closeModal(); toast('原型不执行恢复；真实版本此处必须写审计记录'); },
  'db-import': () => { state.cfg.dbStatus = '已归档 · 1,284 条'; state.cfg.dbChecked = '2026-10-17 14:20'; settingsModal('clinic'); toast('已导入模拟离线库；真实版本需校验来源与日期'); },
  'db-check': () => { state.cfg.dbChecked = '2026-10-17 14:20 · 检查失败（原型未联网）'; settingsModal('clinic'); toast('检查失败：未联网。失败原因要如实显示，不假装已更新'); },
  favorite: () => { state.favorite = !state.favorite; render(); toast(state.favorite ? '已关注虚构示例，可在「我的关注」回顾' : '已取消关注示例'); },
  'trial-detail': () => openModal('研究条目详情 · 虚构示例', `<div class="notice">条目 A 仅用于交互设计，不是真实研究，不含可用登记号或研究中心。</div>
    <div class="row"><div><b>研究状态</b><p>未接入真实信息</p></div></div>
    <div class="row"><div><b>登记来源</b><p>未来需保留原始 URL 与更新日期</p></div></div>
    <div class="row"><div><b>参与条件</b><p>由登记原文及研究中心核实</p></div></div>
    <div class="row"><div><b>你的材料</b><p>病理已核对；腋窝处理范围待确认</p></div></div>`,
    `${btn('返回', 'close')}${go('查看资料对照', 'clinical', '资料对照', 'primary')}`),
  'add-trial-question': () => addQuestion('向研究中心询问：还需要提供哪些资料来核实参与条件？', '虚构条目 A · 待核实问题'),
  'nutrition-question': () => addQuestion('最近进食变化，我需要向医生或营养师说明哪些情况？', '本人选择 · 营养沟通'),
  'support-question': () => addQuestion('我希望和专业人员谈谈最近的感受，可以怎样获得合适的支持？', '本人主动保留 · 不含私密记录'),
  'topic-question': (el) => addQuestion(`关于${el.dataset.topic}，我希望询问有哪些适合进一步讨论的支持方式。`, '本人选择 · 长期生活'),
  'private-question': (el) => addQuestion(`关于${el.dataset.topic}，我想单独和医生讨论，可以怎样安排？`, '私密话题 · 不含记录内容'),
  'gen-arm-q': () => addQuestion(`左上肢臂围差 ${fmtNum(armMax(latestArm()), 1)}cm（10.14），是否需要转介淋巴水肿专科评估？`, '上肢测量衍生'),
  'gen-joint-q': () => addQuestion('来曲唑治疗期间手指晨僵约 20 分钟，是否需要评估或调整？', '副作用记录衍生'),
  'resource-info': () => openModal('支持资源如何进入工作台', `<p>真实版本将按地区、服务范围、联系方式、获取日期及核实状态维护资源。</p><p style="margin-top:12px">目前没有接入真人服务、在线监护或危机评估；此处演示资源说明与返回路径。</p>`, btn('返回', 'close', 'primary')),
  'stage-help': () => openModal(`${state.stage} · 可以做什么`, `<p>这个阶段没有“必须完成”的清单。可以先选一件：</p>
    <div class="grid" style="margin-top:14px">${go('看看这一阶段的记录重点', 'care', state.stage === '术后恢复' ? '术后恢复' : '近期安排', 'soft')}${go('量一次上肢围度', 'care', '上肢与淋巴水肿', 'soft')}${btn('留一个想问的问题', 'questions', 'soft')}</div>
    <div class="row" style="margin-top:14px"><div><b>当前阶段：${esc(state.stage)}</b><p>阶段由你选择，工作台不根据治疗日期自动推断，也不会因此隐藏其他模块</p></div>${btn('改阶段', 'stage-pick', 'text-button')}</div>`, btn('返回', 'close')),
  'delete-question': (el) => { state.questions = state.questions.filter((q) => q.id !== el.dataset.id); questionsModal(); render(); toast('已删除这个模拟问题'); },
  download: () => {
    const qs = state.questions.filter((q) => q.selected);
    if (!qs.length) { toast('请先选择至少一个问题'); return; }
    if (qs.some((q) => !q.text.trim())) { toast('请补充所选空白问题，或取消选入'); return; }
    const facts = qs.filter((q) => q.kind !== 'view');
    const views = qs.filter((q) => q.kind === 'view');
    const text = `# 小粉宝 · 模拟就诊问题清单\n\n交互原型 v0.4 · 全部为模拟资料，不包含真实病历、心理或性健康记录。\n生成时间：${DATA_END} · 数据截止：${DATA_END}\n\n` +
      `## 一、想问的事\n\n` + (facts.length ? facts.map((q, i) => `${i + 1}. ${q.text}\n   来源：${q.source}`).join('\n\n') : '（本次未选入）') +
      `\n\n## 二、我的看法与担心\n\n> 以下是我的看法与担心，**不是医生结论**，只作为一条信息供沟通参考。\n\n` +
      (views.length || state.viewpoints.length
        ? views.map((q, i) => `${i + 1}. ${q.text}`).join('\n') + (state.viewpoints.length ? '\n' + state.viewpoints.map((v) => `- ${v.text}（${v.d} · ${v.role === 'patient' ? '本人' : '照护者'}记录）`).join('\n') : '')
        : '（本次无）') +
      `\n\n---\n附：上肢测量摘要（模拟）\n` + ARM.map((a) => `${a.d} 最大差值 ${armMax(a)} cm`).join('\n') +
      `\n\n口径说明：差值取四点位最大值，同一测量协议内可比；2cm 为参考关注线，不是诊断标准。`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = '小粉宝-模拟就诊问题清单.md'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    state.saved.push({ title: '模拟问题清单已导出', note: `本次选入 ${facts.length} 个问题、${views.length} 条看法；历史导出不随之后编辑改写。` });
    toast('已生成模拟问题清单文件'); render();
  },
  help: () => openModal('这版可以怎样体验', `<ol style="font-size:12.5px;line-height:1.9;padding-left:18px">
    <li>看板 → 点「左上肢臂围差」提醒，进入上肢与淋巴水肿。</li>
    <li>记录一次四点位测量，看它同步到趋势图与一图秀。</li>
    <li>一图秀：左侧加减指标、切时间范围、拖缩放；点数据点固定详情。</li>
    <li>指标卡片：点任意一张，原地翻转看最近几次，其他卡不受影响。</li>
    <li>术后恢复：切换阶段，看话题随阶段变化。</li>
    <li>收藏与回顾 → 问题清单 → 下载 Markdown。</li></ol>
    <p class="small-note">全部数据在内存中，刷新重置；不读取实际文件，不调用 AI 或 DSH。</p>`, btn('开始体验', 'close', 'primary'))
};

/* ---------------- events ---------------- */
document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (el) { const fn = actions[el.dataset.action]; if (fn) fn(el); return; }
  const chip = event.target.closest('[data-range],[data-toggle],[data-stage],[data-settings-tab]');
  if (!chip) return;
  if (chip.dataset.settingsTab) {
    settingsModal(chip.dataset.settingsTab);
  } else if (chip.dataset.range) {
    state.range = chip.dataset.range; state.pin = null;
    $$('[data-range]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === state.range)));
    updateTimeline();
  } else if (chip.dataset.toggle) {
    const key = chip.dataset.toggle;
    state.toggles[key] = !state.toggles[key];
    chip.setAttribute('aria-pressed', String(state.toggles[key]));
    state.pin = null; updateTimeline();
  } else if (chip.dataset.stage) {
    state.armStage = chip.dataset.stage; render();
  }
});

document.addEventListener('change', (event) => {
  const el = event.target;
  if (el.id === 'stage-select') { state.stage = el.value; toast('已切换关注阶段；不会改写病情或隐藏模块'); render(); }
  if (el.dataset.metric) {
    const code = el.dataset.metric;
    if (el.checked) {
      if (state.sel.length >= 4) { el.checked = false; toast('最多同时看 4 个指标；先取消一个再加'); return; }
      state.sel.push(code);
    } else state.sel = state.sel.filter((c) => c !== code);
    state.pin = null; updateTimeline();
  }
  if (el.dataset.qSelect) { const q = state.questions.find((x) => x.id === el.dataset.qSelect); if (q) q.selected = el.checked; }
});

document.addEventListener('input', (event) => {
  const el = event.target;
  if (el.id === 'search') { state.query = el.value; const t = $('#docs-table'); if (t) t.innerHTML = docsTable(); }
  if (el.id === 'zoom') { state.zoom = Number(el.value); const s = $('#zoom-val'); if (s) s.textContent = state.zoom + '%'; updateTimeline(); }
  if (el.dataset.qEdit) { const q = state.questions.find((x) => x.id === el.dataset.qEdit); if (q) q.text = el.value; }
  if (el.closest('#arm-form')) {
    const form = el.closest('#arm-form');
    ARM_PROTOCOL.points.forEach((p) => {
      const l = parseFloat(form.querySelector(`[name="${p}_l"]`).value), r = parseFloat(form.querySelector(`[name="${p}_r"]`).value);
      const cell = form.querySelector(`[data-diff="${p}"]`);
      if (cell) cell.textContent = Number.isFinite(l) && Number.isFinite(r) ? (l - r).toFixed(1) : '—';
    });
  }
});

/* chart hover tooltip */
document.addEventListener('pointermove', (event) => {
  const svg = event.target.closest('#timeline-svg');
  const tip = $('#chart-tip');
  if (!svg || !tip) { if (tip) tip.classList.remove('on'); return; }
  const rect = svg.getBoundingClientRect();
  const sx = rect.width / CW, sy = rect.height / CH;
  const px = event.clientX - rect.left, py = event.clientY - rect.top;
  let best = null, bd = 1e9;
  $$('.pt', svg).forEach((c) => {
    const dx = +c.getAttribute('cx') * sx - px, dy = +c.getAttribute('cy') * sy - py, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = c; }
  });
  if (!best || bd > 620) { tip.classList.remove('on'); return; }
  const m = METRICS[best.dataset.code]; const p = m.points.find((x) => x.d === best.dataset.d);
  tip.innerHTML = `<b>${esc(m.name)}</b> ${fmtNum(p.v, m.dec)} ${esc(m.unit)}<br><span style="opacity:.75">${longDate(p.d)} · ${esc(p.src)}</span>`;
  tip.style.left = (+best.getAttribute('cx') * sx) + 'px';
  tip.style.top = (+best.getAttribute('cy') * sy) + 'px';
  tip.classList.add('on');
}, { passive: true });

document.addEventListener('submit', (event) => {
  const form = event.target; event.preventDefault();
  const data = new FormData(form);
  if (form.id === 'mineru-form') {
    const raw = String(data.get('token') || '').trim();
    if (!state.cfg.consent) { toast('请先勾选「我了解，启用」，否则不会调用 MinerU'); return; }
    if (!raw) { toast('请粘贴新的 Token；不填则继续使用当前 Token'); return; }
    if (!/^sk-[A-Za-z0-9_-]{6,}$/.test(raw)) { toast('401：Token 格式无效（应以 sk- 开头且长度足够）'); return; }
    state.cfg.tokenMasked = 'sk-····' + raw.slice(-4);
    state.cfg.tokenSrc = '我的 Token · 已校验';
    state.cfg.showToken = false;
    settingsModal('parse');
    toast('校验通过，已保存到本机配置（原型不写盘）');
    return;
  }
  if (form.id === 'task-form') {
    state.tasks.push({ id: uid('k'), date: String(data.get('date')), title: String(data.get('title')).trim(), note: String(data.get('note') || '本人安排 · 原型记录'), done: false });
    closeModal(); render(); toast('模拟安排已保存');
  } else if (form.id === 'candidate-form') {
    const c = state.candidates.find((x) => x.id === form.dataset.id);
    c.value = String(data.get('value')).trim(); c.status = 'accepted'; closeModal(); render(); toast('已接受这一项；其他字段状态保持原样');
  } else if (form.id === 'nutrition-form') {
    const item = { intake: String(data.get('intake') || ''), weight: String(data.get('weight') || ''), note: String(data.get('note') || '').trim(), by: '本人' };
    if (!item.intake && !item.weight && !item.note) { toast('任选一项记录，或直接返回'); return; }
    state.nutrition.unshift(item);
    if (item.weight) { METRICS.weight.points.push({ d: '2026-10-17', v: Number(item.weight), src: '本人记录' }); METRICS.weight.points.sort((a, b) => Date.parse(a.d) - Date.parse(b.d)); }
    render(); toast('已保存模拟记录' + (item.weight ? '；体重已同步到指标' : ''));
  } else if (form.id === 'mind-form') {
    state.moods.unshift({ owner: String(data.get('owner')), note: String(data.get('note')).trim() });
    state.sub.mind = '我的记录'; render(); toast('已私密保存模拟记录，不加入分享');
  } else if (form.id === 'symptom-form') {
    const code = String(data.get('code'));
    const labelMap = { le_symptom: '上肢沉重 / 紧绷', ai_joint: '关节痛 / 僵硬', hot_flash: '潮热 / 盗汗', fatigue: '疲乏', skin_rxn: '放疗区皮肤反应' };
    state.symptoms.unshift({ id: uid('s'), d: '2026-10-17', code, label: labelMap[code], level: Number(data.get('level')), note: String(data.get('note')).trim() });
    closeModal(); render(); toast('已保存模拟自述；可在不适记录里回顾');
  } else if (form.id === 'arm-form') {
    const pts = {}; let filled = 0;
    ARM_PROTOCOL.points.forEach((p) => {
      const l = parseFloat(data.get(`${p}_l`)), r = parseFloat(data.get(`${p}_r`));
      if (Number.isFinite(l) && Number.isFinite(r)) { pts[p] = [l, r]; filled++; }
    });
    if (!filled) { toast('至少填一对患侧 / 健侧数值'); return; }
    const rec = { id: uid('a'), d: String(data.get('date')), pos: ARM_PROTOCOL.label, by: String(data.get('by')), pts };
    ARM.push(rec); ARM.sort((a, b) => Date.parse(a.d) - Date.parse(b.d)); syncArm();
    closeModal(); render(); toast('已保存；已同步到一图秀与指标卡');
  } else if (form.id === 'drain-form') {
    state.drains.push({ d: String(data.get('date')), v: Number(data.get('v')), note: String(data.get('note') || '—') });
    state.drains.sort((a, b) => Date.parse(a.d) - Date.parse(b.d));
    closeModal(); render(); toast('模拟引流量已保存');
  } else if (form.id === 'question-form') {
    const text = String(data.get('question')).trim();
    if (!text) { toast('请写下一个问题'); return; }
    const kind = String(data.get('qkind') || 'fact');
    addQuestion(text, kind === 'view' ? '本人看法 · 不是医生结论' : '本人添加 · 模拟问题', kind);
    questionsModal();
  } else if (form.id === 'viewpoint-form') {
    const text = String(data.get('viewpoint')).trim();
    if (!text) { toast('写一句话再保存'); return; }
    addViewpoint(text);
  }
});

$('#font-toggle').addEventListener('click', () => {
  const large = document.body.classList.toggle('large');
  $('#font-toggle').setAttribute('aria-pressed', String(large));
  $('#font-toggle').textContent = large ? '标准字 Aa' : '大字 Aa';
});

/* 直接打开某个页面：index.html#timeline 或 #care/上肢与淋巴水肿 */
function applyHash() {
  const raw = (location.hash || '').replace(/^#/, '');
  if (!raw) return false;
  const parts = raw.split('/');
  const p = decodeURIComponent(parts[0] || '');
  const s = parts[1] ? decodeURIComponent(parts[1]) : '';
  if (!PAGES.some((x) => x[0] === p)) return false;
  state.page = p;
  if (s && (SUBPAGES[p] || []).includes(s)) state.sub[p] = s;
  return true;
}
applyHash();
window.addEventListener('hashchange', () => { if (applyHash()) { render(); window.scrollTo({ top: 0 }); } });

guardBrand();
render();
