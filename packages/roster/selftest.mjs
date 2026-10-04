/**
 * dsh-whale-post-roster 的加载级自测：真的 import、真的 apply、真的读一遍名单。
 * 判据看退出码：0 过／非 0 不过。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { apply, createRoster, apiVersion } from './index.js'

const tmp = join(process.env.TEMP ?? '/tmp', `whale-roster-selftest-${Date.now()}`)
const checks = []
const check = (name, ok, extra = '') => checks.push({ name, ok: !!ok, extra: String(extra) })
mkdirSync(tmp, { recursive: true })
const file = join(tmp, 'roster.json')

try {
  const provided = {}
  const roster = apply({ provide: (n, v) => { provided[n] = v } }, { file })
  check('加载级：apply() 不抛异常', !!roster)
  check('接口：ctx.provide("whale.roster") 挂上了', provided['whale.roster'] === roster)
  check('接口：最小集 list／has／label 齐全', ['list', 'has', 'label'].every((m) => typeof roster[m] === 'function'))
  check('接口：apiVersion 是数字', Number.isInteger(apiVersion))

  // ① 名单内容全部来自文件（★核心不认识任何名字）
  writeFileSync(file, JSON.stringify({ apiVersion: 1, members: [{ id: 'alice', label: 'Alice' }, { id: 'bob' }], groups: { all: ['alice', 'bob'], club: ['alice'] } }), 'utf8')
  check('名单：list 读到 2 人', roster.list().length === 2, JSON.stringify(roster.list()))
  check('名单：label 缺省退回 id', roster.label('bob') === 'bob')
  check('名单：has 认人', roster.has('alice') && !roster.has('zed'))
  check('组：group("club") 解析成 alice', JSON.stringify(roster.group('club')) === '["alice"]', JSON.stringify(roster.group('club')))
  check('组：不存在的组 ⇒ undefined（当人名处理）', roster.group('没有这个组') === undefined)

  // ② 没有名字写死在代码里（接口件的第一美德）—— 只允许出现在**文档注释**与 SAMPLE 样例块里
  const src = (await import('node:fs')).readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')                       // 去掉块注释（文档里的示例允许出现名字）
    .replace(/^\s*\/\/.*$/gm, '')                           // 去掉行注释
    .replace(/const SAMPLE = \{[\s\S]*?\n\}/, '')            // 去掉样例块（样例就是给外人抄的）
  const hard = ['alice', 'bob'].filter((n) => new RegExp(`\\b${n}\\b`).test(codeOnly))
  check('防泄露：核心代码里没有写死成员名（只在文档与样例里出现）', hard.length === 0, hard.join(','))

  // ③ 坏输入不炸（宁可变空名单，也不许抛未捕获异常）
  writeFileSync(file, '{ 这不是 JSON', 'utf8')
  check('坏名单：不抛异常，退化成空名单', Array.isArray(roster.list()) && roster.list().length === 0)
  writeFileSync(file, JSON.stringify([1, 2, 3]), 'utf8')
  check('坏名单：不是对象也不炸', Array.isArray(roster.list()))
  writeFileSync(file, JSON.stringify({ apiVersion: 99, members: [{ id: 'zed' }] }), 'utf8')
  check('apiVersion 不认识 ⇒ 退化成空名单（不猜、不硬读）', roster.list().length === 0 && !roster.has('zed'))

  // ④ 文件不存在 ⇒ 退化成空名单（不是崩溃）
  const r2 = createRoster({ file: join(tmp, '不存在.json') })
  check('文件不存在：空名单，不炸', r2.list().length === 0 && !r2.has('alice'))
} catch (err) {
  check('自测没有抛异常', false, err && err.stack ? err.stack.split('\n')[0] : err)
}

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
const pass = checks.filter((c) => c.ok).length
console.log(`\n${pass}/${checks.length} 通过`)
process.exit(pass === checks.length ? 0 : 1)
