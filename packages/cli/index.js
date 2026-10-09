#!/usr/bin/env node
/**
 * dsh-whale-post-cli —— 零依赖命令行（★它是**入口工具**，不是插件）
 *
 *   whale-post hello  --as alice
 *   whale-post send   --as alice --to bob --subject 主题 --body 正文 [--mode online|offline]
 *                     [--type direct|broadcast|club|…] [--re <父信 id>] [--force]
 *                     [--live bob,carol]     # 哪些收件人此刻有"活体会话"（在线件才会真投出去）
 *   whale-post pump   --as bob [--keep]      # 收信（默认消费：搬进 seen ＋ 写 ack）
 *   whale-post pickup --as web --remote <别处的信箱根>
 *                                            # ★去**别的信箱根**把自己的信取回来（★离线也能用）
 *                                            #   远端根也可用环境变量 WHALE_POST_REMOTE_ROOT
 *   whale-post quota  --as alice [--days 7]
 *   whale-post roster / types / key / selftest
 *
 * 通用参数：`--root <目录>`（★默认 `./.whale-mail`，或环境变量 `WHALE_POST_ROOT`）
 *          `--only-offline <属性名>`：带此属性的成员**只收离线**（对它发在线 ⇒ 拒发）
 *          `--dormant <属性名>`：带此属性的成员被**明确**标成休眠（发信 ⇒ 当场拒发，不合信箱）
 *          `--no-gate`：★整套闸都不要（★并发压测用 ✓ —— 压测要看的是"发号撞不撞"，不是"闸拦不拦" ✓）
 *          `--only-offline <属性名>`（pickup 用）：★只镜像"只收离线成员"的 hello ✓
 *          `--account`（pickup 用）：★取件时**替发件人记账** ✓（★远端自己记过就别开 —— 那会**双记** ✗）
 * 退出码：0 ＝ 成功；2 ＝ 拒发／输入不合法；1 ＝ 没料到的错。
 * ★判据看**退出码**，不要看输出里的中文。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, renameSync, unlinkSync, statSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createBus } from 'dsh-whale-post-bus'
import { createRoster } from 'dsh-whale-post-roster'
import { createTypes } from 'dsh-whale-post-types'
import { createDeliver } from 'dsh-whale-post-deliver'
import { createGate } from 'dsh-whale-post-gate'
import { createVerify } from 'dsh-whale-post-verify'

const argv = process.argv.slice(2)
const cmd = argv[0]
const opt = (name, dflt = undefined) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt
}
const flag = (name) => argv.includes(`--${name}`)
const die = (code, msg) => { if (msg) console.error(msg); process.exit(code) }

/**
 * ★★探活：动"邮筒"之前先看它活着没 ✗（S12 断线不卡死 · 2026-10-10 从缸里正本移植 ✓）
 *
 * ★病（正本原话）✗：★「**SMB 掉线时同步 fs 调用会挂住几十秒** ✗（本地盘不会 ✓）
 *   ⇒ `pickup` 会卡住、发信也会卡住 ✓」
 * ★方（三条口径 ✓）：
 *   ① ★**本机路径不用探** ✓（人造邮筒／盘上的目录 ⇒ 直接算通 ✓）；
 *   ② ★**只看 TCP 445 通不通** ✓ —— 不碰盘、不做 IO ✓；
 *   ③ ★★**Node 的同步 fs 自己没有超时** ✗ ⇒ 只能靠「**子进程 ＋ timeout**」拿到上限 ✓
 *      （★最后一招是兜底、不是主力：真正快的是那个 1.2 秒的 `net.connect` 超时 ✓）。
 * ⚠️ 缓存**按根字符串**存 ✓ —— ★换根就重探 ✓（"免得缓存说了谎" ✓）。
 */
const _remoteAlive = new Map()
function remoteAlive(rootPath, force = false) {
  if (!/^\\\\/.test(String(rootPath ?? ''))) return true     // ★本机路径 ⇒ 不用探 ✓
  const r = String(rootPath)
  if (!force && _remoteAlive.has(r)) return _remoteAlive.get(r)
  const host = (r.match(/^\\+([^\\]+)/) ?? [, ''])[1]
  if (!host) return true
  const probe = "const net=require('node:net');const s=net.connect({host:process.argv[1],port:445});"
    + "s.setTimeout(1200);s.on('connect',()=>{s.destroy();process.exit(0)});"
    + "s.on('timeout',()=>process.exit(2));s.on('error',()=>process.exit(3));"
  const res = spawnSync(process.execPath, ['-e', probe, host], { timeout: 2500, stdio: 'ignore' })
  const ok = res.status === 0
  _remoteAlive.set(r, ok)
  return ok
}

/** 把接口件拼起来（★核心只认接口，这里就是"接线"） */
function wire({ root, live, allow: allowIn, verifyEnabled } = {}) {
  const r = root ?? opt('root') ?? process.env.WHALE_POST_ROOT ?? join(process.cwd(), '.whale-mail')
  const injected = []
  // ★`--live a,b` 声明"这些人此刻有活体会话"（独立审计 2026-10-05：原来它只在自测里被用到 ⇒ 死参数 ✗）
  const liveList = (Array.isArray(live) && live.length)
    ? live
    : String(opt('live', '')).split(',').map((s) => s.trim()).filter(Boolean)
  const liveSet = new Set(liveList)
  // ★安全校验：**默认禁用**（enabled 不写就是禁用）——
  //   `--enable-verify` 可以就地打开；`--allow a,b` 给白名单（不写 ⇒ 不限制）
  const allow = (Array.isArray(allowIn) && allowIn.length)
    ? allowIn
    : String(opt('allow', '')).split(',').map((s) => s.trim()).filter(Boolean)
  const vSvc = createVerify({ root: r, enabled: flag('enable-verify') || verifyEnabled === true, allow,
    // ★★签名域的**唯一真相**用**延迟函数**交过去 ✗✓（2026-10-10 修）——
    //   ★`() => services.busRef?.FIELD_ORDER`：★函数体**延迟求值** ⇒ ★天然躲过暂时性死区 ✓
    //   （★我第一版写成立即求值的属性 ⇒ `Cannot access 'services' before initialization` ✓；
    //    第二版改成建完 bus 回填 `vSvc.cfg.bus` ⇒ ★**没生效** ⇒ 还是被判"未登记字段" ✓ ⇒ 才改成这个 ✓）
    bus: { sign: (env) => services.busRef?.sign(env), fields: () => services.busRef?.FIELD_ORDER,
      // ★★`digest` 也走**延迟函数** ✗✓（2026-10-10 加）——
      //   ★`verify` 那边本来就有"优先用 `cfg.bus.digest`、否则用自己那份"的写法 ✓（★它比 `FIELD_ORDER` 那处做得好 ✓），
      //     而★**我上一版没把 `digest` 传过去** ⇒ ★它一直走**兜底那份** ✓ ⇒ ★一旦 bus 改了摘要算法，**两边就漂** ✗
      //     （★摘要漂了会怎样：★**信被判"摘要不符"、当场退信** ✓ —— ★同 HMAC 那类"两边都自洽、一接就炸" ✓）。
      digest: (body) => services.busRef?.digest(body) } })
  const services = {
    roster: createRoster({ file: opt('roster') ?? join(r, 'roster.json') }),
    types: createTypes(),
    // ★`--no-gate` ⇒ **整套闸都不要** ✓（★并发压测要用 ✓ —— 12 路同对发信会被回环闸**正确地**拦住 ✓，
    //   而压测要看的是"发号会不会撞"，不是"闸拦不拦" ✓；★缸里正本用的是环境变量 `WHALE_POST_NO_GATE` ✓）
    ...(flag('no-gate') ? {} : { gate: createGate({ root: r }) }),
    // ★★把**签名域那一份真相**交给 verify ✗✓（2026-10-10 修）——
    //   ★`verify` 原来自己抄了一份 `FIELD_ORDER` ⇒ ★**两边会漂移** ✗：
    //     我在 `bus` 里加字段（`peerStateAtSend` 等）⇒ ★那封**完全合法**的信被判成"未登记字段"
    //     ⇒ ★**被拒收、挪进退信** ✗（★这是实测抓出来的：`cli` 自测当场红 ✓）。
    //   ⚠️ ★`bus` 得等 `services` 建完才存在 ✗ ⇒ ★**不能在这里读它**（★我第一版写 `services.busRef?.FIELD_ORDER`
    //      ⇒ **暂时性死区** ⇒ `Cannot access 'services' before initialization` ✓ —— ★而箭头函数那种延迟写法**躲得过** ✓，
    //      立即求值的属性**躲不过** ✓）；★所以这里**先建**，等 `bus` 建好再**回填 `cfg.bus`** ✓。
    verify: vSvc,
    deliver: createDeliver({
      sessionOf: (id) => (liveSet.has(id) ? { live: true, inject: (text) => injected.push({ id, text }) } : undefined),
    }),
  }
  const bus = createBus({
    root: r,
    services,
    // ★★两个"按属性拦"的开关：属性名**从命令行给**，核心不认识任何具体名字 ✓
    //   `--only-offline <属性名>`：带此属性的成员**只收离线**（对它发在线 ⇒ 拒发）
    //   `--dormant <属性名>`：带此属性的成员被**明确**标成休眠（发信 ⇒ 当场拒发，不合信箱）
    ...(opt('only-offline') ? { offlineOnlyFlag: opt('only-offline') } : {}),
    ...(opt('dormant') ? { dormantFlag: opt('dormant') } : {}),
  })
  services.busRef = bus     // ★回填：★`verify` 那边通过**延迟函数**读它（★"一套真相" ✓ —— 见上面 `vSvc` 那段的注释 ✓）
  return { root: r, bus, services, injected, liveSet, allow }
}

// ── 端到端自测（临时根，真数据零接触；只看退出码）────────────────────────
function selftest() {
  const tmp = join(process.env.TEMP ?? '/tmp', `whale-post-selftest-${Date.now()}`)
  const checks = []
  const check = (name, ok, extra = '') => checks.push({ name, ok: !!ok, extra: String(extra) })
  const ls = (d) => { try { return readdirSync(d) } catch { return [] } }

  try {
    mkdirSync(tmp, { recursive: true })
    writeFileSync(join(tmp, 'roster.json'), JSON.stringify({
      apiVersion: 1,
      members: [{ id: 'alice', label: 'Alice' }, { id: 'bob', label: 'Bob' }, { id: 'carol', label: 'Carol' }],
      groups: { all: ['alice', 'bob', 'carol'], club: ['alice', 'bob'] },
    }, null, 2), 'utf8')

    // ★自测里**显式开安全校验** —— 因为下面要验"改一个字段就不过"；
    //   而默认那一档是"禁用"（禁用时按设计跳过 HMAC ⇒ 改 mode 查不出来，另有一条判据专门盯它）
    const { bus: w, services, injected } = wire({ root: tmp, live: ['bob'], verifyEnabled: true })   // ★只有 bob 有"活体会话"
    w.hello({ as: 'alice' }); w.hello({ as: 'bob' }); w.hello({ as: 'carol' })

    // ① 离线件：落在对方信箱、不叫醒
    const s1 = w.send({ as: 'alice', to: 'bob', subject: '第一封', body: '离线件：请你方便的时候读（不叫醒你）' })
    check('离线件：投进对方信箱', existsSync(join(tmp, 'inbox', 'bob', `${s1.id}.msg.json`)))
    check('离线件：判 kept（不叫醒）', s1.verdict === 'kept', s1.verdict)

    // ② 收信＝消费 ＋ 写回执 ＋ 幂等（★要**声明读者**才会消费：会话活着不算 —— 见收信侧闭环判据）
    const got = w.pump({ as: 'bob', reader: true })
    check('收信：拉到 1 封', got.length === 1 && got[0].ok, JSON.stringify(got.map((g) => g.handled)))
    check('收信：离线件标着 [离线]', String(got[0]?.handled ?? '').startsWith('[离线]'), got[0]?.handled)
    check('回执：写了 ack', ls(join(tmp, 'ack', 'alice')).length === 1, JSON.stringify(ls(join(tmp, 'ack', 'alice'))))
    check('幂等：再 pump 一次拿到 0 封（不会重复消费）', w.pump({ as: 'bob', reader: true }).length === 0)

    // ③ 在线件：有活体会话 ⇒ 当场投出去
    const s2 = w.send({ as: 'alice', to: 'bob', mode: 'online', subject: '在线件', body: '请你现在动手：这封是要叫醒你的信' })
    check('在线件：有活体会话 ⇒ delivered', s2.verdict === 'delivered', s2.verdict)
    check('在线件：真的注入了会话', injected.some((x) => x.text.includes('在线件')))

    // ④ ★只投活体：对方没有会话 ⇒ 不投也不消费（信只会晚到，不会不到）
    const s3 = w.send({ as: 'alice', to: 'carol', mode: 'online', subject: '叫不醒的人', body: '对方没有活体会话：这封信应当留在信箱里等人来收' })
    check('只投活体：对方没会话 ⇒ kept', s3.verdict === 'kept', s3.verdict)
    check('只投活体：信仍在对方信箱里', existsSync(join(tmp, 'inbox', 'carol', `${s3.id}.msg.json`)))

    // ⑤ 组名解析（核心不认识名字 —— 组来自 roster 接口）
    const s4 = w.send({ as: 'bob', to: 'club', mode: 'offline', subject: '小组', body: '组名解析：club 组里除我以外的人各收一封（正文有货）' })
    check('组名：club 解析成 alice（不含发件人自己）', s4.targets.length === 1 && s4.targets[0] === 'alice', JSON.stringify(s4.targets))

    // ⑥ 回环闸①：纯回执
    //   ★★注意必须用**在线件** ✗ —— 2026-10-10 起，★离线件**豁免整套回环闸** ✓
    //   （★"主人 2026-10-06 令"＋正本判据 29-31 ✓：三道闸拦的是"别多叫醒人一次"，
    //    而离线件**根本不叫醒任何人** ⇒ 拦它没有收益 ✓）
    let e1 = ''
    try { w.send({ as: 'alice', to: 'bob', mode: 'online', subject: '回执', body: '收到' }) } catch (e) { e1 = e.message }
    check('回环闸①：纯回执拒发（★在线件）', /纯回执/.test(e1), e1)
    //   ★同一条的"反面"：同一个纯回执换成**离线** ⇒ **照发** ✓
    let offlineAckOk = false
    try { w.send({ as: 'alice', to: 'bob', mode: 'offline', subject: '回执', body: '收到' }); offlineAckOk = true } catch { offlineAckOk = false }
    check('★★离线豁免闸①：纯回执的**离线件照发**（主人 2026-10-06 令）', offlineAckOk)

    // ⑦ 回环闸②：同一对 20 分钟内限封数（超出就拒）—— ★同样要用在线件 ✓
    //   ★★注意：`recent` 现在**只记在线件** ✗（2026-10-10 改：离线件豁免整套回环闸，
    //     让它占满"叫醒记录"会把后面的**在线件**误拦 ✓）⇒ ★这条判据要**自己把在线件发满** ✓。
    //   ★用 `force` 填到刚好超过上限（★`force` 跳过闸、但**照样进 `recent`** ✓）
    //     —— ★不许在 `try` 外面发，否则第 3 封就抛，把整个自测炸掉 ✗（我们刚栽过 ✓）。
    for (let i = 0; i < 4; i += 1) w.send({ as: 'alice', to: 'bob', mode: 'online', force: true, subject: `填满${i}`, body: `把叫醒记录填满：第 ${i} 封（正文有货，不是回执）` })
    let e2 = ''
    try { w.send({ as: 'alice', to: 'bob', mode: 'online', subject: '连发', body: '填满之后再发一封普通的（正文有货，不是回执）' }) } catch (e) { e2 = e.message }
    check('回环闸②：同对限封数（超出就拒）（★在线件）', /同对回环/.test(e2), e2)
    //   ★同一条的"反面"：同一对再来**离线**件 ⇒ **照发** ✓（豁免 ✓）
    let offlineMoreOk = false
    try { w.send({ as: 'alice', to: 'bob', mode: 'offline', subject: '离线', body: '同一对再来离线件（正文有货，不是回执）' }); offlineMoreOk = true } catch { offlineMoreOk = false }
    check('★★离线豁免闸②：同对连发位置上的**离线件照发**（主人 2026-10-06 令）', offlineMoreOk)

    // ⑧ 空正文 / 未注册类型 / 名额写错 ⇒ 一律拒发
    let e3 = ''; try { w.send({ as: 'bob', to: 'alice', subject: 'x', body: '   ' }) } catch (e) { e3 = e.message }
    check('空正文 ⇒ 拒发', /正文为空/.test(e3), e3)
    let e4 = ''; try { w.send({ as: 'bob', to: 'alice', subject: 'x', body: '类型没注册就必须拒（正文有货）', type: '没注册的类型' }) } catch (e) { e4 = e.message }
    check('类型：未注册 ⇒ 拒发', /未注册的邮件类型/.test(e4), e4)
    let e5 = ''; try { w.send({ as: 'bob', to: 'nobody', subject: 'x', body: '收件人写错必须报未知收件人（正文有货）' }) } catch (e) { e5 = e.message }
    check('收件人：未知 ⇒ 拒发', /未知收件人/.test(e5), e5)
    let e6 = ''; try { w.send({ as: 'bob', to: 'alice', mode: 'ONLINE', subject: 'x', body: '模式写错必须拒（不许悄悄降级）' }) } catch (e) { e6 = e.message }
    check('模式：取值写错 ⇒ 拒发（不悄悄降级）', /mode 取值非法/.test(e6), e6)

    // ⑨ 验签：改一个字节必不过（mode 也进签名）
    const f = ls(join(tmp, 'inbox', 'alice'))[0]
    const raw = JSON.parse(readFileSync(join(tmp, 'inbox', 'alice', f), 'utf8'))
    const tampered = { ...raw, body: raw.body + '（被人改了一个字）' }
    check('验签：正文被改 ⇒ 不通过', w.verify(tampered).some((x) => /摘要不符|MAC/.test(x)), JSON.stringify(w.verify(tampered)))
    const tamperedMode = { ...raw, mode: 'online' }
    check('验签：mode 被改 ⇒ 不通过（模式也进签名）', w.verify(tamperedMode).some((x) => /MAC/.test(x)), JSON.stringify(w.verify(tamperedMode)))

    // ⑩ 配额：离线桶按发信次数（1 次发信＝1 条，组发不翻倍）
    const g = createGate({ root: tmp })
    const r1 = g.record({ as: 'dave', to: 'all', targets: ['x', 'y', 'z'], mode: 'offline', type: 'direct', body: '组发也只算 1 条', sentAtMs: Date.now() })
    const r2 = g.record({ as: 'dave', to: 'all', targets: ['x', 'y', 'z'], mode: 'online', type: 'broadcast', body: '在线件按收件人数', sentAtMs: Date.now() })
    check('配额：离线件组发只记 1 条', r1.units === 1 && r1.bucket === 'offline', JSON.stringify(r1))
    check('配额：在线件按收件人数计单位', r2.units === 3, JSON.stringify(r2))
    const rep = g.report({ as: 'dave' })
    check('配额：离线条**不并进**"单位"（计费口径分开）', rep.today.units === 3 && rep.today.offlineLetters === 1, JSON.stringify(rep.today))

    // ⑪ ★组名配额要**真的接线**（独立复核抓出的死分支：闸读了 groupMembers，但没人传给它）
    //    ⇒ 这条判据走**真 send 路径**：只要核心忘了把组员名单传下去，它立刻变红
    const sGroup = w.send({ as: 'carol', to: 'all', mode: 'online', subject: '组发计费', body: '组发计费：组内成员合成 1 单位、组外按户算（正文有货，不是回执）' })
    const repGroup = services.gate.report({ as: 'carol' })
    check('配额接线：发给组 ⇒ 组内合成 1 单位（groupMembers 真传下去了）',
      repGroup.today.units === 1 && sGroup.targets.length === 2, JSON.stringify({ units: repGroup.today.units, targets: sGroup.targets }))
  } catch (err) {
    check('自测没有抛异常', false, err && err.stack ? err.stack.split('\n')[0] : err)
  }

  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
  const pass = checks.filter((c) => c.ok).length
  console.log(`\n${pass}/${checks.length} 通过   （临时邮局：${tmp}）`)
  return pass === checks.length
}

// ── 命令 ───────────────────────────────────────────────────────────────
function main() {
  // ★--help／-h／help 一律当"打用法"（陌生人第一下就敲这个）
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log([
      'whale-post <命令> [选项]        ★六件已发 npm：npx -y dsh-whale-post-cli <命令>（第七件 verify 在仓内，待发）',
      '',
      '  hello   --as <谁>                  握手（没握过手不许发信）',
      '  send    --as <谁> --to <谁|组> --subject <题> --body <正文> [--mode online|offline] [--type <类型>] [--re <父信 id>] [--force] [--live a,b]',
      '  pump    --as <谁> [--keep]         收信（默认消费；没有读者时一封都不消费）',
      '  quota   --as <谁> [--days N]       查配额（离线件按"条"、不计单位）',
      '  verify  [--as <谁>] [--enable|--disable] [--allow a,b]',
      '                                     看安全校验状态（★默认禁用；禁用中会提示开启，连提三天后不再提）',
      '  nag                                看该不该提示（★未开启时每天至多一次；提满三天后不再提）',
      '  roster  / types / key              看名单 / 看类型 / 看密钥指纹',
      '  selftest                           自测（★只看退出码：0 过 / 非 0 不过）',
      '',
      '通用：--root <目录>（★默认 ./.whale-mail，或环境变量 WHALE_POST_ROOT）   --roster <名单 json>',
    ].join('\n'))
    return 0
  }
  if (!cmd) die(2, '用法：whale-post --help')
  const { bus, services } = wire()
  try {
    if (cmd === 'key') {
      console.log(`密钥指纹 ${bus.digest(bus.keyHex()).slice(0, 16)}（密钥本体不打印；文件：${bus.paths().keyFile}）`)
      return 0
    }
    if (cmd === 'hello') {
      const as = opt('as') || die(2, 'hello 需要 --as')
      bus.hello({ as })
      console.log(`hello 已写：${as}（这是"我活着、可以收信"的握手；别人发信前会看它新不新鲜）`)
      return 0
    }
    if (cmd === 'roster') {
      const list = services.roster.list()
      console.log(`名单（${list.length} 人；文件：${services.roster.file}）：`)
      for (const m of list) console.log(`  ${m.id.padEnd(12)} ${m.label}`)
      const gs = services.roster.groups()
      if (gs.length) console.log(`组：${gs.map((g) => `${g}(${services.roster.group(g).length})`).join('　')}`)
      return 0
    }
    if (cmd === 'types') {
      console.log('邮件类型（随包三个样例；你自己的类型自己注册）：')
      for (const t of services.types.list()) console.log(`  ${t.id.padEnd(12)} ${t.note ?? t.label}`)
      return 0
    }
    if (cmd === 'send') {
      const as = opt('as') || die(2, 'send 需要 --as')
      const to = opt('to') || die(2, 'send 需要 --to')
      const bodyFile = opt('body-file')
      const bodyRaw = opt('body', '')
      // ★拒绝"参数冒充正文"（独立审计 2026-10-05）：`--body --force` 原来会被当成"正文＝--force 且带 force"
      //   ⇒ 顺手把三道闸全绕过去 ✗。选项值以 `--` 开头一律当写错。
      if (String(bodyRaw).startsWith('--')) die(2, '--body 的值看起来是个参数（以 -- 开头）—— 拒绝把参数当正文（否则 --force 之类会被一起吃掉）')
      const body = bodyFile ? readFileSync(bodyFile, 'utf8') : bodyRaw
      const r = bus.send({
        as, to,
        subject: opt('subject', ''),
        body,
        mode: opt('mode'),
        type: opt('type', 'direct'),
        re: opt('re'),
        force: flag('force'),
      })
      const modeTxt = r.mode === 'offline' ? '离线（落在对方信箱，不唤醒）' : '在线（立即投进对方的会话）'
      const verdictTxt = r.verdict === 'delivered' ? 'delivered（投出去了）'
        : r.verdict === 'kept' ? 'kept（留在信箱里等人来收）' : String(r.verdict)
      console.log(`已投递 ${r.id} → ${r.targets.join(',')}（seq ${r.seq}）【${modeTxt}】`)
      // ★★没投给谁，也要说出来 ✗ —— 部分收件人被明确标成休眠时，核心把它带回来了（不许静默 ✓）
      if (Array.isArray(r.skippedDormant) && r.skippedDormant.length) {
        console.log(`★没投：${r.skippedDormant.join('、')} 被明确标成休眠 ⇒ 信没进它们的信箱（换人或先让它们醒）`)
      }
      console.log(`投递策略：${verdictTxt}`)
      const bucket = r.mode === 'offline' ? 'offline' : r.type
      const b = services.gate?.report({ as }).buckets.find((x) => x.bucket === bucket)
      if (b) console.log(`配额（${bucket} 桶）：今日 ${b.used}/${Number.isFinite(b.limit) ? b.limit : '∞'}${r.mode === 'offline' ? ' 条' : ' 单位'}`)
      return 0
    }
    if (cmd === 'pump') {
      const as = opt('as') || die(2, 'pump 需要 --as')
      // ★reader：CLI 把信打进终端 ⇒ 它**就是读者**。不这样声明，默认规则是"没有读者就不消费"
      //   （信会一直留在信箱里 —— 这是"信只会晚到，不会不到"的收信侧那一半）
      const rs = bus.pump({ as, keep: flag('keep') ? true : undefined, reader: !flag('keep') })
      if (rs.length === 0) console.log('（信箱是空的）')
      for (const r of rs) {
        console.log(`${r.ok ? 'OK  ' : '退信'} ${r.file}${r.ok ? ' :: ' + r.handled : ' :: ' + r.why}`)
        if (r.ok && r.kept) console.log(`    ↳ ★未消费（${r.why}）`)
        if (r.ok && r.body) console.log(r.body.split('\n').map((l) => '    | ' + l).join('\n'))
      }
      return 0
    }
    if (cmd === 'pickup') {
      // ★★S6 取件 ＋ S7 到达侧记账（2026-10-10 从缸里正本移植的**完整版** ✓）——
      //   场景：信箱在**别人那儿**（或共享目录的另一头 ✓）；我人不在，但信在 ✓
      //   ① ★**镜像 hello** ✗：把远端 `hello/` 里"**只收离线成员**"的 hello 搬回本机
      //      ⇒ ★**握手闸才看得见手机** ✓（★缸内成员的 hello **不搬** ✗；属性名由 `--only-offline <名>` 给 ✓）
      //   ② 远端 `inbox/<我>/` 的信 ⇒ **验签** ⇒ 搬进本机 `inbox/`
      //      ＋ ★远端那份 **`MOVE` 进 `seen/`** ✗（★**消费凭证** ✓ —— 不是删掉 ✓）
      //   ③ ★**幂等认三处** ✗：本机 inbox ／ 本机 seen ／ **远端 seen** ⇒ 任一处有 ⇒ 跳过 ✓
      //   ④ ★★**每"新搬进一封"才记一次账** ✗：按信封 `mode` 记 **发件人** 的配额
      //      ⇒ ★到达侧记账 ✓、★**绝不双记** ✓（幂等拦在前面，两个记账点不会同时命中同一封 ✓）
      //   ★验不过的信 ⇒ **不搬、不消费、不删** ✗（留在远端等人查 ✓）
      const as = opt('as') || die(2, 'pickup 需要 --as')
      const remote = opt('remote') ?? process.env.WHALE_POST_REMOTE_ROOT
      if (!remote) die(2, 'pickup 需要 --remote <远端信箱根>（或环境变量 WHALE_POST_REMOTE_ROOT）')
      // ★★动邮筒之前先探活 ✗（S12 ✓）—— ★不通就**当场判死**，别让同步 fs 在 SMB 掉线时挂几十秒 ✓
      //   ⚠️★**必须在任何一次碰远端盘的调用之前** ✗ —— 连 `existsSync` 本身都会挂 ✓
      if (!remoteAlive(remote)) {
        die(2, `远端根现在够不着（${remote}）—— ★**SMB 掉线时同步 fs 会挂住几十秒** ✗，所以这里先探活再动盘。`
          + '等网络回来再跑；★这一次**一个文件都没动** ✓')
      }
      if (!existsSync(remote)) die(2, `远端根不存在：${remote}（★要指到"信箱根"那一层 ✓）`)
      const onlyOffline = opt('only-offline')          // ★不配 ⇒ 一个 hello 都不镜像 ✓
      const rInbox = join(remote, 'inbox', as)
      const rSeenDir = join(remote, 'seen', as)
      const mine = bus.paths().inbox(as)
      const seenDir = bus.paths().seen(as)
      mkdirSync(mine, { recursive: true })
      const seenNames = (d) => (existsSync(d) ? new Set(readdirSync(d).filter((x) => x.endsWith('.msg.json'))) : new Set())
      const mineSeen = seenNames(seenDir)
      const remoteSeen = seenNames(rSeenDir)           // ★③ 第三处 ✓

      // ① ★镜像 hello：只搬"只收离线成员"的 ✓（★核心/本件都不认识具体属性名 —— 由 --only-offline 给 ✓）
      let mirrored = 0
      if (onlyOffline) {
        const rHello = join(remote, 'hello')
        const myHello = join(bus.paths().root, 'hello')
        if (existsSync(rHello)) {
          mkdirSync(myHello, { recursive: true })
          for (const f of readdirSync(rHello).filter((x) => x.endsWith('.json'))) {
            const w = f.replace(/\.json$/, '')
            if (!services.roster.flag(w, onlyOffline)) continue      // ★缸内成员不搬 ✓
            try { writeFileSync(join(myHello, f), readFileSync(join(rHello, f), 'utf8'), 'utf8'); mirrored++ } catch { /* 单个失败不拦住别的 ✓ */ }
          }
        }
      }

      // ②③④ 搬信
      let took = 0, skipped = 0, bad = 0, swept = 0, converged = 0
      const files = existsSync(rInbox) ? readdirSync(rInbox).filter((x) => x.endsWith('.msg.json')) : []
      if (!existsSync(rInbox)) console.log(`ⓘ 远端没有这个收件箱：${rInbox}（★只做了 hello 镜像 ✓）`)
      mkdirSync(rSeenDir, { recursive: true })          // ★准备"消费凭证"那一格 ✓
      // ★★★S6h-①②（2026-10-10 从正本移植；正本判据 73-76 ✓）——★"搬一半崩了"这个现场怎么收拾 ✗✓：
      //   ① ★**半截 `.tmp` ⇒ 不理它** ✓（★既不导入 ✓ 也不删 ✓ —— ★我们自己的 `.tmp` 就是半截的意思 ✓）；
      //      ★**陈旧**的 `.tmp`（★躺过 `tmpStaleMs`）⇒ ★**MOVE 进邮筒的 `垃圾/`** ✓✓ —— ★★**绝不删** ✗
      //      （★"绝不删"是我们这一族的老规矩：★看不懂的东西就挪到一边，别替别人决定它的死活 ✓）。
      //   ② ★**收敛式 MOVE** ✗✓：★如果某封信**已经在本机 `seen/` 里**（＝上次搬到一半崩了 ✓），
      //      而邮筒那份**还在 `inbox/`** ⇒ ★**把它补 MOVE 进 `seen/`** ✓ —— ★★且**不记账** ✗
      //      （★账在第一次导入时就记过了 ⇒ 再记就是**双记** ✓）。
      const rTrash = join(remote, '垃圾')
      const tmpStaleMs = Number(opt('tmp-stale-ms', 3600 * 1000))
      if (existsSync(rInbox)) {
        for (const x of readdirSync(rInbox)) {
          if (!x.startsWith('.') || !x.endsWith('.tmp')) continue          // ★只碰"看起来像我们半截"的 ✓
          // ⚠️ ★**不要**按 `as` 收窄 ✗ —— ★第一版我写成 `x.startsWith('.'+as+'.')` ⇒
          //   ★而邮筒上的半截可能**不属于任何收件人**（★比如别的进程留下的 ✓）⇒ ★那样就永远清不掉 ✓。
          //   ★这个收件箱是**我的**（★`inbox/<as>/` ✓）⇒ ★在里面的半截就是"该收拾的" ✓。
          let old = false
          try { old = Date.now() - statSync(join(rInbox, x)).mtimeMs > tmpStaleMs } catch { old = false }
          if (!old) { console.log(`半截   ${x}（★不理它 ✓ —— 可能是别的进程正在搬 ✓）`); continue }
          mkdirSync(rTrash, { recursive: true })
          try { renameSync(join(rInbox, x), join(rTrash, x)); swept++; console.log(`陈旧   ${x} ⇒ MOVE 进邮筒 垃圾/ ✓（★没删 ✗）`) } catch { /* 挪不动就算了 ✓ */ }
        }
      }
      for (const f of files) {
        // ★★S6h-② 收敛：★**"搬了一半"的现场** ✗✓ —— ★★它的样子是：
        //   ★**本机 `inbox/` 已经有这封信**（第①步做完了 ✓）★**而邮筒那份还没 MOVE 进 `seen/`**（第②步没做 ✓）。
        //   ⚠️ ★不收拾的后果 ✗：★幂等（`existsSync(mine,f)`）会把它判成"跳过" ⇒
        //     ★**邮筒那份永远留在 `inbox/`** ✓ —— ★"消费凭证"缺一份，而邮筒上多一份**永远搬不走的信** ✓✓。
        //   ⇒ 把邮筒那份**补 MOVE** ✓ —— ★★且**不记账** ✗（★账在第一次导入时就记过了 ⇒ 再记就是双记 ✓）。
        //   ⚠️ 必须**排在幂等判断之前** ✗（★否则先被 `existsSync` 拦成"跳过" ✓ —— 我第一版就这么写的 ✓）。
        if (existsSync(join(mine, f)) && !remoteSeen.has(f)) {
          try { renameSync(join(rInbox, f), join(rSeenDir, f)); converged++; console.log(`收敛   ${f} ⇒ 搬了一半：邮筒那份补 MOVE 进 seen/ ✓（★不记账 ✗）`) } catch { /* 挪不动下次再来 ✓ */ }
          continue
        }
        // ★③ 幂等认三处 ✓
        if (mineSeen.has(f) || remoteSeen.has(f) || existsSync(join(mine, f))) { skipped++; continue }
        let env = null
        try { env = JSON.parse(readFileSync(join(rInbox, f), 'utf8')) } catch { bad++; console.log(`坏件   ${f}（读不出来 ⇒ 不搬）`); continue }
        const probs = bus.verify(env)
        if (probs.length) { bad++; console.log(`不过   ${f} :: ${probs.join('；')}（★不搬、不消费、不删 —— 留在远端等人查 ✓）`); continue }
        const tmp = join(mine, `.${f}.tmp`)
        // ★★★搬信要**保住原始 mtime** ✗✓（2026-10-10 按正本 S6h-③ 加）
        //   ★病 ✗：★`writeFileSync` ＋ `renameSync` 会给它**现在**的 mtime ⇒
        //     ★**"刚取回来的信"看起来像"刚到"** ✓ ⇒ ★★而休眠推断／新鲜度判定**正是看 mtime 的**
        //     ⇒ ★**等于用假在线骗自己的闸** ✗✓（★正本原话 ✓）。
        const srcStat = statSync(join(rInbox, f))
        writeFileSync(tmp, JSON.stringify(env, null, 2), 'utf8')
        renameSync(tmp, join(mine, f))                  // ★落地（抛了就轮不到下面两行 ✓）
        try { utimesSync(join(mine, f), srcStat.atime, srcStat.mtime) } catch { /* ★设不上不拦住搬信 ✓ */ }
        renameSync(join(rInbox, f), join(rSeenDir, f))  // ★★远端那份 MOVE 进 seen ✗（消费凭证 ✓）
        took++
        // ★★④ 到达侧记账：记**发件人**的配额 ✗ —— ★**默认不记，要 `--account` 显式开** ✓
        //   ⚠️ 为什么默认关：★缸里的场景是"**手机**把信留在邮筒、**缸内成员取件时替它记**"（★手机自己不记 ✓）；
        //      ★但如果**远端本身就是一台真邮局**（它有自己的 gate ✓），它**在发信时就记过了** ✗
        //      ⇒ 我们再记一遍**就是双记** ✓。★"远端有没有账本"是**部署事实**，不是核心能猜的 ⇒ 交给使用者说 ✓。
        let quota = ''
        if (flag('account') && services.gate && typeof services.gate.record === 'function') {
          try {
            const rec = services.gate.record({ as: env.from, to: as, targets: [as], mode: env.mode ?? 'online', type: env.type ?? 'direct', subject: env.subject ?? '', body: env.body ?? '' })
            if (rec) quota = `　配额（${rec.bucket}）：${env.from} 今日 ${rec.used + rec.units}/${Number.isFinite(rec.limit) ? rec.limit : '∞'}`
          } catch { /* ★记账失败不该让信丢掉 ✓ */ }
        }
        console.log(`取回   ${f} :: ${env.from} → ${as}《${env.subject ?? ''}》[${env.mode ?? 'online'}]${quota}`)
      }
      console.log(`\n取回 ${took} 封，跳过 ${skipped} 封（已有），没搬 ${bad} 封，镜像 hello ${mirrored} 份` +
        (swept || converged ? `，清理陈旧半截 ${swept} 个，收敛补 MOVE ${converged} 封` : ''))
      console.log('★远端没搬走的都还在那儿 ✓；搬走的留在它的 seen/ 里当消费凭证 ✓；★记账记在**发件人**名下 ✓')
      return bad > 0 && took === 0 ? 2 : 0
    }
    if (cmd === 'quota') {
      const as = opt('as')
      const who = as ? [as] : services.roster.list().map((m) => m.id)
      for (const w of who) {
        const q = services.gate.report({ as: w, days: Number(opt('days', 7)) || 7 })
        const t = q.today
        const buckets = q.buckets.map((b) => `${b.bucket} ${b.used}/${Number.isFinite(b.limit) ? b.limit : '∞'}`).join('　')
        console.log(`${w.padEnd(12)} 今日 ${t ? `${t.units} 单位 ＋ 离线 ${t.offlineLetters ?? 0} 条／${t.letters} 封` : '无'}　［${buckets}］`)
      }
      if (services.gate.cfg.quota.onOver === 'price') console.log('（闸在 price 档：越额照发，只记账）')
      return 0
    }
    if (cmd === 'verify') {
      const v = services.verify
      if (flag('enable')) { v.enable(); console.log('安全校验：已开启（信封验签 ＋ 白名单）'); return 0 }
      if (flag('disable')) { v.disable(); console.log('安全校验：已关闭（★不是"安全"，是"已知不安全 ＋ 会提醒你"）'); return 0 }
      const st = v.status()
      console.log(st.enabled
        ? `安全校验：✓ 已开启${st.enabledAt ? '（' + st.enabledAt + '）' : ''}`
        : '安全校验：★禁用中')
      if (!st.enabled) {
        console.log(`  提醒进度：第 ${st.dayIndex} / ${st.nagLimit} 天${st.willNag ? '（还会提醒）' : '（★已提满 ⇒ 不再提醒；但状态仍是禁用）'}`)
        console.log('  建议开启，以免未知 agent 对其他 agent 发起欺骗或攻击。')
        console.log('  开启：给 dsh-whale-post-verify 传 enabled: true，或本命令加 --enable')
      }
      console.log(`  白名单：${st.allowCount} 个${st.allowCount === 0 ? '（空 ⇒ 不限制收件人）' : ''}`)
      console.log(`  状态文件：${st.stateFile}`)
      return 0
    }
    if (cmd === 'nag') {
      const text = services.verify.nag()
      console.log(text === null ? '（无需提示）' : text)
      return 0
    }
    if (cmd === 'selftest') return selftest() ? 0 : 1
    return die(2, `不认识的命令：${cmd}`)
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    if (/拒发|非法|未知收件人|未注册|正文为空|握手|配额|回环闸|不能给自己/.test(msg)) die(2, msg)
    console.error(msg)
    return 1
  }
}

process.exitCode = main()
