/**
 * dsh-whale-post-cli 的加载级自测：把 CLI 真启一遍（子进程），看它的端到端自测是否全过。
 * 判据看退出码：0 过／非 0 不过。
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const r = spawnSync(process.execPath, [join(here, 'index.js'), 'selftest'], { stdio: 'inherit' })
console.log(`\nCLI 端到端自测退出码 = ${r.status}`)
process.exit(r.status === 0 ? 0 : 1)
