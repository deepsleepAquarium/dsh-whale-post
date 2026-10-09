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
import { mkdirSync, writeFileSync, readdirSync, readFileSync, unlinkSync, existsSync, statSync, utimesSync, copyFileSync } from 'node:fs'

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

// ⑤ ★★S6 完整版（2026-10-10 从缸里正本移植）：镜像 hello ／ 远端那份 MOVE 进 seen ／ 到达侧记账（默认关）
const s6Remote = join(process.env.TEMP ?? '/tmp', `whale-cli-s6-remote-${Date.now()}`)
const s6Local = join(process.env.TEMP ?? '/tmp', `whale-cli-s6-local-${Date.now()}`)
const s6Roster = JSON.stringify({ apiVersion: 1, members: [{ id: 'web' }, { id: 'phone', phone: true }, { id: 'qq' }] })
for (const d of [s6Remote, s6Local]) { mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'roster.json'), s6Roster, 'utf8') }
run(['hello', '--as', 'phone', '--root', s6Remote])
run(['hello', '--as', 'web', '--root', s6Remote])
run(['send', '--as', 'phone', '--to', 'web', '--body', '手机在邮筒里留的离线件（正文有货，别当回执）', '--root', s6Remote])
const pk6 = run(['pickup', '--as', 'web', '--root', s6Local, '--remote', s6Remote, '--only-offline', 'phone'])
check('★S6：取回 1 封 ＋ 镜像 hello 1 份', pk6.status === 0 && /取回 1 封/.test(pk6.stdout) && /镜像 hello 1 份/.test(pk6.stdout), `exit=${pk6.status} out=${String(pk6.stdout).slice(0, 70)}`)
check('★★S6：只镜像"只收离线"成员的 hello（★缸内成员 web 的 hello 不搬）',
  existsSync(join(s6Local, 'hello', 'phone.json')) && !existsSync(join(s6Local, 'hello', 'web.json')),
  JSON.stringify((() => { try { return readdirSync(join(s6Local, 'hello')) } catch { return [] } })()))
check('★★S6：远端那份 **MOVE 进 seen/**（★消费凭证 —— 不是删掉）',
  existsSync(join(s6Remote, 'seen', 'web', `${lsDir(join(s6Remote, 'seen', 'web'))[0] ?? 'x'}`)) && lsDir(join(s6Remote, 'inbox', 'web')).length === 0,
  JSON.stringify(lsDir(join(s6Remote, 'seen', 'web'))))
check('★★S6：**默认不记账**（★远端自己可能记过 ⇒ 再记就是双记 ✗）', !existsSync(join(s6Local, 'state', 'quota-phone.json')))
run(['send', '--as', 'phone', '--to', 'web', '--body', '第二封离线件（正文有货，别当回执）', '--root', s6Remote])
const pk6b = run(['pickup', '--as', 'web', '--root', s6Local, '--remote', s6Remote, '--only-offline', 'phone', '--account'])
check('★S6：`--account` 开了才记，且**记在发件人名下**', pk6b.status === 0 && existsSync(join(s6Local, 'state', 'quota-phone.json')), String(pk6b.stdout).slice(0, 60))

// ★★★S6h-③：搬信要**保住原始 mtime** ✗✓（2026-10-10 从正本移植）
//   ★否则"刚取回来的信"看起来像"刚到" ⇒ ★**等于用假在线骗自己的闸** ✗（休眠推断／新鲜度判定都看 mtime ✓）
const mRoot = join(process.env.TEMP ?? '/tmp', `whale-cli-mtime-rem-${Date.now()}`)
const mLocal = join(process.env.TEMP ?? '/tmp', `whale-cli-mtime-loc-${Date.now()}`)
const mRoster = JSON.stringify({ apiVersion: 1, members: [{ id: 'web' }, { id: 'phone', phone: true }] })
for (const d of [mRoot, mLocal]) { mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'roster.json'), mRoster, 'utf8') }
run(['hello', '--as', 'phone', '--root', mRoot]); run(['hello', '--as', 'web', '--root', mRoot])
run(['send', '--as', 'phone', '--to', 'web', '--body', 'S6h 保 mtime 测试件（正文有货，别当回执）', '--root', mRoot])
const mSrcFile = lsDir(join(mRoot, 'inbox', 'web'))[0]
const mSrcStat = statSync(join(mRoot, 'inbox', 'web', mSrcFile))
run(['pickup', '--as', 'web', '--root', mLocal, '--remote', mRoot, '--only-offline', 'phone'])
const mLocalFile = lsDir(join(mLocal, 'inbox', 'web'))[0]
const mLocalStat = mLocalFile ? statSync(join(mLocal, 'inbox', 'web', mLocalFile)) : null
check('★★S6h-③：搬信**保住原始 mtime** ✗（★否则等于用假在线骗自己的闸 ✓）',
  !!mLocalStat && Math.abs(mLocalStat.mtimeMs - mSrcStat.mtimeMs) < 2000,
  `src=${mSrcStat.mtime.toISOString()} dst=${mLocalStat ? mLocalStat.mtime.toISOString() : '（没搬进来）'}`)

// ★★★S6h-①②："搬一半崩了"这个现场怎么收拾 ✗✓（2026-10-10 从正本移植；★正本判据 73-76 ✓）
//   ① 半截 `.tmp` ⇒ **不理它** ✓（既不导入也不删 ✓）；**陈旧**的 ⇒ **MOVE 进邮筒 `垃圾/`** ✓（**绝不删** ✗）
//   ② **收敛式 MOVE** ✓：本机 `inbox/` 已有 ＋ 邮筒那份还没进 `seen/` ⇒ **补 MOVE** ＋ **不记账** ✓
const hRoot = join(process.env.TEMP ?? '/tmp', `whale-cli-s6h-rem-${Date.now()}`)
const hLocal = join(process.env.TEMP ?? '/tmp', `whale-cli-s6h-loc-${Date.now()}`)
for (const d of [hRoot, hLocal, join(hLocal, 'inbox', 'web')]) { mkdirSync(d, { recursive: true }); }
for (const d of [hRoot, hLocal]) writeFileSync(join(d, 'roster.json'), mRoster, 'utf8')
run(['hello', '--as', 'phone', '--root', hRoot]); run(['hello', '--as', 'web', '--root', hRoot])
run(['send', '--as', 'phone', '--to', 'web', '--body', 'S6h-①② 测试件（正文有货，别当回执）', '--root', hRoot])
const hFile = lsDir(join(hRoot, 'inbox', 'web'))[0]
// ① 新的半截（★该不理它 ✓）＋ 陈旧的（★该 MOVE 进 垃圾/ ✓）
writeFileSync(join(hRoot, 'inbox', 'web', `.${hFile}.tmp`), '半截', 'utf8')
const staleTmp = join(hRoot, 'inbox', 'web', '.old-one.tmp')
writeFileSync(staleTmp, '陈旧', 'utf8')
const oldTime = new Date(Date.now() - 5 * 3600 * 1000)
utimesSync(staleTmp, oldTime, oldTime)
run(['pickup', '--as', 'web', '--root', hLocal, '--remote', hRoot, '--only-offline', 'phone'])
check('★S6h-①：**新的半截 `.tmp` ⇒ 不理它** ✓（★既不导入也不删 ✓）',
  existsSync(join(hRoot, 'inbox', 'web', `.${hFile}.tmp`)))
check('★★S6h-①：**陈旧 `.tmp` ⇒ MOVE 进邮筒 `垃圾/`** ✓（★**绝不删** ✗）',
  existsSync(join(hRoot, '垃圾', '.old-one.tmp')) && !existsSync(staleTmp))
// ② 模拟"搬一半崩了"：★**邮筒 `seen/` 里没有它**（第②步没做 ✓）★而邮筒 `inbox/` 还有 ＋ 本机 inbox 有（第①步做了 ✓）
//   ⚠️ ★不能只 copy 回去 ✗ —— ★第一次 pickup 已经把它放进邮筒 `seen/` 了 ⇒ 那样 `remoteSeen` 会认出来 ⇒ **不需要收敛** ✓
//     （★我第一版就这么写的 ⇒ 判据红 ⇒ 而那是**判据的模拟错**，不是代码错 ✓）
unlinkSync(join(hRoot, 'seen', 'web', hFile))                        // ★先撤掉那份"消费凭证"（模拟第②步没做）
writeFileSync(join(hRoot, 'inbox', 'web', hFile), readFileSync(join(hLocal, 'inbox', 'web', hFile), 'utf8'), 'utf8')
check('★S6h-②：现场造好了（本机 inbox 有 ＋ 邮筒 inbox 有 ＋ **邮筒 seen 没那份**）',
  existsSync(join(hLocal, 'inbox', 'web', hFile)) && existsSync(join(hRoot, 'inbox', 'web', hFile)) && !existsSync(join(hRoot, 'seen', 'web', hFile)))
run(['pickup', '--as', 'web', '--root', hLocal, '--remote', hRoot, '--only-offline', 'phone'])
check('★★S6h-②：**收敛式 MOVE** —— 邮筒那份补进 `seen/`（★"搬一半"不再卡住 ✓）',
  !existsSync(join(hRoot, 'inbox', 'web', hFile)) && existsSync(join(hRoot, 'seen', 'web', hFile)))
check('★S6h-②：本机**没重复导入** ✓（★幂等仍在管事 ✓）', lsDir(join(hLocal, 'inbox', 'web')).length === 1)

// ⑥ ★★S12 断线不卡死（2026-10-10 从缸里正本移植）：动"邮筒"之前先探活
//    ★病：SMB 掉线时**同步 fs 会挂住几十秒** ✗（本地盘不会 ✓）⇒ pickup 会卡住 ✓
//    ★方：只看 **TCP 445** 通不通；★本机路径不探；★"Node 的同步 fs 没有超时" ⇒ 靠子进程 ＋ timeout 拿上限 ✓
const deadStart = Date.now()
const deadRes = run(['pickup', '--as', 'web', '--root', s6Local, '--remote', '\\\\10.255.255.1\\nope'])
const deadMs = Date.now() - deadStart
check('★★S12：够不着的 UNC ⇒ **快速判死**（不是挂几十秒）＋ 退出码 2',
  deadRes.status === 2 && deadMs < 15000, `exit=${deadRes.status} ms=${deadMs}`)
check('★S12：判死时说清"一个文件都没动"',
  /一个文件都没动/.test(deadRes.stdout + deadRes.stderr), String(deadRes.stdout + deadRes.stderr).slice(0, 60))

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
const pass = checks.filter((c) => c.ok).length
console.log(`\n${pass}/${checks.length} 通过`)
process.exit(pass === checks.length ? 0 : 1)
