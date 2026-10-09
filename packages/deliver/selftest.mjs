/**
 * dsh-whale-post-deliver 的加载级自测 —— ★这一件管的是"信会不会丢"。
 * 判据看退出码：0 过／非 0 不过。
 */
import { apply, createDeliver, apiVersion } from './index.js'

const checks = []
const check = (name, ok, extra = '') => checks.push({ name, ok: !!ok, extra: String(extra) })
const letter = (over = {}) => ({ id: 'x-1', from: 'alice', to: 'bob', subject: 's', body: 'b', mode: 'offline', ...over })

try {
  const injected = []
  const provided = {}
  const deliver = apply(
    { provide: (n, v) => { provided[n] = v } },
    { sessionOf: (id) => (id === 'live-one' ? { live: true, inject: (t) => injected.push(t) } : undefined) },
  )
  check('加载级：apply() 不抛异常', !!deliver)
  check('接口：ctx.provide("whale.deliver") 挂上了', provided['whale.deliver'] === deliver)
  check('接口：apiVersion 是数字', Number.isInteger(apiVersion))
  check('接口：deliver(letter, ctx) 是函数', typeof deliver.deliver === 'function')

  // ① 离线件 ⇒ kept（信已经在信箱里躺着，不叫醒任何人）
  check('离线件 ⇒ kept', deliver.deliver(letter(), { targets: ['bob'] }) === 'kept')

  // ② 在线 ＋ 对方有活体会话 ⇒ delivered，且真的注入了
  const v = deliver.deliver(letter({ to: 'live-one', mode: 'online' }), { targets: ['live-one'] })
  check('在线 ＋ 有会话 ⇒ delivered', v === 'delivered', v)
  check('在线 ＋ 有会话 ⇒ 真的注入了一次', injected.length === 1 && injected[0].includes('在线邮件'), JSON.stringify(injected))

  // ③ ★只投活体：对方没有会话 ⇒ kept（信留着，绝不丢）
  check('在线 ＋ 没会话 ⇒ kept（信只会晚到，不会不到）', deliver.deliver(letter({ to: 'bob', mode: 'online' }), { targets: ['bob'] }) === 'kept')

  // ④ ★注入失败 ⇒ 也 kept（绝不许因为"投不进去"就把信丢掉）
  const thrower = createDeliver({ sessionOf: () => ({ live: true, inject: () => { throw new Error('会话炸了') } }) })
  check('注入抛异常 ⇒ kept（信不丢）', thrower.deliver(letter({ mode: 'online' }), { targets: ['bob'] }) === 'kept')

  // ⑤ 被明确挡掉的收件人 ⇒ rejected
  const blocked = createDeliver({ blocked: ['troll'] })
  check('名单里挡掉的人 ⇒ rejected', blocked.deliver(letter({ to: 'troll' }), { targets: ['troll'] }) === 'rejected')

  // ⑥ 群发：有的有会话、有的没有 ⇒ delivered（至少送达一份），且没会话那份仍是"留着"
  const mixed = createDeliver({ sessionOf: (id) => (id === 'live-one' ? { live: true, inject: () => {} } : undefined) })
  check('群发：有人活 ⇒ delivered', mixed.deliver(letter({ mode: 'online', to: 'all' }), { targets: ['live-one', 'bob'] }) === 'delivered')

  // ⑦ 核心不认识"会话"概念：不给探针 ⇒ 一律 kept（保守，信不丢）
  const bare = createDeliver({})
  check('没有会话探针 ⇒ 一律 kept（保守优先）', bare.deliver(letter({ mode: 'online' }), { targets: ['bob'] }) === 'kept')

  // ⑧ ★"活着"与"能投"是两件事（独立审计 2026-10-05 的变异点）：探针说 `live:false` 却给了 inject
  //    ⇒ 仍**不许**投 —— 不许拿"有 inject"替代"会话活着"
  const halfLive = createDeliver({ sessionOf: () => ({ live: false, inject: () => { throw new Error('不该被调用') } }) })
  check('live:false 但给了 inject ⇒ 仍 kept（不许用 inject 顶替"活着"）', halfLive.deliver(letter({ mode: 'online' }), { targets: ['bob'] }) === 'kept')

  // ★★S10 v2 休眠判定（2026-10-10 从缸里正本移植）——
  //   ★v1 的教训：**不许拿「邮差还活着」当「它在读信」**（缸里小毛咪的邮差每 10 分钟续 hello，可她本人不读信）
  //   ⇒ ① 明示位（declared）② **推断**（★信箱里最老的一封没读的信躺了多久 —— 这才是"没读信"的明证）
  //   ⚠️ ★**没有积压 ⇒ 不许判休眠** ✗；★**不知道就说 `unknown`** ✗（不许把"不知道"说成"休眠" ✓）
  const DAY = 24 * 3600 * 1000
  const NOW = Date.parse('2026-10-10T02:00:00Z')
  const mkD = (oldestDays, declared) => createDeliver({
    now: () => NOW,
    declaredDormant: (w) => declared === true && w === 'sleepy',
    oldestPendingMs: (w) => (oldestDays === null ? 0 : NOW - oldestDays * DAY),
  })
  check('★休眠：明示位 ⇒ dormant ＋ source=declared（★是"声明"，不是"推断"）',
    (() => { const d = mkD(0, true).dormancyOf('sleepy'); return d.state === 'dormant' && d.source === 'declared' })())
  check('★★休眠：无明示位、无积压 ⇒ **unknown**（★"我们不知道" ≠ "它休眠" ✗）',
    (() => { const d = mkD(null, false).dormancyOf('bob'); return d.state === 'unknown' && d.source === 'none' })())
  check('★休眠：**没接探针** ⇒ 也如实报 unknown（不知道就说不知道）', createDeliver({}).dormancyOf('bob').state === 'unknown')
  check('★休眠：积压 1 天（soft=3）⇒ awake ＋ source=inferred',
    (() => { const d = mkD(1, false).dormancyOf('bob'); return d.state === 'awake' && d.source === 'inferred' })())
  check('★休眠：积压 4 天（soft～hard）⇒ quiet',
    mkD(4, false).dormancyOf('bob').state === 'quiet')
  check('★休眠：积压 9 天（≥hard=7）⇒ dormant',
    mkD(9, false).dormancyOf('bob').state === 'dormant')
  check('★休眠：阈值可配（soft=1／hard=2 ⇒ 积压 3 天就是 dormant）',
    createDeliver({ dormantSoftDays: 1, dormantHardDays: 2, now: () => NOW, oldestPendingMs: () => NOW - 3 * DAY }).dormancyOf('bob').state === 'dormant')
  check('★★休眠：明示位**优先于**推断（积压 0 天但被明确标了 ⇒ 仍是 dormant/declared）',
    (() => { const d = mkD(null, true).dormancyOf('sleepy'); return d.state === 'dormant' && d.source === 'declared' })())
  // ★明示休眠的收件人 ⇒ 退回（与核心同口径：--force 也不豁免）
  check('★休眠：明示休眠的收件人 ⇒ rejected（退回）',
    mkD(0, true).deliver(letter({ to: 'sleepy', mode: 'online' }), { targets: ['sleepy'] }) === 'rejected')
  check('★休眠：**只是安静**（inferred quiet）⇒ 不退回（★不许自己猜休眠 ✗）',
    mkD(4, false).deliver(letter({ to: 'bob', mode: 'offline' }), { targets: ['bob'] }) === 'kept')
} catch (err) {
  check('自测没有抛异常', false, err && err.stack ? err.stack.split('\n')[0] : err)
}

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
const pass = checks.filter((c) => c.ok).length
console.log(`\n${pass}/${checks.length} 通过`)
process.exit(pass === checks.length ? 0 : 1)
