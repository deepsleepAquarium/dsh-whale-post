/**
 * dsh-whale-post-roster —— 名单接口：**谁在名单里**
 *
 * 接口：`ctx.whale.roster`（apiVersion 1）
 *   list() / has(id) / label(id)                       ← 最小集
 *   member(id) / flag(id, name) / without(list, name)  ← ★成员属性（通用：不认识任何具体属性名）
 *   group(name, opts) / groups()                       ← 可选扩展（有组名就按组解析；没有就退化成逐人点名）
 *
 * ★核心不许知道任何名字 —— 所以名单**只在这里**，核心一行名字都没有。
 * ★★**属性名也一样**：`flag(id, name)` 的 `name` 由**配置或调用方**给 ——
 *   本文件里**不出现任何具体属性名** ✓（这条守着 ACCEPTANCE 的"戊"：核心一认字就崩）。
 *
 * 样例实现读一个 JSON 文件（格式公开、内容自填）：
 *   { "apiVersion": 1,
 *     "members": [ { "id": "alice", "label": "Alice" },
 *                  { "id": "carol", "label": "Carol", "phone": true } ],  ← ★成员自带属性
 *     "groups": { "all": ["alice", "carol"], "club": ["alice"] },
 *     "phone": ["carol"] }                                             ← ★或"名单式"：顶层同名数组
 * ★两种写法都认（成员上的字段 / 顶层同名数组）—— 后者是为"一长串同属性的成员"准备的。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'whale-roster'
export const apiVersion = 1

const SAMPLE = {
  apiVersion: 1,
  members: [
    { id: 'alice', label: 'Alice' },
    { id: 'bob', label: 'Bob' },
  ],
  groups: { all: ['alice', 'bob'], club: ['alice'] },
}

export function createRoster(config = {}) {
  const file = config.file ?? join(process.env.WHALE_POST_ROOT ?? join(process.cwd(), '.whale-mail'), 'roster.json')
  /** ★群发默认剔除的属性名（★由配置给 —— 本文件里不出现任何具体属性名 ✓） */
  const cfgGroupWithout = typeof config.groupWithout === 'string' ? config.groupWithout : undefined
  const read = () => {
    if (!existsSync(file)) return config.sample === true ? SAMPLE : { apiVersion, members: [], groups: {} }
    const j = JSON.parse(readFileSync(file, 'utf8'))
    if (j && typeof j === 'object') {
      if (j.apiVersion !== undefined && j.apiVersion !== apiVersion) throw new Error(`名单 apiVersion 不认识：${j.apiVersion}（本插件认 ${apiVersion}）`)
      // ★★顶层原样带上（2026-10-10）：属性也可以写成"顶层同名数组"（`"phone": ["carol"]`）——
      //   原来只返回 { members, groups } ⇒ 那种写法**读不到** ✗
      return { ...j, members: Array.isArray(j.members) ? j.members : [], groups: (j.groups && typeof j.groups === 'object') ? j.groups : {} }
    }
    throw new Error('名单文件不是对象')
  }
  /** 坏输入不许抛未捕获异常：所有读取都吞掉错误，退化成"空名单" */
  const safe = (fn, dflt) => { try { return fn() } catch { return dflt } }

  // 成员写成纯字符串也认（独立审计 2026-10-05：原来会变成 `id: "undefined"` ✗）；没有 id 的一律丢掉
  // ★★2026-10-10：**保留成员自带的其余字段** —— 原来只映射 id/label ⇒ 自定义属性（"谁只收离线"之类）
  //   全被吃掉 ⇒ "成员属性"这件事在接口层根本不成立 ✗（缸里那套正是靠它区分"永久只收离线"的成员 ✓）
  const list = () => safe(() => read().members
    .map((m) => {
      if (typeof m === 'string') return { id: m, label: m }
      const out = { ...(m && typeof m === 'object' ? m : {}) }
      out.id = String(m?.id ?? '')
      out.label = String(m?.label ?? m?.id ?? '')
      return out
    })
    .filter((m) => m.id !== ''), [])
  const has = (id) => list().some((m) => m.id === id)
  const label = (id) => list().find((m) => m.id === id)?.label ?? String(id)
  /** ★整条成员记录（含自定义属性）；不认识就 `undefined` ✓ */
  const member = (id) => list().find((m) => m.id === String(id))
  /**
   * ★**成员属性**（通用）：`name` 由调用方给 —— 本文件里不出现任何具体属性名 ✓
   *   两种来源都认：① 成员对象上的同名字段（真值即算）② 顶层同名数组（id 在其中即算）
   *   取不到 / 属性为假 ⇒ `false`（**fail-safe 到"不带该属性"** ✓）
   */
  const flag = (id, name) => {
    const key = String(name)
    const m = member(id)
    if (m && m[key] !== undefined) return !(m[key] === false || m[key] === null || m[key] === '' || m[key] === 0)
    const top = safe(() => read()[key], undefined)
    return Array.isArray(top) ? top.map(String).includes(String(id)) : false
  }
  /** ★从一份名单里剔掉带该属性的成员（★不在名单里的成员原样留着 ✓ —— 不越权改名单 ✗） */
  const without = (ids, name) => (Array.isArray(ids) ? ids : []).map(String).filter((w) => !flag(w, name))
  const groups = () => safe(() => Object.keys(read().groups), [])
  /**
   * ★★**群发默认剔除**（2026-10-10，缸内口径移植）：`config.groupWithout` 给一个**属性名** ——
   *   ★按组解析、以及"群发清单"都会默认把带该属性的成员剔掉 ✓；**点名不受影响** ✗
   *   （★缸里口径："群发默认不到它，点名才进"✓ —— 那条线的五处群发名单每处都剔同一批人 ✓）
   *   ⚠️ 显式 `opts.without` 优先；★写 `opts.without: null` ⇒ **这一次不剔** ✓（逃生门 ✓）
   */
  const group = (name, opts = {}) => {
    const g = safe(() => read().groups[name], undefined)
    if (!Array.isArray(g)) return undefined
    const ids = g.map(String)
    const w = (opts && Object.prototype.hasOwnProperty.call(opts, 'without')) ? opts.without : cfgGroupWithout
    return (typeof w === 'string' && w !== '') ? without(ids, w) : ids
  }
  /**
   * ★**群发该发给谁**（通用）：★"完整名单"剔掉 `groupWithout` ⇒ 核心不必认识那个属性名 ✓
   *   没有配 `groupWithout` ⇒ 就是完整名单（向后兼容 ✓）
   */
  const broadcast = (opts = {}) => {
    const ids = list().map((m) => m.id)
    const w = (opts && Object.prototype.hasOwnProperty.call(opts, 'without')) ? opts.without : cfgGroupWithout
    return (typeof w === 'string' && w !== '') ? without(ids, w) : ids
  }
  return { apiVersion, file, list, has, label, member, flag, without, broadcast, groups, group }
}

export function apply(ctx, config = {}) {
  const roster = createRoster(config)
  if (typeof ctx?.provide === 'function') ctx.provide('whale.roster', roster)
  return roster
}
