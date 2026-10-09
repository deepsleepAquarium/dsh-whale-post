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

  // ★★分桶规则（2026-10-10 缸内口径移植：就是"按授权级别分四档"那种）——
  //   ★字段名与桶名**全由配置给**，本件里不出现任何具体名字 ✓
  const g4 = createGate({ root: tmp, quota: {
    bucketRules: [
      { field: 'lvl', equals: 'a', bucket: 'tierA' },
      { field: 'lvl', equals: 'b', bucket: 'tierB' },
      { field: 'mode', equals: 'offline', bucket: 'off' },
    ],
    defaultBucket: 'tierA',
    types: {
      tierA: { label: 'tierA', limit: 2 },
      tierB: { label: 'tierB', limit: 5 },
      off: { label: 'off', limit: 9, perSend: true },
    },
  } })
  const rA = g4.record({ as: 'hank', to: 'bob', targets: ['bob'], mode: 'online', type: 'direct', body: '正文有货，别当回执', lvl: 'a' })
  check('★分桶规则：命中的规则 ⇒ 落它指定的桶', rA.bucket === 'tierA', JSON.stringify(rA))
  const rB = g4.record({ as: 'hank', to: 'bob', targets: ['bob'], mode: 'online', type: 'direct', body: '正文有货，别当回执', lvl: 'b' })
  check('★分桶规则：第二条规则也认', rB.bucket === 'tierB', JSON.stringify(rB))
  const rOff = g4.record({ as: 'hank', to: 'bob', targets: ['bob'], mode: 'offline', type: 'direct', body: '正文有货，别当回执' })
  check('★分桶规则：从上往下第一个命中的赢（离线落 off 桶）', rOff.bucket === 'off', JSON.stringify(rOff))
  const rOffG = g4.record({ as: 'hank', to: 'all', targets: ['x', 'y', 'z'], mode: 'offline', type: 'direct', body: '正文有货，别当回执' })
  check('★分桶规则：落在 perSend 桶 ⇒ 组发也只算 1 条', rOffG.units === 1, JSON.stringify(rOffG))
  const rNone = g4.record({ as: 'hank', to: 'bob', targets: ['bob'], mode: 'online', type: 'direct', body: '正文有货，别当回执', lvl: 'zzz' })
  check('★分桶规则：都不命中 ⇒ 落 defaultBucket（不掉进"没有配额"）', rNone.bucket === 'tierA', JSON.stringify(rNone))
  const g5 = createGate({ root: tmp, quota: { types: { direct: { label: 'direct', limit: 9 }, offline: { label: '离线', limit: 9, perSend: true } } } })
  const rOld1 = g5.record({ as: 'iris', to: 'bob', targets: ['bob'], mode: 'online', type: 'direct', body: '正文有货，别当回执', lvl: 'a' })
  const rOld2 = g5.record({ as: 'iris', to: 'bob', targets: ['bob'], mode: 'offline', type: 'direct', body: '正文有货，别当回执', lvl: 'a' })
  check('★★分桶规则：不配 ⇒ 行为一字不变（在线按 type、离线走 offline 桶）',
    rOld1.bucket === 'direct' && rOld2.bucket === 'offline', JSON.stringify([rOld1.bucket, rOld2.bucket]))

  // ★★S8 手机在线件小日上限（2026-10-10 从缸里正本移植）——
  //   ★**每封在线件 ＝ 叫醒一个成员做一次满上下文推理**（最贵的那一步）
  //   ⇒ ★额度 ＝ **min(收件人自报, phoneOnlineCap)**，★**声明只能更保守** ✓
  //   ★"谁算手机"由配置给（phoneFlag）✓ —— 闸里不出现任何具体属性名 ✓
  const rosterS8 = { flag: (id, name) => name === 'ph' && String(id) === 'phone' }
  const gS8 = createGate({ root: tmp, quota: { phoneFlag: 'ph', phoneOnlineCap: 3 } })
  const ctxS8 = (cap) => ({ roster: rosterS8, declaredCaps: cap === undefined ? {} : { phone: cap } })
  const L8 = (over = {}) => ({ as: 's8user', to: 'phone', targets: ['phone'], mode: 'online', type: 'direct', body: '在线件（正文有货，别当回执）', ...over })
  check('★S8：不配 phoneFlag ⇒ 这道闸完全不启用（向后兼容）',
    createGate({ root: tmp }).check(L8(), { roster: rosterS8, declaredCaps: {} }) === 'pass')
  check('★S8：非"手机"成员 ⇒ 不适用（★属性名由配置给）',
    gS8.check(L8({ to: 'qq', targets: ['qq'] }), ctxS8(1)) === 'pass')
  check('★S8：离线件**不受这条限**', gS8.check(L8({ mode: 'offline' }), ctxS8(0)) === 'pass')
  check('★★S8：额度 ＝ min(自报 2, 天花板 3) ⇒ 头两封过、第三封拦',
    (() => {
      const lg = createGate({ root: tmp, quota: { phoneFlag: 'ph', phoneOnlineCap: 3 } })
      lg.record(L8(), ['phone']); lg.record(L8(), ['phone'])
      const r = lg.check(L8(), ctxS8(2))
      return r !== 'pass' && r.reject === true && /在线件上限/.test(r.reason)
    })())
  check('★★S8：**自报更保守**（自报 1 < 天花板 3 ⇒ 发完 1 封就拦）',
    (() => {
      const lg = createGate({ root: tmp, quota: { phoneFlag: 'ph', phoneOnlineCap: 3 } })
      lg.record(L8(), ['phone'])
      const r = lg.check(L8(), ctxS8(1))
      return r !== 'pass' && /额度是 1 封/.test(r.reason)
    })())
  check('★S8：**没自报** ⇒ 用天花板（★"没说"不等于"可以一直叫醒它"）',
    (() => {
      const lg = createGate({ root: tmp, quota: { phoneFlag: 'ph', phoneOnlineCap: 1 } })
      lg.record(L8(), ['phone'])
      return lg.check(L8(), ctxS8(undefined)) !== 'pass'
    })())
  check('★★S8：`--force` **不豁免**（★它保护的是收件人的推理代价，不是"省米"）',
    (() => {
      const lg = createGate({ root: tmp, quota: { phoneFlag: 'ph', phoneOnlineCap: 1 } })
      lg.record(L8(), ['phone'])
      return lg.check(L8({ force: true }), ctxS8(undefined)) !== 'pass'
    })())
  check('★S8：拿不到名单 ⇒ **不拦**（宁可放过，不冤枉 ✓）',
    createGate({ root: tmp, quota: { phoneFlag: 'ph', phoneOnlineCap: 1 } })
      .check(L8({ as: 's8noroster' }), { declaredCaps: {} }) === 'pass')
} catch (err) {
  check('自测没有抛异常', false, err && err.stack ? err.stack.split('\n')[0] : err)
}

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
const pass = checks.filter((c) => c.ok).length
console.log(`\n${pass}/${checks.length} 通过   （临时邮局：${tmp}）`)
process.exit(pass === checks.length ? 0 : 1)
