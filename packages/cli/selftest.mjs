/**
 * dsh-whale-post-cli 的加载级自测：
 *   ① 子进程跑 CLI 自己的端到端自测（看退出码）
 *   ② 真启 CLI 二进制验两件"只有真跑才测得出"的事（独立审计 2026-10-05 指出）：
 *      · `--live <谁>` 必须真接线（否则在线件永远是 kept）
 *      · `--body --force` 这种"参数冒充正文"必须 exit 2（否则能绕过三道闸）
 * 判据看退出码：0 过／非 0 不过。
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const bin = join(here, 'index.js')
const checks = []
const check = (name, ok, extra = '') => checks.push({ name, ok: !!ok, extra: String(extra) })
const run = (args) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' })

// ① 端到端自测（CLI 内部那一套）
const inner = spawnSync(process.execPath, [bin, 'selftest'], { stdio: 'inherit' })
check('CLI 内部端到端自测退出码 0', inner.status === 0, String(inner.status))

// ② 真启二进制：`--live` 接线 ＋ 参数冒充正文
const tmp = join(process.env.TEMP ?? '/tmp', `whale-cli-live-${Date.now()}`)
mkdirSync(tmp, { recursive: true })
writeFileSync(join(tmp, 'roster.json'), JSON.stringify({
  apiVersion: 1,
  members: [{ id: 'alice' }, { id: 'bob' }],
  groups: { all: ['alice', 'bob'] },
}, null, 2), 'utf8')
run(['hello', '--as', 'alice', '--root', tmp])
run(['hello', '--as', 'bob', '--root', tmp])

const online = run(['send', '--as', 'alice', '--to', 'bob', '--mode', 'online', '--live', 'bob',
  '--subject', '在线件', '--body', '在线件：收件人此刻有活体会话 ⇒ 应当 delivered（正文有货）', '--root', tmp])
check('--live 真接线：在线件 ⇒ delivered', online.status === 0 && /delivered/.test(online.stdout), `exit=${online.status} out=${String(online.stdout).slice(0, 60)}`)

const impersonate = run(['send', '--as', 'alice', '--to', 'bob', '--subject', 'x', '--body', '--force', '--root', tmp])
check('参数冒充正文：`--body --force` ⇒ exit 2（不许绕闸）', impersonate.status === 2, `exit=${impersonate.status} err=${String(impersonate.stderr).slice(0, 60)}`)

const kept = run(['send', '--as', 'alice', '--to', 'bob', '--mode', 'online',
  '--subject', '没会话', '--body', '没声明 live ⇒ 应当 kept（信留在信箱，正文有货）', '--root', tmp])
check('没声明 live ⇒ 在线件 kept（不假投）', kept.status === 0 && /kept/.test(kept.stdout), `exit=${kept.status}`)

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
const pass = checks.filter((c) => c.ok).length
console.log(`\n${pass}/${checks.length} 通过`)
process.exit(pass === checks.length ? 0 : 1)
