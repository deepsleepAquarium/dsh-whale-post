/**
 * dsh-whale-post-deliver —— 投递策略（示例① 的挂点）
 *
 * 接口：`ctx.whale.deliver`（apiVersion 1）
 *   deliver(letter, ctx) → 'delivered' | 'kept' | 'rejected'
 *
 * ★这一件只回答一个问题：**这封信现在投进对方的会话，还是留在信箱里等人？**
 *   · `mode === 'offline'` ⇒ **'kept'**：信已经在对方 `inbox/` 里躺着，**不叫醒**任何人；
 *   · `mode === 'online'` ⇒ 看对方**有没有活体会话**：
 *       - 有 ⇒ 调 `sessionOf(id).inject(text)` 投进去 ⇒ **'delivered'**；
 *       - 没有 ⇒ **'kept'** —— ★**不投也不消费**，信原样留在信箱里
 *         ⇒ **信只会晚到，不会不到**（这是拿事故换来的特性，别改成"投不进去就丢掉"）。
 *   · 名单里被**明确挡掉**的收件人 ⇒ 'rejected'（信不进它的信箱）。
 *
 * 会话探针（由引擎侧注入，核心不认识任何"引擎""会话"的概念）：
 *   config.sessionOf = (id) => ({ live: boolean, inject?: (text) => void }) | undefined
 */
export const name = 'whale-deliver'
export const apiVersion = 1

export function createDeliver(config = {}) {
  const sessionOf = typeof config.sessionOf === 'function' ? config.sessionOf : () => undefined
  const blocked = new Set((config.blocked ?? []).map(String))
  const log = []
  const injectText = (letter) => [
    `【${letter.mode === 'online' ? '在线' : '离线'}邮件】${letter.from} → ${letter.to}`,
    letter.subject ? `主题：${letter.subject}` : '',
    letter.body,
  ].filter(Boolean).join('\n')

  function deliver(letter, ctx = {}) {
    const targets = Array.isArray(ctx.targets) && ctx.targets.length ? ctx.targets : [letter.to]
    if (targets.every((t) => blocked.has(t))) return 'rejected'
    if (letter.mode === 'offline') {
      log.push({ id: letter.id, verdict: 'kept', why: '离线件：留在对方信箱里等人来收（不叫醒）' })
      return 'kept'
    }
    let delivered = 0
    let kept = 0
    for (const t of targets) {
      if (blocked.has(t)) continue
      const s = sessionOf(t)
      if (s && s.live && typeof s.inject === 'function') {
        try { s.inject(injectText(letter)); delivered++ } catch { kept++ }   // ★投失败 ⇒ 信留着，绝不丢
      } else kept++
    }
    if (delivered > 0 && kept === 0) { log.push({ id: letter.id, verdict: 'delivered' }); return 'delivered' }
    if (delivered > 0) { log.push({ id: letter.id, verdict: 'delivered', partial: kept }); return 'delivered' }
    log.push({ id: letter.id, verdict: 'kept', why: '对方没有活体会话 ⇒ 不投也不消费（信只会晚到，不会不到）' })
    return 'kept'
  }
  return { apiVersion, deliver, blocked: (id) => blocked.has(String(id)), sessionOf, log }
}

export function apply(ctx, config = {}) {
  const deliver = createDeliver(config)
  if (typeof ctx?.provide === 'function') ctx.provide('whale.deliver', deliver)
  if (ctx && typeof ctx === 'object') ctx.whale = { ...(ctx.whale ?? {}), deliver }
  return deliver
}
