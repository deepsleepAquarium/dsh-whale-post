/**
 * dsh-whale-post-types —— 邮件类型注册表：**这封信是什么类型**
 *
 * 接口：`ctx.whale.types`（apiVersion 1）
 *   register(id, meta) / resolve(id) / list()
 *
 * 核心不许知道任何类型标识 —— 所以类型**是注册进来的**，随包只给三个样例：
 *   `direct`（一对一）／`broadcast`（群发）／`club`（小组）
 * 未注册的类型一律**当场拒**（不许悄悄当成默认类型 —— "急件类型写错就永远叫不醒人"这种事故我们栽过）。
 * 要加新类型：`types.register('你自己的', { label, urgent, billable, priority })` —— **核心一行都不用动**。
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
  // 两种写法都收：对象 { id: meta } ／ 数组 ['id1','id2']（示例配置里写的是数组 ⇒ 必须认）
  //   数组里某一项写成 [id, meta] 也认（想给元数据又嫌对象啰嗦时用）
  const spec = config.types ?? SAMPLES
  const entries = Array.isArray(spec)
    ? spec.map((x) => (Array.isArray(x) ? [String(x[0]), x[1]] : [String(x), undefined]))
    : Object.entries(spec)
  for (const [id, meta] of entries) put(id, meta)
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
  return types
}
