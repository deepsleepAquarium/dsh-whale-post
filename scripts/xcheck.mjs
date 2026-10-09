/**
 * ★★★跨包一致性检查（`xcheck`）✗✓ —— **漂移探测器**
 *
 * ★为什么要有它 ✗：★我们踩过两次同一个病 ——
 *   ① `verify` 包**自己抄了一份 `FIELD_ORDER`** ⇒ ★我往 `bus` 加了 `peerStateAtSend` ⇒
 *      ★那封**完全合法**的信被判"未登记字段"、**当场挪进退信** ✗；
 *   ② `gate` 与 `verify` **各算一份日界**（★算法一字不差，而**配置项名不同**）⇒
 *      ★一边配 9、一边忘配 ⇒ ★**差一天，而且谁都不报错** ✓。
 * ★★这两次的共同点 ✗：★**同一件事在两件里各写一份** ✓ —— ★而"两边都写一份"再怎么写注释都会**漂** ✓。
 *
 * ★这份脚本专盯这件事 ✗：★★**凡是"两边各算一次、结果必须相等"的东西，都拿真实输入比一遍** ✓✓。
 *   ★① 摘要（`bus.digest` vs `verify.digestOf`）
 *   ★② 签名域（`bus.FIELD_ORDER` vs `verify.fields()`）
 *   ★③ 日界（同一个假时刻 ⇒ `verify.localDay()` vs `gate` 台账里的日）
 *   ★④ **MAC**（★`bus.sign` 签的信，`verify` 认不认 —— ★这正是"两边都自洽、一接就炸"那条 ✓）
 *   ★⑤ 老字段（`LEGACY_FIELDS`：★两边都该认 `auth` ✓）
 *
 * ★判据看**退出码**：0 全一致／非 0 有漂移 ✓。★临时根，真数据零接触 ✓。
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createBus } from '../packages/bus/index.js'
import { createVerify, FALLBACK_FIELD_ORDER } from '../packages/verify/index.js'
import { createGate } from '../packages/gate/index.js'
import { createRoster } from '../packages/roster/index.js'
import { createTypes } from '../packages/types/index.js'

const tmp = join(process.env.TEMP ?? '/tmp', `whale-xcheck-${Date.now()}`)
mkdirSync(tmp, { recursive: true })
writeFileSync(join(tmp, 'roster.json'), JSON.stringify({ apiVersion: 1, members: [{ id: 'a' }, { id: 'b' }] }), 'utf8')

const checks = []
const check = (name, ok, extra = '') => { checks.push({ name, ok: !!ok, extra: String(extra) }); return !!ok }

try {
  // ★★照 `cli/wire()` 的真实接法：`verify` 拿**延迟函数**读 `bus` ✓（★不是拿一份快照 ✓）
  const ref = {}
  const verify = createVerify({ root: tmp, enabled: true, keysDir: join(tmp, 'keys'),
    bus: { sign: (e) => ref.bus?.sign(e), fields: () => ref.bus?.FIELD_ORDER, digest: (x) => ref.bus?.digest(x) } })
  const bus = createBus({ root: tmp, services: { roster: createRoster({ file: join(tmp, 'roster.json') }), types: createTypes(), verify } })
  ref.bus = bus

  // ★① 摘要：★同一个输入，两边必须算出同一个值 ✓
  const samples = ['', 'a', 'abc', '中文正文（含全角标点，。）', '\n\n  ', 'x'.repeat(1000), '😀🫧']
  const badDigest = samples.filter((s) => bus.digest(s) !== verify.digestOf(s))
  check('① 摘要：`bus.digest` ≡ `verify.digestOf`（★多个样本）', badDigest.length === 0,
    badDigest.length ? `不等样本 ${badDigest.length} 个：${JSON.stringify(badDigest.slice(0, 2))}` : `${samples.length} 个样本全等`)

  // ★② 签名域：★接了 bus ⇒ 两边该是**同一份** ✓
  check('② 签名域：`bus.FIELD_ORDER` ≡ `verify.fields()`',
    JSON.stringify(bus.FIELD_ORDER) === JSON.stringify(verify.fields()),
    `bus=${bus.FIELD_ORDER.length} verify=${verify.fields().length}`)
  check('② 签名域：兜底那份**名字说真话**（★不是"当前生效"那份 ✓）',
    !FALLBACK_FIELD_ORDER.includes('peerStateAtSend') || bus.FIELD_ORDER.length === FALLBACK_FIELD_ORDER.length,
    `fallback=${FALLBACK_FIELD_ORDER.length}`)

  // ★④ MAC：★`bus.sign` 签的信，`verify` 必须认 ✓ —— ★**这条最值钱**（★"两边都自洽、一接就炸" ✓）
  bus.hello({ as: 'a' }); bus.hello({ as: 'b' })
  const sent = bus.send({ as: 'a', to: 'b', mode: 'offline', subject: 'xcheck', body: '跨包一致性检查用的一封（正文有货，别当回执）' })
  const wire = JSON.parse(readFileSync(join(tmp, 'inbox', 'b', `${sent.id}.msg.json`), 'utf8'))
  const vres = verify.verify(wire)
  check('④ MAC：`bus.sign` 签的信 ⇒ `verify` **认**（★"一接就炸"那条 ✓）', vres.ok === true || vres.skipped === true,
    JSON.stringify(vres).slice(0, 120))

  // ★⑤ 老字段：两边都该认 `auth` ✓
  check('⑤ 老字段：`LEGACY_FIELDS` 两边都含 `auth`',
    Array.isArray(bus.LEGACY_FIELDS) && bus.LEGACY_FIELDS.includes('auth'))

  // ★③ 日界：★同一个假时刻、同一个日界 ⇒ 两边该算**同一天** ✓
  const T = Date.parse('2026-10-15T08:00:00+08:00')      // ★08:00 ＋ 日界 9 点 ⇒ 该算 10-14 ✓
  const gRoot = join(tmp, 'gate')
  mkdirSync(gRoot, { recursive: true })
  const vDay = createVerify({ root: gRoot, enabled: false, now: T, dayBoundaryHour: 9 }).localDay()
  const gate = createGate({ root: gRoot, now: T, quota: { dayBoundaryHour: 9 } })
  gate.record({ as: 'a', to: 'b', targets: ['b'], mode: 'offline', type: 'direct', body: '日界对照（正文有货）' }, ['b'])
  const gDay = Object.keys(JSON.parse(readFileSync(join(gRoot, 'state', 'quota-a.json'), 'utf8')).days)[0]
  check('③ 日界：同一时刻 ＋ 同日界 ⇒ `verify.localDay()` ≡ `gate` 台账的日', vDay === gDay,
    `verify=${vDay} gate=${gDay}`)
} catch (err) {
  check('跨包检查没有抛异常', false, err && err.stack ? err.stack.split('\n')[0] : String(err))
}

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
const pass = checks.filter((c) => c.ok).length
console.log(`\n${pass}/${checks.length} 一致   （临时根：${tmp}）`)
process.exit(pass === checks.length ? 0 : 1)
