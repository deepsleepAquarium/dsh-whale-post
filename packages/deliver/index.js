/**
 * dsh-whale-post-deliver —— 投递策略（示例① 的挂点）
 *
 * 接口：`ctx.whale.deliver`（apiVersion 1）
 *   deliver(letter, ctx) → 'delivered' | 'kept' | 'rejected'
 *
 * 这一件只回答一个问题：**这封信现在投进对方的会话，还是留在信箱里等人？**
 *   · `mode === 'offline'` ⇒ **'kept'**：信已经在对方 `inbox/` 里躺着，**不叫醒**任何人；
 *   · `mode === 'online'` ⇒ 看对方**有没有活体会话**：
 *       - 有 ⇒ 调 `sessionOf(id).inject(text)` 投进去 ⇒ **'delivered'**；
 *       - 没有 ⇒ **'kept'** —— **不投也不消费**，信原样留在信箱里
 *         ⇒ **信只会晚到，不会不到**（这是拿事故换来的特性，别改成"投不进去就丢掉"）。
 *   · 名单里被**明确挡掉**的收件人 ⇒ 'rejected'（信不进它的信箱）。
 *
 * 会话探针（由引擎侧注入，核心不认识任何"引擎""会话"的概念）：
 *   config.sessionOf = (id) => ({ live: boolean, inject?: (text) => void }) | undefined
 */
export const name = 'whale-deliver'
export const apiVersion = 1

/** 休眠阈值（天）：soft 天内算"醒着"／soft～hard 算"安静"／≥ hard 算休眠 （与班级里设计文档同值） */
const DORMANT_SOFT_DEFAULT = 3
const DORMANT_HARD_DEFAULT = 7

export function createDeliver(config = {}) {
  const sessionOf = typeof config.sessionOf === 'function' ? config.sessionOf : () => undefined
  const blocked = new Set((config.blocked ?? []).map(String))
  const log = []
  const injectText = (letter) => [
    `【${letter.mode === 'online' ? '在线' : '离线'}邮件】${letter.from} → ${letter.to}`,
    letter.subject ? `主题：${letter.subject}` : '',
    letter.body,
  ].filter(Boolean).join('\n')

  // ── S10 v2 休眠判定（2026-10-10 从班级里设计文档移植）─────────────────────────
  //   ⚠️ v1 的教训：**不许拿「邮差还活着」当「它在读信」** —— 真局一照就穿帮：
  //      班级里的"小毛咪"邮差每 10 分钟替她续 `hello`，**可她本人不读信** （量到的是邮差）。
  //   ⇒ 判定走两路 （都带 `source`，**不许把推断说成声明**）：
  //      ① **明示位** ⇒ `source: 'declared'` （"谁被标了休眠"由配置/名单给 —— 本件不认识具体词）
  //      ② **推断** ⇒ **它信箱里最老的一封没读的信，躺了多久** —— 这才是「没读信」的**明证** 
  //   ⚠️ 两条硬纪律：
  //      · **没有积压 ⇒ 不许判休眠** （"没信可读" ≠ "不读信"）
  //      · **只用落盘 mtime** （不信内容里的时间戳 —— "这封信什么时候到的"是盘说了算）
  //   ⚠️ `unknown` ＝ **"我们不知道"** —— **不是"它休眠"** （没明示位、也没积压时就是它）
  const softDays = Number(config.dormantSoftDays) > 0 ? Number(config.dormantSoftDays) : DORMANT_SOFT_DEFAULT
  const hardDays = Number(config.dormantHardDays) > 0 ? Number(config.dormantHardDays) : DORMANT_HARD_DEFAULT
  /** 收件箱探针：`(id) => 该收件箱里"最老的一封没读的信"的落盘时间（ms；0 ⇒ 没有积压）`
   *  不接 ⇒ 推断路如实报 `unknown` （"不知道"就说不知道，不许猜） */
  const oldestPendingMs = typeof config.oldestPendingMs === 'function' ? config.oldestPendingMs : () => 0
  /** 明示休眠探针：`(id) => boolean`（由名单/配置给 —— 本件不认识任何具体属性名） */
  const declaredDormant = typeof config.declaredDormant === 'function' ? config.declaredDormant : () => false
  const DAY = 24 * 3600 * 1000
  const nowMs = () => (typeof config.now === 'function' ? Number(config.now()) : Date.now())

  /**
   * 判定 ⇒ `{ state, days, lastMs, source }` 
   *   `awake`（soft 天内）／`quiet`（soft～hard）／`dormant`（≥ hard）／`unknown`（无证据）
   */
  function dormancyOf(id) {
    const w = String(id)
    if (declaredDormant(w)) return { state: 'dormant', days: null, lastMs: 0, source: 'declared' }
    const oldest = Number(oldestPendingMs(w)) || 0
    if (!oldest) return { state: 'unknown', days: null, lastMs: 0, source: 'none' }   // 没有积压 ⇒ 不判 
    const days = (nowMs() - oldest) / DAY
    const state = days >= hardDays ? 'dormant' : (days >= softDays ? 'quiet' : 'awake')
    return { state, days, lastMs: oldest, source: 'inferred' }
  }

  function deliver(letter, ctx = {}) {
    const targets = Array.isArray(ctx.targets) && ctx.targets.length ? ctx.targets : [letter.to]
    if (targets.every((t) => blocked.has(t))) return 'rejected'
    // 明示休眠 ⇒ **退回** （核心那边**先于闸**就拦掉了 —— 这里再判一次是为了
    //   "换掉核心、只留这一件也答得出来"（策略件该能独立回答问题）；
    //   与核心同口径：**`--force` 也不豁免** —— 那是"信到不了"，不是"闸"）
    if (targets.every((t) => dormancyOf(t).source === 'declared')) return 'rejected'
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
        try { s.inject(injectText(letter)); delivered++ } catch { kept++ }   // 投失败 ⇒ 信留着，绝不丢
      } else kept++
    }
    if (delivered > 0 && kept === 0) { log.push({ id: letter.id, verdict: 'delivered' }); return 'delivered' }
    if (delivered > 0) { log.push({ id: letter.id, verdict: 'delivered', partial: kept }); return 'delivered' }
    log.push({ id: letter.id, verdict: 'kept', why: '对方没有活体会话 ⇒ 不投也不消费（信只会晚到，不会不到）' })
    return 'kept'
  }
  return { apiVersion, deliver, blocked: (id) => blocked.has(String(id)), sessionOf, log, dormancyOf }
}

export function apply(ctx, config = {}) {
  const deliver = createDeliver(config)
  if (typeof ctx?.provide === 'function') ctx.provide('whale.deliver', deliver)
  return deliver
}
