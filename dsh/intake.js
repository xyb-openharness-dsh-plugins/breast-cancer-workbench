/**
 * 资料初始化：一键建目录 + 目录扫描。
 *
 * 只做文件系统与分类，不碰数据库；导入仍走 Workbench.importBytes 那条唯一入口。
 * 设计口径（2026-10-28 用户确认）：
 * - 不做 ZIP 往返，错误太多；
 * - 点按钮自动在默认/指定目录下建规范子目录树；
 * - 用户把文件放进分类目录，工作台扫描后导入；
 * - 界面直传支持单文件或最多 3 个文件；目录扫描一次最多 50 个。
 *
 * 安全边界：
 * - 只扫描固定的 7 个分类目录，不扫 `documents/`（受管原件，避免二次导入）；
 * - 忽略隐藏文件与系统垃圾文件；
 * - 打开文件夹用 execFile，不经 shell。
 */
import { execFile } from 'node:child_process'
import { mkdir, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, join, resolve } from 'node:path'

/** 分类目录：目录名给用户看，kind 给入库用（不靠中文目录名推断业务）。 */
export const INTAKE_CATEGORIES = Object.freeze([
  { key: 'pathology', dir: '01_病理与分型', label: '病理与分型', hint: '病理报告、免疫组化、基因检测', kind: 'pathology' },
  { key: 'imaging', dir: '02_影像检查', label: '影像检查', hint: 'CT、MRI、超声、PET、X 光', kind: 'imaging' },
  { key: 'lab', dir: '03_化验单', label: '化验单', hint: '血常规、生化、肿瘤标志物', kind: 'lab' },
  { key: 'discharge', dir: '04_出院小结', label: '出院小结', hint: '住院/出院记录、手术记录', kind: 'discharge' },
  { key: 'prescription', dir: '05_处方与用药', label: '处方与用药', hint: '处方、用药清单', kind: 'prescription' },
  { key: 'rehab_advice', dir: '06_康复与随访建议', label: '康复与随访建议', hint: '康复指导、随访计划', kind: 'rehab_advice' },
  { key: 'other', dir: '99_其他', label: '其他', hint: '放不进以上分类的资料', kind: 'other' },
])

export const SUPPORTED_EXTENSIONS = Object.freeze([
  '.pdf', '.jpg', '.jpeg', '.png', '.heic', '.webp',
  '.doc', '.docx', '.txt', '.md', '.markdown', '.csv', '.xls', '.xlsx',
])

const SUPPORTED = new Set(SUPPORTED_EXTENSIONS)
const IGNORED_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini'])

/** 目录扫描一次最多导入的文件数；超出让用户分批，避免一次性长事务。 */
export const MAX_SCAN_FILES = 50
/** 界面直传一批最多 3 个（用户确认）。 */
export const MAX_UPLOAD_BATCH = 3

/** 默认资料根目录：~/Documents/<folder>；已存在时复用。 */
export function defaultWorkspaceRoot({ home = homedir(), folder = '小粉宝工作台' } = {}) {
  return resolve(join(home, 'Documents', folder))
}

/** 建规范子目录树。只补缺，不删除、不覆盖用户文件。 */
export async function createIntakeTree(root) {
  const base = resolve(root)
  await mkdir(base, { recursive: true })
  const folders = []
  for (const category of INTAKE_CATEGORIES) {
    const dirPath = join(base, category.dir)
    await mkdir(dirPath, { recursive: true })
    folders.push({ ...category, path: dirPath })
  }
  return { root: base, folders }
}

/** 扫描分类目录。只读，不改文件。 */
export async function scanIntakeTree(root) {
  const base = resolve(root)
  const categories = []
  let total = 0
  let supported = 0
  let unsupported = 0

  for (const category of INTAKE_CATEGORIES) {
    const dirPath = join(base, category.dir)
    let entries = []
    try {
      entries = await readdir(dirPath, { withFileTypes: true })
    } catch {
      // 目录还没建：当作空目录，不报错（用户可能只建了一部分）
      entries = []
    }
    const files = []
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'zh'))) {
      if (!entry.isFile()) continue
      if (IGNORED_NAMES.has(entry.name) || entry.name.startsWith('.')) continue
      const fullPath = join(dirPath, entry.name)
      let st
      try {
        st = await stat(fullPath)
      } catch {
        continue
      }
      if (!st.isFile()) continue
      const ext = extname(entry.name).toLowerCase()
      const ok = SUPPORTED.has(ext)
      files.push({
        name: entry.name,
        relPath: join(category.dir, entry.name),
        ext,
        size: st.size,
        mtime: st.mtime.toISOString(),
        supported: ok,
        kind: category.kind,
      })
      total += 1
      if (ok) supported += 1
      else unsupported += 1
    }
    categories.push({
      key: category.key,
      dir: category.dir,
      label: category.label,
      hint: category.hint,
      kind: category.kind,
      dirPath,
      files,
      count: files.length,
    })
  }

  return {
    root: base,
    categories,
    total,
    supported,
    unsupported,
    maxFiles: MAX_SCAN_FILES,
    maxUploadBatch: MAX_UPLOAD_BATCH,
    supportedExtensions: SUPPORTED_EXTENSIONS,
  }
}

/** 该扩展名是否支持解析/导入。 */
export function isSupportedFile(name) {
  return SUPPORTED.has(extname(String(name)).toLowerCase())
}

/** 按分类目录 + 相对路径找到分类；找不到返回 null。 */
export function categoryForRelPath(relPath) {
  const value = String(relPath ?? '')
  return INTAKE_CATEGORIES.find((c) => value === c.dir || value.startsWith(`${c.dir}/`) || value.startsWith(`${c.dir}\\`)) ?? null
}

/** 粗略 MIME：只用于入库元信息，解析类型仍看扩展名。 */
export function mimeFor(name) {
  const ext = extname(String(name)).toLowerCase()
  return {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.heic': 'image/heic',
    '.webp': 'image/webp',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.markdown': 'text/markdown',
    '.csv': 'text/csv',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }[ext] ?? 'application/octet-stream'
}

/** 打开文件夹（macOS open / Windows explorer / Linux xdg-open），不经 shell。 */
export function openFolder(path) {
  const target = resolve(String(path ?? ''))
  const command = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'explorer'
      : 'xdg-open'
  return new Promise((resolvePromise, reject) => {
    execFile(command, [target], { timeout: 5000 }, (error) => {
      if (error) reject(error)
      else resolvePromise()
    })
  })
}
