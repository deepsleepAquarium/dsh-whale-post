/**
 * dsh-whale-post-roster —— 名单接口：**谁在名单里**
 *
 * 接口：`ctx.whale.roster`（apiVersion 1）
 *   list() / has(id) / label(id)          ← 最小集
 *   group(name) / groups()                ← 可选扩展（有组名就按组解析；没有就退化成逐人点名）
 *
 * ★核心不许知道任何名字 —— 所以名单**只在这里**，核心一行名字都没有。
 * 样例实现读一个 JSON 文件（格式公开、内容自填）：
 *   { "apiVersion": 1,
 *     "members": [ { "id": "alice", "label": "Alice" }, { "id": "bob", "label": "Bob" } ],
 *     "groups": { "all": ["alice", "bob"], "club": ["alice"] } }
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
  const read = () => {
    if (!existsSync(file)) return config.sample === true ? SAMPLE : { apiVersion, members: [], groups: {} }
    const j = JSON.parse(readFileSync(file, 'utf8'))
    if (j && typeof j === 'object') {
      if (j.apiVersion !== undefined && j.apiVersion !== apiVersion) throw new Error(`名单 apiVersion 不认识：${j.apiVersion}（本插件认 ${apiVersion}）`)
      return { members: Array.isArray(j.members) ? j.members : [], groups: (j.groups && typeof j.groups === 'object') ? j.groups : {} }
    }
    throw new Error('名单文件不是对象')
  }
  /** 坏输入不许抛未捕获异常：所有读取都吞掉错误，退化成"空名单" */
  const safe = (fn, dflt) => { try { return fn() } catch { return dflt } }

  const list = () => safe(() => read().members.map((m) => ({ id: String(m.id), label: String(m.label ?? m.id) })), [])
  const has = (id) => list().some((m) => m.id === id)
  const label = (id) => list().find((m) => m.id === id)?.label ?? String(id)
  const groups = () => safe(() => Object.keys(read().groups), [])
  const group = (name) => {
    const g = safe(() => read().groups[name], undefined)
    return Array.isArray(g) ? g.map(String) : undefined
  }
  return { apiVersion, file, list, has, label, groups, group }
}

export function apply(ctx, config = {}) {
  const roster = createRoster(config)
  if (typeof ctx?.provide === 'function') ctx.provide('whale.roster', roster)
  if (ctx && typeof ctx === 'object') ctx.whale = { ...(ctx.whale ?? {}), roster }
  return roster
}
