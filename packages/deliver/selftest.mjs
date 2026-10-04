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
} catch (err) {
  check('自测没有抛异常', false, err && err.stack ? err.stack.split('\n')[0] : err)
}

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
const pass = checks.filter((c) => c.ok).length
console.log(`\n${pass}/${checks.length} 通过`)
process.exit(pass === checks.length ? 0 : 1)
