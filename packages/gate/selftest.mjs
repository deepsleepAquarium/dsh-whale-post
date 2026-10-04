/**
 * dsh-whale-post-gate 的加载级自测：回环闸三道 ＋ 配额分桶 ＋ 两种越额档位。
 * 判据看退出码：0 过／非 0 不过。临时根，真数据零接触。
 */
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { apply, createGate, apiVersion } from './index.js'

const tmp = join(process.env.TEMP ?? '/tmp', `whale-gate-selftest-${Date.now()}`)
const checks = []
const check = (name, ok, extra = '') => checks.push({ name, ok: !!ok, extra: String(extra) })
mkdirSync(tmp, { recursive: true })
const L = (over = {}) => ({ as: 'alice', to: 'bob', targets: ['bob'], subject: 's', body: '正文有货，不是回执', mode: 'online', type: 'direct', ...over })

try {
  const provided = {}
  const gate = apply({ provide: (n, v) => { provided[n] = v } }, { root: tmp })
  check('加载级：apply() 不抛异常', !!gate)
  check('接口：ctx.provide("whale.gate") 挂上了', provided['whale.gate'] === gate)
  check('接口：apiVersion 是数字', Number.isInteger(apiVersion))
  check('接口：check() 在，返回 pass', gate.check(L()) === 'pass')

  // ① 回环闸①：纯回执
  const ack = gate.check(L({ body: '收到' }))
  check('回环闸①：纯回执拒发', ack && ack.reject === true && /纯回执/.test(ack.reason), JSON.stringify(ack))
  check('回环闸①：--force 放行（但留痕）', gate.check(L({ body: '收到', force: true })) === 'pass')

  // ② 回环闸②：同一对限封数（默认 20 分钟 3 封，第 4 封拒）
  const g2 = createGate({ root: tmp, loop: { pairMax: 3, pairWindowMs: 20 * 60 * 1000 } })
  for (let i = 1; i <= 3; i++) {
    check(`回环闸②：第 ${i} 封放行`, g2.check({ ...L(), as: 'dave' }) === 'pass')
    g2.record({ as: 'dave', to: 'bob', targets: ['bob'], mode: 'online', type: 'direct', body: '正文有货' })
  }
  const fourth = g2.check({ ...L(), as: 'dave' })
  check('回环闸②：第 4 封拒发', fourth && fourth.reject === true && /同对回环/.test(fourth.reason), JSON.stringify(fourth))

  // ③ 回环闸③：链深
  const hop = gate.check(L({ hop: 3 }))
  check('回环闸③：链深到顶拒发', hop && hop.reject === true && /链深/.test(hop.reason), JSON.stringify(hop))

  // ④ 配额：离线件按发信次数（组发也只算 1 条），且不并进"单位"
  const r1 = gate.record({ as: 'erin', to: 'all', targets: ['x', 'y', 'z'], mode: 'offline', type: 'direct', body: '组发只算 1 条' })
  const rep1 = gate.report({ as: 'erin' })
  check('配额：离线件组发只记 1 条', r1.units === 1 && r1.bucket === 'offline', JSON.stringify(r1))
  check('配额：离线条不并进"单位"', rep1.today.units === 0 && rep1.today.offlineLetters === 1, JSON.stringify(rep1.today))

  // ⑤ 配额：在线件按收件人数；组名可配成 1 单位（给 groupMembers 就按"组里算 1"）
  const r2 = gate.record({ as: 'erin', to: 'all', targets: ['x', 'y', 'z'], mode: 'online', type: 'broadcast', body: '在线件按人算' })
  const r3 = gate.record({ as: 'erin', to: 'club', targets: ['x', 'y', 'z'], mode: 'online', type: 'broadcast', body: '组名按组算 1', groupMembers: ['x', 'y'] })
  check('配额：在线件按收件人数计单位', r2.units === 3, JSON.stringify(r2))
  check('配额：组名里的成员合成 1 单位', r3.units === 2, JSON.stringify(r3))

  // ⑥ 越额：两种档位（reject 拒发 ／ price 照发但计费）
  const strict = createGate({ root: tmp, quota: { onOver: 'reject', types: { direct: { label: 'direct', limit: 1 } } } })
  strict.record({ as: 'frank', to: 'bob', targets: ['bob'], mode: 'online', type: 'direct', body: '占满额度' })
  const over = strict.check({ ...L(), as: 'frank' })
  check('越额（reject 档）：拒发并说明原因', over && over.reject === true && /越额拒发/.test(over.reason), JSON.stringify(over))
  const priced = createGate({ root: tmp, quota: { onOver: 'price', types: { direct: { label: 'direct', limit: 1 } } } })
  priced.record({ as: 'gina', to: 'bob', targets: ['bob'], mode: 'online', type: 'direct', body: '占满额度' })
  check('越额（price 档）：照发（闸是价格闸，不是封嘴闸）', priced.check({ ...L(), as: 'gina' }) === 'pass')
  const charge = priced.record({ as: 'gina', to: 'bob', targets: ['bob'], mode: 'online', type: 'direct', body: '越额那一封要计费' })
  check('越额（price 档）：记账计费', charge.over === 1 && charge.feeCent > 0, JSON.stringify(charge))

  // ⑦ 日界可配（默认自然日；写成 9 就是"早九点到次日早九点算一天"）
  const g9 = createGate({ root: tmp, quota: { dayBoundaryHour: 9 } })
  const day = g9.localDay(new Date('2026-10-05T02:00:00').getTime())
  check('日界：凌晨 2 点算前一天（09:00 分界）', day === '2026-10-04', day)

  // ⑨ ★别让闸的类型表变成"第二套真相"（独立审计 2026-10-05）：不在桶表里的类型 ⇒ 落**默认桶**，不许拒
  const g10 = createGate({ root: tmp, quota: { defaultLimit: 7, types: { direct: { label: 'direct', limit: 100 } } } })
  check('新类型：不在桶表里 ⇒ 落默认桶、放行（不拒）', g10.check({ as: 'helen', to: 'bob', targets: ['bob'], mode: 'online', type: 'internal-note', body: '新注册的类型不该被闸拒掉（正文有货，不是回执）' }) === 'pass')
  const rec9 = g10.record({ as: 'helen', to: 'bob', targets: ['bob'], mode: 'online', type: 'internal-note', body: '新类型走默认桶' })
  check('新类型：记在它自己的桶里、用默认额度', rec9.bucket === 'internal-note' && rec9.limit === 7, JSON.stringify(rec9))

  // ⑩ ★回执闸中英都认（独立审计：原来只认中文 ⇒ 英文回执成了绕过闸的后门）
  for (const t of ['got it — thanks, all clear', 'OK', 'noted, thanks']) {
    const r = gate.check(L({ as: 'irene', body: t }))
    check(`回执闸（英文）：拒「${t}」`, r && r.reject === true && /纯回执/.test(r.reason), JSON.stringify(r))
  }
  check('回执闸：真内容（含事实）放行', gate.check(L({ as: 'irene', body: 'got it — 我已经把第 3 项改完了，另外发现第 7 项也有问题' })) === 'pass')

  // ⑧ 台账落盘
  check('台账：state/quota-<谁>.json 落盘了', existsSync(join(tmp, 'state', 'quota-erin.json')))
} catch (err) {
  check('自测没有抛异常', false, err && err.stack ? err.stack.split('\n')[0] : err)
}

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
const pass = checks.filter((c) => c.ok).length
console.log(`\n${pass}/${checks.length} 通过   （临时邮局：${tmp}）`)
process.exit(pass === checks.length ? 0 : 1)
