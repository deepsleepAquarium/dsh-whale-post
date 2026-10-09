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

  // ★★成员属性（2026-10-10）：通用读取 —— ★属性名由调用方给，本插件里不出现任何具体属性名 ✓
  //   两种写法都认：① 成员对象上的同名字段 ② 顶层同名数组（"名单式"）
  const withFlags = { apiVersion: 1,
    members: [{ id: 'alice', label: 'Alice' }, { id: 'carol', label: 'Carol', flagA: true }],
    groups: { all: ['alice', 'carol'], club: ['alice', 'carol'] },
    flagB: ['carol'] }
  writeFileSync(file, JSON.stringify(withFlags), 'utf8')
  check('成员：list 保留自带字段（★自定义属性不被吃掉）', roster.member('carol')?.flagA === true, JSON.stringify(roster.member('carol')))
  check('成员：member() 取整条；不认识 ⇒ undefined', roster.member('alice')?.label === 'Alice' && roster.member('zed') === undefined)
  check('属性：成员字段写法 ⇒ true', roster.flag('carol', 'flagA') === true)
  check('属性：顶层名单式写法 ⇒ true', roster.flag('carol', 'flagB') === true)
  check('属性：没有该属性 ⇒ false（fail-safe 到"不带"）', roster.flag('alice', 'flagA') === false && roster.flag('zed', 'flagA') === false)
  writeFileSync(file, JSON.stringify({ apiVersion: 1, members: [{ id: 'x', label: 'X', flagA: false }, { id: 'y', label: 'Y', flagA: 0 }, { id: 'z', label: 'Z', flagA: '' }] }), 'utf8')
  check('属性：假值（false／0／空串）都算"不带"', !roster.flag('x', 'flagA') && !roster.flag('y', 'flagA') && !roster.flag('z', 'flagA'))
  writeFileSync(file, JSON.stringify(withFlags), 'utf8')
  check('属性：without() 剔掉带该属性的成员', JSON.stringify(roster.without(['alice', 'carol'], 'flagA')) === '["alice"]', JSON.stringify(roster.without(['alice', 'carol'], 'flagA')))
  check('属性：without() 不改名单本身（认不出的原样留着）', JSON.stringify(roster.without(['alice', 'zed'], 'flagA')) === '["alice","zed"]')
  check('属性：group(name, { without }) 一次剔干净', JSON.stringify(roster.group('club', { without: 'flagA' })) === '["alice"]', JSON.stringify(roster.group('club', { without: 'flagA' })))
  check('属性：group() 不带 opts ⇒ 原样（向后兼容）', JSON.stringify(roster.group('club')) === '["alice","carol"]')
  check('属性：flag 的名字由调用方给 ⇒ 换个名字照样工作（核心不认识任何具体属性名）', roster.flag('carol', 'flagB') === true && roster.flag('carol', 'flagC') === false)

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
