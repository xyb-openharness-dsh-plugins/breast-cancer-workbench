#!/usr/bin/env node
/** 删除 `dsh/mineru-public.json`：发布打包完成后调用，避免生成物留在工作区。 */
import { rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
rmSync(join(root, 'dsh', 'mineru-public.json'), { force: true })
console.log('✓ 已移除 dsh/mineru-public.json')
