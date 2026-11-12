/**
 * 临床试验登记快照（CT.gov 实时拉取，随包分发）。
 *
 * 定位（35 号四段）：只做**检索线索**——不做入组资格判断、不写判读列、不生成 pct。
 * 快照里没有结构化的入排条件原文，所以每条一律「待确认」，符合度写"暂无可对照项"。
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SNAPSHOT_DIR = join(HERE, '..', 'assets', 'reference-data', 'breast-trials-2026-11-13')

let cache = null
function load() {
  if (cache) return cache
  const jsonl = join(SNAPSHOT_DIR, 'trials.jsonl')
  const manifestPath = join(SNAPSHOT_DIR, 'manifest.json')
  if (!existsSync(jsonl) || !existsSync(manifestPath)) {
    cache = { available: false, reason: '随包快照缺失（assets/reference-data/breast-trials-2026-11-13）', records: [] }
    return cache
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const records = readFileSync(jsonl, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
  cache = { available: true, manifest, records }
  return cache
}

/**
 * @param {object} q
 * @param {string} [q.keyword] 关键词（标题 / 登记号 / 干预）
 * @param {string} [q.status] 登记状态前缀（如 "Recruiting"）
 * @param {string} [q.phase] 阶段（如 "PHASE2"）
 * @param {number} [q.limit] 返回上限（默认 20，最大 50）
 */
export function searchTrials({ keyword = '', status = '', phase = '', limit = 20 } = {}) {
  const snap = load()
  if (!snap.available) return { available: false, reason: snap.reason, records: [], candidatePool: null }
  const kw = String(keyword || '').trim().toLowerCase()
  const st = String(status || '').trim().toLowerCase()
  const ph = String(phase || '').trim().toUpperCase()
  const max = Math.min(Math.max(Number(limit) || 20, 1), 50)
  const filtered = snap.records.filter((r) => {
    if (kw) {
      const haystack = [r.title, r.registryId, ...(r.interventions || []), ...(r.conditions || [])].join(' ').toLowerCase()
      if (!haystack.includes(kw)) return false
    }
    if (st && !String(r.status || '').toLowerCase().startsWith(st)) return false
    if (ph && !(r.phase || []).some((p) => String(p).toUpperCase().includes(ph))) return false
    return true
  })
  return {
    available: true,
    snapshotDate: snap.manifest.retrieved_at,
    coverage: snap.manifest.note,
    candidatePool: { loaded: snap.records.length, matched: filtered.length, returned: Math.min(filtered.length, max), limit: max, notFullScan: true },
    records: filtered.slice(0, max),
    honestyNote: '登记状态未核实；快照不含入排条件原文，逐条只能标「待确认」。这不是入组资格，也不代表效果。',
  }
}
