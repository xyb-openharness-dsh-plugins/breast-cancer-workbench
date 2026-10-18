/**
 * 迁移执行器（M1）。
 *
 * 只做三件事：按文件名顺序执行 schema/NNNN_*.sql、记录已执行版本、校验已执行文件的哈希没被改过。
 * 不生成 SQL、不猜字段、不做业务。
 *
 * 规则见 docs/SCHEMA-SPEC.md §8：每次迁移一个文件，`schema_version` 与文件名前缀一致；
 * 冻结后只增不改，改动已执行的文件会被 `scripts/check-schema.mjs` 拦下。
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCHEMA_DIR = fileURLToPath(new URL('../schema/', import.meta.url))

const FILE_RE = /^(\d{4})_([a-z0-9_]+)\.sql$/

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** 按编号排序的迁移文件列表。不认识的文件名不猜，直接报错。 */
export function migrationFiles(dir = SCHEMA_DIR) {
  const sqlFiles = readdirSync(dir).filter((f) => f.endsWith('.sql'))
  const unknown = sqlFiles.filter((f) => !FILE_RE.test(f))
  if (unknown.length) {
    throw new Error(`schema/ 里有不符合 NNNN_name.sql 的文件：${unknown.join(', ')}`)
  }
  return sqlFiles.sort((a, b) => Number(a.slice(0, 4)) - Number(b.slice(0, 4)))
}

/**
 * 执行未应用的迁移。已在 `schema_version` 里的版本跳过（幂等）。
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function migrate(db, { dir = SCHEMA_DIR, now = () => new Date().toISOString() } = {}) {
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL,
    checksum   TEXT NOT NULL
  )`)

  const applied = new Map(
    db.prepare('SELECT version, name, checksum FROM schema_version').all().map((r) => [r.version, r]),
  )

  const executed = []
  for (const file of migrationFiles(dir)) {
    const version = Number(file.slice(0, 4))
    const sql = readFileSync(join(dir, file), 'utf8')
    const checksum = sha256(sql)

    const done = applied.get(version)
    if (done) {
      // 已执行过的文件被改动 = 迁移不再可复现，必须用新文件而不是原地改。
      if (done.checksum !== checksum) {
        throw new Error(`${file} 冻结后被改动（${done.checksum} → ${checksum}），请新增 NNNN_*.sql 而不是改历史迁移`)
      }
      continue
    }

    db.exec('BEGIN')
    try {
      db.exec(sql)
      db.prepare('INSERT INTO schema_version (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)')
        .run(version, file, now(), checksum)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw new Error(`${file} 执行失败：${error.message}`)
    }
    executed.push(file)
  }

  return { executed, applied: db.prepare('SELECT version, name FROM schema_version ORDER BY version').all() }
}
