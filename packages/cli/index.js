#!/usr/bin/env node
/**
 * dsh-whale-post-cli —— 零依赖命令行（★它是**入口工具**，不是插件）
 *
 *   whale-post hello  --as alice
 *   whale-post send   --as alice --to bob --subject 主题 --body 正文 [--mode online|offline]
 *                     [--type direct|broadcast|club|…] [--re <父信 id>] [--force]
 *                     [--live bob,carol]     # 哪些收件人此刻有"活体会话"（在线件才会真投出去）
 *   whale-post pump   --as bob [--keep]      # 收信（默认消费：搬进 seen ＋ 写 ack）
 *   whale-post quota  --as alice [--days 7]
 *   whale-post roster / types / key / selftest
 *
 * 通用参数：`--root <目录>`（★默认 `./.whale-mail`，或环境变量 `WHALE_POST_ROOT`）
 * 退出码：0 ＝ 成功；2 ＝ 拒发／输入不合法；1 ＝ 没料到的错。
 * ★判据看**退出码**，不要看输出里的中文。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createBus } from 'dsh-whale-post-bus'
import { createRoster } from 'dsh-whale-post-roster'
import { createTypes } from 'dsh-whale-post-types'
import { createDeliver } from 'dsh-whale-post-deliver'
import { createGate } from 'dsh-whale-post-gate'

const argv = process.argv.slice(2)
const cmd = argv[0]
const opt = (name, dflt = undefined) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt
}
const flag = (name) => argv.includes(`--${name}`)
const die = (code, msg) => { if (msg) console.error(msg); process.exit(code) }

/** 把四个接口件拼起来（★核心只认接口，这里就是"接线"） */
function wire({ root, live } = {}) {
  const r = root ?? opt('root') ?? process.env.WHALE_POST_ROOT ?? join(process.cwd(), '.whale-mail')
  const injected = []
  // ★`--live a,b` 声明"这些人此刻有活体会话"（独立审计 2026-10-05：原来它只在自测里被用到 ⇒ 死参数 ✗）
  const liveList = (Array.isArray(live) && live.length)
    ? live
    : String(opt('live', '')).split(',').map((s) => s.trim()).filter(Boolean)
  const liveSet = new Set(liveList)
  const services = {
    roster: createRoster({ file: opt('roster') ?? join(r, 'roster.json') }),
    types: createTypes(),
    gate: createGate({ root: r }),
    deliver: createDeliver({
      sessionOf: (id) => (liveSet.has(id) ? { live: true, inject: (text) => injected.push({ id, text }) } : undefined),
    }),
  }
  const bus = createBus({ root: r, services })
  return { root: r, bus, services, injected, liveSet }
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

    const { bus: w, services, injected } = wire({ root: tmp, live: ['bob'] })   // ★只有 bob 有"活体会话"
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
    let e1 = ''
    try { w.send({ as: 'alice', to: 'bob', subject: '回执', body: '收到' }) } catch (e) { e1 = e.message }
    check('回环闸①：纯回执拒发', /纯回执/.test(e1), e1)

    // ⑦ 回环闸②：同一对 20 分钟内限封数（第 4 封起拒）
    w.send({ as: 'alice', to: 'bob', subject: '第三封', body: '同一对第三封（正文有货，不是回执）' })
    let e2 = ''
    try { w.send({ as: 'alice', to: 'bob', subject: '连发', body: '同一个人连着发第 4 封（正文有货，不是回执）' }) } catch (e) { e2 = e.message }
    check('回环闸②：同对限封数（第 4 封拒）', /同对回环/.test(e2), e2)

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
      console.log(`投递策略：${verdictTxt}`)
      const bucket = r.mode === 'offline' ? 'offline' : r.type
      const b = services.gate.report({ as }).buckets.find((x) => x.bucket === bucket)
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
