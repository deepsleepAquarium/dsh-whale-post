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
//   ★★2026-10-10：台账分"**基线 ＋ 增量**"两处存（★"各写各的" —— 修并发必丢账 ✓）⇒
//     ★判"记没记"要看**两处都没有** ✓（★基线那个文件在"从没迁移过"时本来就不该有 ✓）。
check('★★S6：**默认不记账**（★远端自己可能记过 ⇒ 再记就是双记 ✗）',
  !existsSync(join(s6Local, 'state', 'quota-phone.json')) && !existsSync(join(s6Local, 'state', 'quota-phone.d')))
run(['send', '--as', 'phone', '--to', 'web', '--body', '第二封离线件（正文有货，别当回执）', '--root', s6Remote])
const pk6b = run(['pickup', '--as', 'web', '--root', s6Local, '--remote', s6Remote, '--only-offline', 'phone', '--account'])
check('★S6：`--account` 开了才记，且**记在发件人名下**',
  pk6b.status === 0 && (existsSync(join(s6Local, 'state', 'quota-phone.json')) || existsSync(join(s6Local, 'state', 'quota-phone.d'))),
  String(pk6b.stdout).slice(0, 60))

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

// ★★★S6b：邮筒上"**别人回给我的回执**" ⇒ 镜像回本机 ✗✓
//   （2026-10-10 从正本移植；★正本判据 107-110 ✓）
//   ★**病**：★`pickup` 原来只镜像 `hello/` ⇒ ★**邮筒上的 `ack/<我>/` 从来没搬过** ✓
//     ⇒ ★**发信人的本机永远看不到"对方已经收了"** ✗（★正本原话："**此前收不到**" ✓）——
//     ★而"发出去的信，对方收没收到"**正是邮局要回答的问题** ✓。
//   ★★两条纪律：★**只镜不删** ✗（★邮筒那份原样留着 ✓）／★**幂等** ✗（★内容相同就跳过 ⇒ **不动 mtime** ✓）。
const b6Root = join(process.env.TEMP ?? '/tmp', `whale-cli-s6b-rem-${Date.now()}`)
const b6Local = join(process.env.TEMP ?? '/tmp', `whale-cli-s6b-loc-${Date.now()}`)
for (const d of [b6Root, b6Local, join(b6Local, 'inbox', 'web'), join(b6Root, 'ack', 'web')]) mkdirSync(d, { recursive: true })
for (const d of [b6Root, b6Local]) writeFileSync(join(d, 'roster.json'), mRoster, 'utf8')
run(['hello', '--as', 'phone', '--root', b6Root]); run(['hello', '--as', 'web', '--root', b6Root])
//   ★在**邮筒上**放两份"别人回给我的回执"（★模拟"手机收信后留下的" ✓）
writeFileSync(join(b6Root, 'ack', 'web', 'aaa.phone.ack.json'), '{"kind":"ack","by":"phone","ok":true,"disposition":"delivered-offline"}', 'utf8')
writeFileSync(join(b6Root, 'ack', 'web', 'bbb.phone.ack.json'), '{"kind":"ack","by":"phone","ok":true,"disposition":"delivered-offline"}', 'utf8')
run(['pickup', '--as', 'web', '--root', b6Local, '--remote', b6Root, '--only-offline', 'phone'])
const b6Acks = (d) => { try { return readdirSync(join(d, 'ack', 'web')).filter((f) => f.endsWith('.json')) } catch { return [] } }
check('★★★S6b：邮筒上的回执 ⇒ **镜像回本机** ✗（★"发出去的信，对方收没收到" ✓）',
  b6Acks(b6Local).length === 2, `本机 ${b6Acks(b6Local).length} 份`)
check('★★S6b：**只镜不删** ✗ —— 邮筒那份**原样留着** ✓', b6Acks(b6Root).length === 2, `邮筒 ${b6Acks(b6Root).length} 份`)
run(['pickup', '--as', 'web', '--root', b6Local, '--remote', b6Root, '--only-offline', 'phone'])
check('★★S6b：**幂等** ✗ —— 内容相同就跳过（★不重写 ⇒ **不动 mtime** ✓）',
  b6Acks(b6Local).length === 2 && b6Acks(b6Root).length === 2)
//   ★再放一份 ⇒ 该只多镜 1 份（★"增量"也对 ✓）
writeFileSync(join(b6Root, 'ack', 'web', 'ccc.phone.ack.json'), '{"kind":"ack","by":"phone","ok":false,"disposition":"refused"}', 'utf8')
run(['pickup', '--as', 'web', '--root', b6Local, '--remote', b6Root, '--only-offline', 'phone'])
check('★S6b：**新回执**会被补镜（★只多 1 份 ✓）', b6Acks(b6Local).length === 3, `本机 ${b6Acks(b6Local).length} 份`)

// ★★★S11 取件那半边：把**明示休眠**者信箱里积压的信**退回** ✗✓
//   （2026-10-10 从正本移植；★正本判据 105-106 ＋「主人 2026-10-06 02:5x 令」✓）
//   ★它扫**两个地方**：★本机 `inbox/<谁>/` ＋ ★**远端邮筒的** `inbox/<谁>/` ✓（★只扫本机是不够的 ✓）
//   ★★⚠️ **推断休眠不自动退** ✗✓（正本原话）：★否则"退掉积压 ⇒ 证据消失 ⇒ 又判活跃"**来回摆** ✗
const s11Root = join(process.env.TEMP ?? '/tmp', `whale-cli-s11-rem-${Date.now()}`)
const s11Local = join(process.env.TEMP ?? '/tmp', `whale-cli-s11-loc-${Date.now()}`)
for (const d of [s11Root, s11Local, join(s11Local, 'inbox', 'web')]) mkdirSync(d, { recursive: true })
//   ★roster：`phone` 带 `zzz`（**明示**休眠 ✓）／`quiet` 不带（★用来验"推断不退" ✓）
const s11Roster = JSON.stringify({ apiVersion: 1, members: [{ id: 'web' }, { id: 'phone', zzz: true }, { id: 'quiet' }], groups: {} })
for (const d of [s11Root, s11Local]) writeFileSync(join(d, 'roster.json'), s11Roster, 'utf8')
run(['hello', '--as', 'phone', '--root', s11Root]); run(['hello', '--as', 'web', '--root', s11Root])
run(['send', '--as', 'web', '--to', 'phone', '--mode', 'offline', '--force', '--body', 'S11 退回测试（正文有货，别当回执）', '--root', s11Root])
check('★S11：现场造好了（★明示休眠者 `phone` 的邮筒里有一封 ✓）', lsDir(join(s11Root, 'inbox', 'phone')).length === 1)
run(['pickup', '--as', 'web', '--root', s11Local, '--remote', s11Root, '--only-offline', 'phone', '--dormant', 'zzz'])
check('★★S11：**明示休眠**者邮筒里积压的信 ⇒ 退回本机 `退信/`（★信没丢 ✗）',
  lsDir(join(s11Local, '退信')).some((f) => f.endsWith('.msg.json')) && lsDir(join(s11Root, 'inbox', 'phone')).length === 0,
  JSON.stringify(lsDir(join(s11Local, '退信'))))
//   ⚠️ ★`lsDir` **只列 `.msg.json`** ✗ ⇒ ★要看得用 `readdirSync` 原样列 ✓
//     （★我第一版用 `lsDir(...).some(f => f.endsWith('.因休眠退回.说明.txt'))` ⇒ ★**永远 false** ⇒ 假红 ✓
//      —— ★而文件其实好好躺在那里（639 B ✓）✓。★"探针写得比事实窄"这个坑我这两轮踩了三次 ✓）
const lsAll = (d) => { try { return readdirSync(d) } catch { return [] } }
check('★★S11：退回时**留一份说明**（★名字自己说清是什么 ✓：`.因休眠退回.说明.txt`）',
  lsAll(join(s11Local, '退信')).some((f) => f.endsWith('.因休眠退回.说明.txt')),
  JSON.stringify(lsAll(join(s11Local, '退信'))))
check('★S11：说明里写明「此人无法收到邮件」＋「没有进收件人的信箱 ⇒ 不占配额」',
  (() => {
    const f = lsAll(join(s11Local, '退信')).find((x) => x.endsWith('.因休眠退回.说明.txt'))
    if (!f) return false
    const t = readFileSync(join(s11Local, '退信', f), 'utf8')
    return /无法收到邮件/.test(t) && /没有进/.test(t) && /不占/.test(t)
  })())
// ★★"推断休眠 ⇒ **不自动退**" ✗✓ —— ★正本判据 106（★这条最难造：要把积压做**旧** ✓）
{
  const qRoot = join(process.env.TEMP ?? '/tmp', `whale-cli-s11q-rem-${Date.now()}`)
  const qLocal = join(process.env.TEMP ?? '/tmp', `whale-cli-s11q-loc-${Date.now()}`)
  for (const d of [qRoot, qLocal, join(qLocal, 'inbox', 'web')]) mkdirSync(d, { recursive: true })
  for (const d of [qRoot, qLocal]) writeFileSync(join(d, 'roster.json'), s11Roster, 'utf8')
  run(['hello', '--as', 'quiet', '--root', qRoot]); run(['hello', '--as', 'web', '--root', qRoot])
  run(['send', '--as', 'web', '--to', 'quiet', '--mode', 'offline', '--force', '--body', '放了很久的信（正文有货，别当回执）', '--root', qRoot])
  //   ★把它的 mtime 推到 **10 天前** ⇒ ★`dormancyOf` 会**推断**成 dormant ✓（★阈值 7 天 ✓）
  const oldMs = Date.now() - 10 * 24 * 3600 * 1000
  for (const f of lsDir(join(qRoot, 'inbox', 'quiet'))) {
    const p = join(qRoot, 'inbox', 'quiet', f)
    const st = statSync(p)
    utimesSync(p, st.atime, new Date(oldMs))
  }
  run(['pickup', '--as', 'web', '--root', qLocal, '--remote', qRoot, '--only-offline', 'quiet', '--dormant', 'zzz'])
  check('★★S11：**推断**休眠（放了 10 天的积压）⇒ **不自动退** ✗（★退了就会"来回摆" ✓）＋ 只**提示** ✓',
    lsDir(join(qRoot, 'inbox', 'quiet')).length === 1 && lsDir(join(qLocal, '退信')).length === 0,
    `邮筒还剩 ${lsDir(join(qRoot, 'inbox', 'quiet')).length} 封／退信 ${lsDir(join(qLocal, '退信')).length} 个`)

  // ★★★`dormant --pin`：把**推断的休眠**升格成**明示的休眠** ✗✓（正本判据 106 ✓）
  //   ★正本原话：★"要真退就**先钉** —— ★**钉了才是明示** ✓、才稳 ✓"
  //   ★★它把"**猜测**"和"**决定**"分开 ✓：★推断永远是推断（`inferred` ✓）；
  //     ★而"钉"是**一个人的决定** ✓ ⇒ ★落盘留痕（谁／为什么／什么时候 ✓）⇒ ★从此算 `declared` ✓。
  //   ★★★**闭环** ✗✓：★**推断（只提示）→ 人来钉（留痕）→ 才退** ✓。
  const pinRun = run(['dormant', '--pin', 'quiet', '--why', '十天没读信，主人决定先钉住', '--by', '自测', '--root', qLocal])
  check('★★钉：`dormant --pin` 成功，且**留痕**（★谁／为什么／什么时候 ✓ —— ★那是一个决定 ✓）',
    pinRun.status === 0 && /十天没读信/.test(pinRun.stdout) && /自测/.test(pinRun.stdout), String(pinRun.stdout).slice(0, 80))
  check('★钉：`dormant` 不带参数 ⇒ **列出来**（★钉过谁看得见 ✓）',
    run(['dormant', '--root', qLocal]).stdout.includes('quiet'))
  run(['pickup', '--as', 'web', '--root', qLocal, '--remote', qRoot, '--only-offline', 'quiet'])
  check('★★★钉：**钉了之后才肯退** ✗（★推断不动、钉了才动 ✓ —— 正本 106 的闭环 ✓）',
    lsDir(join(qRoot, 'inbox', 'quiet')).length === 0 && lsAll(join(qLocal, '退信')).length >= 2,
    `邮筒还剩 ${lsDir(join(qRoot, 'inbox', 'quiet')).length} 封／退信 ${lsAll(join(qLocal, '退信')).length} 个`)
  const unpinRun = run(['dormant', '--unpin', 'quiet', '--root', qLocal])
  check('★钉：`--unpin` 解开 ⇒ 名单里没了（★解钉也要说清原来是**谁**钉的 ✓）',
    unpinRun.status === 0 && /自测/.test(unpinRun.stdout) && !run(['dormant', '--root', qLocal]).stdout.includes('· quiet'))
}

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

// ★★★"**明示**"必须打到**发信人眼前** ✗✓（2026-10-10 补）——
//   ★★**病** ✗：`wakePrediction.offlineOnly` 原来**只落在信封里** ✓ ⇒ ★**发信人看不到** ✗ ——
//     ★而"**不许静默降级**"的本意正是"**如实告诉发件人**" ✓（★不是"悄悄写进信封" ✓）。
//   ★ⓘ ★这一条我**第一次插错了位置**（★`cli/selftest` 里**没有** `} catch (err) {` 那道门 ✓）——
//     ★★而**条数基准当场把我抓住了** ✓：★我先把基准从 48 改成 49 ✓ ⇒ ★跑出来报
//     「★判据**变少**了：cli 49 → 48」✓ —— ★★**新装的检查第一次实战就抓到了我自己的顺序错误** ✓✓。
const rcRoot = join(process.env.TEMP ?? '/tmp', `whale-cli-recv-${Date.now()}`)
mkdirSync(rcRoot, { recursive: true })
writeFileSync(join(rcRoot, 'roster.json'), JSON.stringify({ apiVersion: 1, members: [{ id: 'alice' }, { id: 'carol' }, { id: 'bob2' }] }), 'utf8')
run(['hello', '--as', 'alice', '--root', rcRoot])
run(['hello', '--as', 'carol', '--recv', 'offline-only', '--root', rcRoot])
const rcSend = run(['send', '--as', 'alice', '--to', 'carol', '--mode', 'online', '--no-gate',
  '--body', '明示测试（★正文有货，别当回执）', '--root', rcRoot])
check('★★★对"只收离线"者发**在线**件 ⇒ 输出里**明说"按离线寄达"** ✗✓（★不只写进信封 ✓）',
  rcSend.status === 0 && String(rcSend.stdout).includes('按离线寄达'),
  String(rcSend.stdout).slice(0, 80))
//   ★★"没握手"也要明示 ✗（★同样不许静默 ✓）—— ★bob2 故意**不写 hello** ✓
const rcSend2 = run(['send', '--as', 'alice', '--to', 'bob2', '--mode', 'online', '--no-gate',
  '--body', '没握手测试（★正文有货，别当回执）', '--root', rcRoot])
check('★★对**没新鲜握手**者发在线件 ⇒ 输出里**明说"没叫醒"** ✗✓（★降级要大声说 ✓）',
  rcSend2.status === 0 && String(rcSend2.stdout).includes('没叫醒'),
  String(rcSend2.stdout).slice(0, 80))

// ★★★`hello --quiet 22:00-09:00` ⇒ ★勿扰时段进信封 ✗✓（2026-10-10）
//   ★★这是“峰谷令”的邮局版 ✓；★跨午夜照写 ✓（★`from > to` 是正常写法 ✗）。
//   ★两条判据：★输出里报出勿扰时段 ✓；★信封里真的有 `quiet` ✓。
const qRoot = join(process.env.TEMP ?? '/tmp', `whale-cli-quiet-${Date.now()}`)
mkdirSync(qRoot, { recursive: true })
writeFileSync(join(qRoot, 'roster.json'), JSON.stringify({ apiVersion: 1, members: [{ id: 'alice' }] }), 'utf8')
const qHello = run(['hello', '--as', 'alice', '--quiet', '22:00-09:00', '--root', qRoot])
check('★★★`hello --quiet` ⇒ 输出里**报出勿扰时段** ✗✓',
  qHello.status === 0 && String(qHello.stdout).includes('勿扰时段'), String(qHello.stdout).slice(0, 80))
check('★★勿扰时段**真进了信封** ✗✓（★不是只打一行字 ✗）',
  (() => { try { const env = JSON.parse(readFileSync(join(qRoot, 'hello', 'alice.json'), 'utf8')); return Array.isArray(env.quiet) && env.quiet[0] === '22:00' && env.quiet[1] === '09:00' } catch { return false } })())
// ★★★**" 投 "那半边：发给远端成员 ⇒ 写远端 inbox/，本机不留第二份** ✗✓（2026-10-10 补）——
//   ★正本《跨设备邮局-1.0局域网实现清单》**§一 · S6** 原话 ✓：
//     ★"投：发给手机的 ⇒ 写远端 `inbox/潮信鲸/` ✓（★**本机不留第二份** ✗）"。
//   ★★**为什么补** ✗✓：★`pickup`（**取** 那半边 ✓）早就做了 ✓，★而 **`send` 从来只写本机** ✗
//     ⇒ ★★★**"投给手机"这件事在公开版里根本没实现** ✗✓ —— ★而清单把它算作 S6 的一半 ✓。
//   ⚠️ ★**本机不留第二份** ✗ —— ★★留了就会有**两份权威** ✓（★而两份会在"取件／回执／消费"上**各说各话** ✗）。
const fpRoot = join(process.env.TEMP ?? '/tmp', `whale-cli-fp-${Date.now()}`)
const fpTank = join(fpRoot, 'tank'); const fpMail = join(fpRoot, 'mail')
mkdirSync(fpTank, { recursive: true }); mkdirSync(fpMail, { recursive: true })
const fpRoster = JSON.stringify({ apiVersion: 1, members: [{ id: 'web' }, { id: 'phone', phone: true }] })
writeFileSync(join(fpTank, 'roster.json'), fpRoster, 'utf8'); writeFileSync(join(fpMail, 'roster.json'), fpRoster, 'utf8')
run(['hello', '--as', 'web', '--root', fpTank])
run(['hello', '--as', 'phone', '--root', fpMail])
const fpSend = run(['send', '--as', 'web', '--to', 'phone', '--body', '投远端测试（★正文有货，别当回执）', '--root', fpTank, '--remote', fpMail, '--remote-only', 'phone'])
check('★★★发给**远端成员** ⇒ 写远端 `inbox/` ✓（★★**本机不留第二份** ✗）',
  fpSend.status === 0 &&
  (() => { try { return readdirSync(join(fpMail, 'inbox', 'phone')).filter((f) => f.endsWith('.msg.json')).length === 1 } catch { return false } })() &&
  (() => { try { return readdirSync(join(fpTank, 'inbox', 'phone')).filter((f) => f.endsWith('.msg.json')).length === 0 } catch { return true } })())
check('★★没配 `--remote-only` ⇒ **照旧写本机** ✓（★不改旧行为 ✓）',
  (() => {
    try {
      const r = join(process.env.TEMP ?? '/tmp', `whale-cli-fp2-${Date.now()}`)
      mkdirSync(r, { recursive: true })
      writeFileSync(join(r, 'roster.json'), fpRoster, 'utf8')
      run(['hello', '--as', 'web', '--root', r]); run(['hello', '--as', 'phone', '--root', r])
      const s = run(['send', '--as', 'web', '--to', 'phone', '--body', '没配远端（★正文有货，别当回执）', '--root', r])
      return s.status === 0 && readdirSync(join(r, 'inbox', 'phone')).filter((f) => f.endsWith('.msg.json')).length === 1
    } catch { return false }
  })())

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
const pass = checks.filter((c) => c.ok).length
console.log(`\n${pass}/${checks.length} 通过`)
process.exit(pass === checks.length ? 0 : 1)
