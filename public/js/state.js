/** 前端状态与数据加载。一次把读模型取齐（数据量小），写操作后整表刷新。 */
import { api } from './api.js'

export const S = {
  version: '0.12.0',
  build: '',
  ready: false,
  state: null,
  page: 'dashboard',
  sub: {},
  data: {
    overview: null, metrics: null, arm: null, documents: null, draft: null,
    questions: null, tasks: null, viewpoints: null, clinical: null, care: null,
    nutrition: null, mind: null, exports: null, symptoms: null, saved: null,
  },
  loading: false,
  error: null,
  range: 'all',
  zoom: 100,
  sel: [],
  toggles: { treatment: true, keypoints: true, changes: false },
  pin: null,
  flipped: new Set(),
  query: '',
  armStage: '术后 3 个月以上',
  busy: {},
  selQuestions: new Set(),
  selMetrics: new Set(),
  selViews: new Set(),
  draftDates: {},
}

let bootPromise = null

export async function boot() {
  if (bootPromise) return bootPromise
  bootPromise = (async () => {
    const state = await api('/api/state')
    S.state = state
    S.version = state.version ?? S.version
    S.ready = Boolean(state.ready)
    if (S.ready) await loadAll()
    return state
  })()
  return bootPromise
}

export function resetBoot() {
  bootPromise = null
}

const pickDefaultMetrics = () => {
  const series = S.data.metrics?.series ?? []
  const withData = series.filter((s) => s.points.length)
  const preferred = ['ca153', 'wbc', 'arm_diff']
  const picked = preferred.filter((code) => withData.some((s) => s.code === code))
  for (const s of withData) {
    if (picked.length >= 3) break
    if (!picked.includes(s.code)) picked.push(s.code)
  }
  return picked.length ? picked : withData.slice(0, 3).map((s) => s.code)
}

export async function loadAll() {
  S.loading = true
  S.error = null
  try {
    const [
      overview, metrics, arm, documents, draft, questions, tasks,
      viewpoints, clinical, care, nutrition, mind, exports, symptoms, saved,
    ] = await Promise.all([
      api('/api/overview'),
      api('/api/metrics'),
      api('/api/arm'),
      api('/api/documents'),
      api('/api/draft'),
      api('/api/questions'),
      api('/api/tasks'),
      api('/api/viewpoints'),
      api('/api/clinical'),
      api('/api/care'),
      api('/api/nutrition'),
      api('/api/mind'),
      api('/api/exports'),
      api('/api/symptoms'),
      api('/api/saved'),
    ])
    S.data = { overview, metrics, arm, documents, draft, questions, tasks, viewpoints, clinical, care, nutrition, mind, exports, symptoms, saved }
    if (!S.sel.length) S.sel = pickDefaultMetrics()
    if (!S.selMetrics.size) {
      for (const card of metrics.cards.filter((c) => c.hasData)) S.selMetrics.add(card.code)
    }
    if (!S.selQuestions.size) {
      for (const q of questions.list.filter((q) => q.includeInExport)) S.selQuestions.add(q.id)
    }
    if (!S.selViews.size) {
      for (const v of viewpoints.list.filter((x) => !x.isPrivate)) S.selViews.add(v.id)
    }
  } finally {
    S.loading = false
  }
}

export async function refresh() {
  if (!S.ready) return
  await loadAll()
}

/* ---------- 小工具 ---------- */

export const categoryOrder = ['肿瘤标志物', '血常规', '生化', '心功能与骨健康', '营养与体重', '康复测量', '引流']

export const STAGE_HINT = {
  newly_diagnosed: '刚拿到结果时，先把材料按来源存好，再把想问的记下来。',
  neoadjuvant: '术前治疗阶段，用药后的反应与每次复查值值得按日期记。',
  post_op: '术后阶段，伤口、引流与上肢的感受比"进度"更有用。',
  radiotherapy: '放疗期间，皮肤反应与疲劳可以按强度记，不做归因。',
  endocrine: '内分泌治疗常常很长，关节痛与潮热按强度记就够。',
  followup: '随访期，把最近的检查与上肢测量放回同一段时间里看。',
  metastatic: '这个阶段的记录以"带去讨论"为主，工作台不判断进展。',
}

export const SYMPTOM_CODES = [
  ['arm_heaviness', '上肢沉重'],
  ['tightness', '紧绷'],
  ['swelling', '肿胀'],
  ['joint_pain', '关节痛 / 僵硬'],
  ['hot_flash', '潮热 / 盗汗'],
  ['fatigue', '疲乏'],
  ['dizziness', '头晕'],
  ['skin_rxn', '放疗区皮肤反应'],
]

export const ARM_STAGES = ['术后 0–2 周', '术后 2–6 周', '术后 3 个月以上']

export const RECORD_PAGES = {
  dashboard: '看板',
  records: '病情整理',
  timeline: '病情一图秀',
  clinical: '临床',
  nutrition: '营养支持',
  mind: '心理支持',
  care: '全程与康复',
  review: '收藏与回顾',
}
