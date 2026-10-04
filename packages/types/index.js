/**
 * dsh-whale-post-types —— 邮件类型注册表：**这封信是什么类型**
 *
 * 接口：`ctx.whale.types`（apiVersion 1）
 *   register(id, meta) / resolve(id) / list()
 *
 * ★核心不许知道任何类型标识 —— 所以类型**是注册进来的**，随包只给三个样例：
 *   `direct`（一对一）／`broadcast`（群发）／`club`（小组）
 * ★未注册的类型一律**当场拒**（不许悄悄当成默认类型 —— "急件类型写错就永远叫不醒人"这种事故我们栽过）。
 * ★要加新类型：`types.register('你自己的', { label, urgent, billable, priority })` —— **核心一行都不用动**。
 */
export const name = 'whale-types'
export const apiVersion = 1

const SAMPLES = {
  direct: { label: 'direct', urgent: false, billable: true, priority: 50, note: '一对一' },
  broadcast: { label: 'broadcast', urgent: false, billable: true, priority: 30, note: '群发（可能很多人都要读）' },
  club: { label: 'club', urgent: false, billable: true, priority: 40, note: '小组内部' },
}

export function createTypes(config = {}) {
  const table = new Map()
  const put = (id, meta) => {
    if (typeof id !== 'string' || id.trim() === '') throw new Error('register 需要非空的类型标识')
    const m = { label: id, urgent: false, billable: true, priority: 50, ...(meta ?? {}) }
    table.set(id, m)
    return m
  }
  for (const [id, meta] of Object.entries(config.types ?? SAMPLES)) put(id, meta)
  if (Array.isArray(config.extra)) for (const [id, meta] of config.extra) put(id, meta)

  const register = (id, meta) => put(id, meta)
  const resolve = (id) => table.get(String(id))
  const list = () => [...table.entries()].map(([id, meta]) => ({ id, ...meta }))
  const meta = (id) => resolve(id) ?? null
  return { apiVersion, register, resolve, list, meta }
}

export function apply(ctx, config = {}) {
  const types = createTypes(config)
  if (typeof ctx?.provide === 'function') ctx.provide('whale.types', types)
  if (ctx && typeof ctx === 'object') ctx.whale = { ...(ctx.whale ?? {}), types }
  return types
}
