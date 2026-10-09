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
import { mkdirSync, writeFileSync, readdirSync, readFileSync, unlinkSync } from 'node:fs'

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

// ③ 第七件：安全校验的三态（★只有真跑 CLI 才测得出 —— 光看模块自测测不到子命令接线）
const vtmp = join(process.env.TEMP ?? '/tmp', `whale-cli-verify-${Date.now()}`)
mkdirSync(vtmp, { recursive: true })
writeFileSync(join(vtmp, 'roster.json'), JSON.stringify({
  apiVersion: 1,
  members: [{ id: 'alice' }, { id: 'bob' }],
  groups: { all: ['alice', 'bob'] },
}, null, 2), 'utf8')

const vOff = run(['verify', '--root', vtmp])
check('verify：默认（未开启）⇒ 报"禁用中"且退出码 0', vOff.status === 0 && /禁用中/.test(vOff.stdout), `exit=${vOff.status} out=${String(vOff.stdout).slice(0, 60)}`)
check('verify：禁用时给出"建议开启"与开启方法', /建议开启/.test(vOff.stdout) && /--enable|enabled: true/.test(vOff.stdout))

const nag1 = run(['nag', '--root', vtmp])
check('nag：第一次 ⇒ 印出提示（未开启）', nag1.status === 0 && /禁用中/.test(nag1.stdout), `exit=${nag1.status}`)
const nag2 = run(['nag', '--root', vtmp])
check('nag：同一天再来 ⇒ 无需提示（一天至多一次）', nag2.status === 0 && /无需提示/.test(nag2.stdout), String(nag2.stdout).slice(0, 40))

const vOn = run(['verify', '--enable', '--root', vtmp])
check('verify --enable：退出码 0', vOn.status === 0, String(vOn.status))
const vAfter = run(['verify', '--root', vtmp])
check('verify：开启后 ⇒ 报"已开启"', /已开启/.test(vAfter.stdout), String(vAfter.stdout).slice(0, 60))
const nagAfter = run(['nag', '--root', vtmp])
check('nag：开启后 ⇒ 不再提示', /无需提示/.test(nagAfter.stdout), String(nagAfter.stdout).slice(0, 40))
check('verify --disable：能关回去（★关回去 ≠ 安全，仍会提示）', run(['verify', '--disable', '--root', vtmp]).status === 0)

// ④ 第八条演进：pickup —— 去**别的信箱根**把自己的信取回来（★只有真跑二进制才测得出）
//    ★口径：每封**先验签**（不过的不搬 ✗）／写进本地（先 .tmp 再 rename）／**写成功之后才删远端**（否则就是丢信 ✓）
const pRemote = join(process.env.TEMP ?? '/tmp', `whale-cli-pk-remote-${Date.now()}`)
const pLocal = join(process.env.TEMP ?? '/tmp', `whale-cli-pk-local-${Date.now()}`)
const rosterJson = JSON.stringify({ apiVersion: 1, members: [{ id: 'alice' }, { id: 'bob' }], groups: { all: ['alice', 'bob'] } }, null, 2)
for (const d of [pRemote, pLocal]) { mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'roster.json'), rosterJson, 'utf8') }
run(['hello', '--as', 'alice', '--root', pRemote])
run(['hello', '--as', 'bob', '--root', pRemote])
run(['send', '--as', 'alice', '--to', 'bob', '--subject', '远方', '--body', '这封信在别的信箱根里（正文有货，别当回执）', '--root', pRemote])
const lsDir = (d) => { try { return readdirSync(d).filter((x) => x.endsWith('.msg.json')) } catch { return [] } }
const rInbox = join(pRemote, 'inbox', 'bob')
const lInbox = join(pLocal, 'inbox', 'bob')

const pk1 = run(['pickup', '--as', 'bob', '--root', pLocal, '--remote', pRemote])
check('★pickup：取回 1 封（退出码 0）', pk1.status === 0 && /取回 1 封/.test(pk1.stdout), `exit=${pk1.status} out=${String(pk1.stdout).slice(0, 60)}`)
check('★pickup：信真落到本地信箱', lsDir(lInbox).length === 1, JSON.stringify(lsDir(lInbox)))
check('★★pickup：远端那封搬走了（★落地成功才删）', lsDir(rInbox).length === 0, JSON.stringify(lsDir(rInbox)))
const pk2 = run(['pickup', '--as', 'bob', '--root', pLocal, '--remote', pRemote])
check('★pickup：再跑一遍 ⇒ 取回 0 封（幂等）', pk2.status === 0 && /取回 0 封/.test(pk2.stdout), `exit=${pk2.status} out=${String(pk2.stdout).slice(0, 40)}`)

run(['send', '--as', 'alice', '--to', 'bob', '--subject', '会被改坏', '--body', '原正文（有货，别当回执）', '--root', pRemote])
const victim = lsDir(rInbox)[0]
writeFileSync(join(rInbox, victim), readFileSync(join(rInbox, victim), 'utf8').replace('原正文', '被改过的正文'), 'utf8')
const pk3 = run(['pickup', '--as', 'bob', '--root', pLocal, '--remote', pRemote])
check('★★pickup：验签不过 ⇒ 不搬 ＋ 退出码 2', pk3.status === 2 && /不过/.test(pk3.stdout), `exit=${pk3.status} out=${String(pk3.stdout).slice(0, 60)}`)
check('★★pickup：没搬走的那封**留在远端**（没被删）', lsDir(rInbox).length === 1, JSON.stringify(lsDir(rInbox)))
check('★pickup：坏件没进本地信箱', lsDir(lInbox).length === 1, JSON.stringify(lsDir(lInbox)))

check('pickup：远端根不存在 ⇒ 退出码 2', run(['pickup', '--as', 'bob', '--root', pLocal, '--remote', join(pRemote, 'nope')]).status === 2)
check('pickup：缺 --remote ⇒ 退出码 2',
  spawnSync(process.execPath, [bin, 'pickup', '--as', 'bob', '--root', pLocal], { encoding: 'utf8', env: { ...process.env, WHALE_POST_REMOTE_ROOT: '' } }).status === 2)
// ★★先把远端那个坏件清掉 ✗ —— 否则下面这一跑又会碰上它（退出码 2），
//   那就**证明不了**"环境变量被认了"（★第一次写这条判据就栽在这儿：pickup 拒坏件是对的，是判据想错了 ✓）
unlinkSync(join(rInbox, victim))
const pkEnv = spawnSync(process.execPath, [bin, 'pickup', '--as', 'bob', '--root', pLocal], { encoding: 'utf8', env: { ...process.env, WHALE_POST_REMOTE_ROOT: pRemote } })
check('★pickup：环境变量 WHALE_POST_REMOTE_ROOT 也认（坏件已清 ⇒ 取回 0 封、退出码 0）',
  pkEnv.status === 0 && /取回 0 封/.test(pkEnv.stdout), `exit=${pkEnv.status} out=${String(pkEnv.stdout).slice(0, 40)}`)

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
const pass = checks.filter((c) => c.ok).length
console.log(`\n${pass}/${checks.length} 通过`)
process.exit(pass === checks.length ? 0 : 1)
