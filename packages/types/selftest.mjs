/**
 * dsh-whale-post-types 的加载级自测：真的 import、真的 apply、真的注册一个新类型。
 * 判据看退出码：0 过／非 0 不过。
 */
import { readFileSync } from 'node:fs'
import { apply, createTypes, apiVersion } from './index.js'

const checks = []
const check = (name, ok, extra = '') => checks.push({ name, ok: !!ok, extra: String(extra) })

try {
  const provided = {}
  const types = apply({ provide: (n, v) => { provided[n] = v } }, {})
  check('加载级：apply() 不抛异常', !!types)
  check('接口：ctx.provide("whale.types") 挂上了', provided['whale.types'] === types)
  check('接口：最小集 register／resolve／list 齐全', ['register', 'resolve', 'list'].every((m) => typeof types[m] === 'function'))
  check('接口：apiVersion 是数字', Number.isInteger(apiVersion))

  // ① 随包只给三个样例类型（不是"我们的表"）
  const ids = types.list().map((t) => t.id)
  check('样例：正好是 direct／broadcast／club', JSON.stringify(ids.sort()) === JSON.stringify(['broadcast', 'club', 'direct']), JSON.stringify(ids))

  // ② 未注册的类型 ⇒ resolve 返回 undefined（⇒ 上层当场拒发）
  check('未注册：resolve 返回 undefined（不猜、不兜底）', types.resolve('没注册的类型') === undefined)

  // ③ ★可扩展：加一个新类型，核心一行都不用动（这就是"接口化"的可执行证明）
  const before = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  types.register('urgent-ish', { label: '急件（样例）', urgent: true, priority: 10 })
  check('扩展：新注册的类型能查到', types.resolve('urgent-ish')?.urgent === true)
  check('扩展：list 里出现新类型', types.list().some((t) => t.id === 'urgent-ish'))
  check('扩展：核心源码没为此改动（同一个文件、同一段代码）', before === readFileSync(new URL('./index.js', import.meta.url), 'utf8'))

  // ④ 坏输入：空标识当场拒
  check('坏输入：register("") ⇒ 抛（不当成默认类型）', (() => { try { types.register(''); return false } catch { return true } })())
  check('坏输入：resolve(null) ⇒ undefined（不炸）', types.resolve(null) === undefined)

  // ⑤ 元数据默认值（label 缺省＝id；billable 缺省 true）
  types.register('plain')
  check('默认值：label 缺省＝id、billable 缺省 true', types.resolve('plain').label === 'plain' && types.resolve('plain').billable === true)
} catch (err) {
  check('自测没有抛异常', false, err && err.stack ? err.stack.split('\n')[0] : err)
}

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
const pass = checks.filter((c) => c.ok).length
console.log(`\n${pass}/${checks.length} 通过`)
process.exit(pass === checks.length ? 0 : 1)
void createTypes
