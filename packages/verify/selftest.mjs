/**
 * dsh-whale-post-verify 的加载级自测：真的 import、真的 apply、真的走三态与验签。
 * 判据看退出码：0 过／非 0 不过。
 *
 * ★覆盖四组：
 *   ① 加载级与接口形状  ② ★三态设计（默认禁用／提示／连提三天／开启后不再提）
 *   ③ 验签 fail-closed（摘要／签名／未登记字段／缺字段／白名单／★冒名）
 *   ④ 防泄露（代码里没有写死成员名）＋ 坏输入不炸
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { createHash, createHmac } from 'node:crypto'
import { join } from 'node:path'
import { apply, createVerify, apiVersion, FIELD_ORDER } from './index.js'

const tmp = join(process.env.TEMP ?? '/tmp', `whale-verify-selftest-${Date.now()}`)
const checks = []
const check = (name, ok, extra = '') => checks.push({ name, ok: !!ok, extra: String(extra) })
mkdirSync(tmp, { recursive: true })

const KEY_A = 'a'.repeat(64)
const KEY_B = 'b'.repeat(64)
const digest = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex')
const mac = (env, key) => {
  const canonical = JSON.stringify(FIELD_ORDER.filter((k) => env[k] !== undefined).map((k) => [k, env[k]]))
  return createHmac('sha256', key).update(canonical, 'utf8').digest('hex')
}
const letter = (over = {}, key = KEY_A, from = 'alice') => {
  const env = { v: 1, kind: 'msg', id: 'm-test-1', from, to: 'bob', seq: 1, subject: 's', body: 'hello', sha256: digest('hello'), sentAtMs: 1, type: 'direct', mode: 'offline', ...over }
  env.mac = mac(env, key)
  return env
}

const DAY = 24 * 3600 * 1000
const mk = (opts = {}) => createVerify({ root: tmp, enabled: true, allow: [], keysDir: join(tmp, 'keys'), keyFile: join(tmp, 'signing.key'), ...opts })

try {
  // ── ① 加载级与接口形状 ───────────────────────────────────────────────
  const provided = {}
  const v = apply({ provide: (n, val) => { provided[n] = val } }, { root: tmp, enabled: true })
  check('加载级：apply() 不抛异常', !!v)
  check('接口：ctx.provide("whale.verify") 挂上了', provided['whale.verify'] === v)
  check('接口：verify／nag／status／enable／disable 齐全', ['verify', 'nag', 'status', 'enable', 'disable'].every((m) => typeof v[m] === 'function'))
  check('接口：apiVersion 是数字', Number.isInteger(apiVersion))
  check('接口：签名域与 bus 一致（★mode 在里面）', FIELD_ORDER.includes('mode') && FIELD_ORDER.includes('re'))

  // 造钥匙
  const keysDir = join(tmp, 'keys')
  mkdirSync(keysDir, { recursive: true })
  writeFileSync(join(keysDir, 'alice.key'), KEY_A + '\n', 'utf8')
  writeFileSync(join(keysDir, 'bob.key'), KEY_B + '\n', 'utf8')

  // ── ② 三态设计 ──────────────────────────────────────────────────────
  const t0 = Date.parse('2026-10-10T10:00:00+08:00')
  const off = (now) => mk({ enabled: false, now })
  const s0 = off(t0).status()
  check('★三态：默认（enabled 不写）就是**禁用**', mk({ enabled: undefined }).status().enabled === false)
  check('三态：禁用时 status 如实显示 enabled=false', s0.enabled === false)
  const r0 = off(t0).verify(letter())
  check('★三态：禁用时 verify 放行，但带 skipped:true（不假装验过）', r0.ok === true && r0.skipped === true, JSON.stringify(r0))

  const d1 = off(t0)
  const n1 = d1.nag()
  check('★提示：未开启时 nag() 返回文案', typeof n1 === 'string' && n1.includes('禁用中'), String(n1).slice(0, 40))
  check('提示：文案里建议开启并说明原因', String(n1).includes('建议开启') && String(n1).includes('欺骗'))
  check('★提示：同一天再调 ⇒ null（一天至多一次）', off(t0).nag() === null || (() => { const x = off(t0); x.nag(); return x.nag() === null })())
  const n2 = off(t0 + DAY).nag()
  check('★提示：第 2 天返回一次', typeof n2 === 'string')
  const n3 = off(t0 + 2 * DAY).nag()
  check('★提示：第 3 天返回一次', typeof n3 === 'string')
  const n4 = off(t0 + 3 * DAY).nag()
  check('★★提示：第 4 天起 ⇒ null（★视为执意，不再提）', n4 === null, String(n4))
  const n5 = off(t0 + 9 * DAY).nag()
  check('★提示：第 10 天仍 null（不再复发）', n5 === null)
  const st4 = off(t0 + 3 * DAY).status()
  check('★提示：不再提示 ≠ 关掉安全 —— status 仍如实显示 false', st4.enabled === false && st4.dayIndex >= 3, JSON.stringify(st4))

  const en = mk({ enabled: true, now: t0 })
  check('★三态：开启后 nag() 恒 null', en.nag() === null && en.nag() === null)
  check('★三态：status 显示 enabled=true', en.status().enabled === true)
  const offThenOn = off(t0 + 4 * DAY)
  offThenOn.nag()
  offThenOn.enable()
  check('★三态：第 4 天后手动开启 ⇒ 立刻不再提示且 enabled=true', offThenOn.nag() === null && offThenOn.status().enabled === true)
  check('★三态：开启时刻留痕 enabledAt', typeof offThenOn.status().enabledAt === 'string' && offThenOn.status().enabledAt.length > 10)

  // ── ③ 验签 fail-closed ──────────────────────────────────────────────
  const on = mk({ enabled: true, now: t0 })
  const good = letter()
  check('验签：正常信 ⇒ 过', on.verify(good).ok === true, JSON.stringify(on.verify(good)))
  check('验签：正文改一个字节 ⇒ 不过', on.verify({ ...good, body: 'hellp' }).ok === false)
  check('验签：签名改一个字 ⇒ 不过', on.verify({ ...good, mac: good.mac.slice(0, -1) + '0' }).ok === false)
  check('验签：去掉 mac ⇒ 不过', on.verify({ ...good, mac: undefined }).ok === false)
  check('★验签：出现未登记字段 ⇒ 不过（加字段忘了进签名域＝可被随便改）', on.verify({ ...good, extra: 'x' }).ok === false)
  check('验签：缺必填字段 ⇒ 不过', on.verify({ ...good, from: undefined }).ok === false)
  check('验签：收件人不在白名单 ⇒ 不过', mk({ enabled: true, now: t0, allow: ['carol'] }).verify(good).ok === false)
  check('验签：白名单里有发件人 ⇒ 过', mk({ enabled: true, now: t0, allow: ['alice'] }).verify(good).ok === true)
  check('验签：白名单空数组 ⇒ 不限制', mk({ enabled: true, now: t0, allow: [] }).verify(good).ok === true)

  // ★★ 冒名：拿 bob 的钥匙签"发件人＝alice" ⇒ 必须不过（每设备钥匙的核心价值）
  const forged = letter({ from: 'alice' }, KEY_B)
  const rForge = on.verify(forged)
  check('★★冒名：用别人的钥匙签我的名字 ⇒ 必须不过', rForge.ok === false, JSON.stringify(rForge))
  // 而 bob 用 bob 的钥匙签自己 ⇒ 过
  check('冒名对照：bob 用 bob 的钥匙签自己 ⇒ 过', on.verify(letter({ from: 'bob' }, KEY_B, 'bob')).ok === true)

  // ★ 没有专用钥 ⇒ 回落共享钥
  writeFileSync(join(tmp, 'signing.key'), 'c'.repeat(64) + '\n', 'utf8')
  const noDedicated = createVerify({ root: tmp, enabled: true, now: t0, keysDir: join(tmp, 'nokeys'), keyFile: join(tmp, 'signing.key') })
  check('回落：没有专用钥时用共享钥（★老信老成员一字不改）', noDedicated.verify(letter({}, 'c'.repeat(64), 'carol')).ok === true)
  check('回落对照：共享钥签的人，专用钥目录里没有 ⇒ 仍过', noDedicated.verify(letter({}, 'c'.repeat(64), 'carol')).ok === true)

  // ── ④ 防泄露 ＋ 坏输入不炸 ──────────────────────────────────────────
  const src = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const hard = ['alice', 'bob', 'carol'].filter((n) => new RegExp(`\\b${n}\\b`).test(codeOnly))
  check('防泄露：核心代码里没有写死成员名（只在注释里出现）', hard.length === 0, hard.join(','))

  check('坏输入：letter 是 null ⇒ 不抛，判不过', on.verify(null).ok === false)
  check('坏输入：letter 是空对象 ⇒ 不抛，判不过', on.verify({}).ok === false)
  const bad = join(tmp, 'badcase')
  mkdirSync(join(bad, 'state'), { recursive: true })
  writeFileSync(join(bad, 'state', 'security-nag.json'), '{ 这不是 JSON', 'utf8')
  const vb = createVerify({ root: bad, enabled: false, now: t0 })
  check('坏输入：状态文件不是 JSON ⇒ 不炸，从零起', vb.status().enabled === false && vb.nag() !== null)
  const vb2 = createVerify({ root: join(tmp, '不存在'), enabled: false, now: t0 })
  check('坏输入：根目录不存在 ⇒ 不炸', vb2.status().enabled === false && vb2.nag() !== null)
} catch (err) {
  check('自测没有抛异常', false, err && err.stack ? err.stack.split('\n')[0] : err)
}

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
const pass = checks.filter((c) => c.ok).length
console.log(`\n${pass}/${checks.length} 通过`)
process.exit(pass === checks.length ? 0 : 1)
