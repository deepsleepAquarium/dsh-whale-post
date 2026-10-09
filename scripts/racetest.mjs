/**
 * ★★★并发压测 ＋ "state 被写倒退"复现 ＋ **并发记账不许丢** ✗✓
 *   （2026-10-10 从缸里正本 `racetest` 移植；★12 路记账那节是当晚新加的 ✓）
 *
 * ★为什么要有它 ✗：`bus` 的 `claimSeq` 原来是"读 nextSeq → 加一 → 写回" ⇒
 *   **两个进程都读到 N 就都发 N** ✓ —— ★这条"没测到"在文档里挂了一晚 ✓，
 *   而正本里**早就有**这个压测（且正本记着：「第一版用独占锁 —— 24 路压测过、48 路压测 9 组撞号 ⇒ 弃用锁」✓）。
 *
 * ★测八条 ✗：
 *   ① **12 路真子进程同时 send** ⇒ 退出码全 0（★不是模拟：真起 12 个 node ✓）
 *   ② 投出 **12 封**（不多不少）
 *   ③ ★★**`seq` 全唯一**（★本轮要害 ✓）
 *   ④ **水位线文件** `state/<as>.seq` 记到了最大号
 *   ⑤ ★★**倒退复现**：把 `state/<as>.json` 的 `nextSeq` 写回 1
 *      （★＝旧代码 `pump` 拿旧快照回写的样子 ✓）⇒ **新信仍不许重号**（水位线兜底 ✓）
 *   ⑥ ★★★**并发记账：12 路真子进程各往同一个配额台账里记一笔 ⇒ 该正好 12 条** ✗✓
 *      —— ★**这条是当晚抓真 bug 抓出来的** ✓：`gate` 的台账原来是"读 → 改 → 写回" ⇒
 *      ★**12 路并发只记到 8／9／10 条** ✓（★而"配额是别人的钱"，★它**没有任何兜底** ✓）。
 *      ★现在改成"**各写各的增量文件**"（★正本给 `ack` 用的那个手法 ✓）⇒ ★**一条都不许丢** ✓。
 *   ⑦ ★**换一个 `gate` 实例再读** ⇒ 仍是 12 条（★这才能验"增量真的落盘了" ✓）
 *   ⑧ ★**增量文件名各写各的**（★带时间戳 ＋ 随机 ⇒ 物理上不可能撞车 ✓）
 *
 * ★不碰真邮局：全程用**临时根** ✓。★判据看**退出码**：0 过／非 0 不过 ✓（不看输出里的中文 ✗）。
 * ⚠️ 压测要连发十几封，**回环闸会正确地拦住它** ⇒ 本测试整体加 `--no-gate` ✓
 *   （★压测要看的是"发号撞不撞"，不是"闸拦不拦" ✓ —— 闸已经有自己的判据 ✓）。
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { createGate } from '../packages/gate/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, '..', 'packages', 'cli', 'index.js')
const N = Number(process.env.RACE_N ?? 12)

const tmp = join(process.env.TEMP ?? '/tmp', `whale-racetest-${Date.now()}`)
mkdirSync(tmp, { recursive: true })
writeFileSync(join(tmp, 'roster.json'), JSON.stringify({
  apiVersion: 1, members: [{ id: 'web' }, { id: 'qq' }],
}, null, 2), 'utf8')

const checks = []
const check = (name, ok, extra = '') => checks.push({ name, ok: !!ok, extra: String(extra) })
const run = (args) => new Promise((resolve) => {
  const c = spawn(process.execPath, [cli, ...args, '--root', tmp, '--no-gate'], { stdio: 'ignore' })
  c.on('exit', (code) => resolve(code === null ? -1 : code))
  c.on('error', () => resolve(-1))
})

const lsInbox = () => {
  try { return readdirSync(join(tmp, 'inbox', 'qq')).filter((f) => f.endsWith('.msg.json')) } catch { return [] }
}
const seqOf = (f) => Number(String(f).replace('.msg.json', '').split('-')[2])
const watermark = () => { try { return Number(readFileSync(join(tmp, 'state', 'web.seq'), 'utf8').trim()) } catch { return 0 } }

await run(['hello', '--as', 'qq'])

// ① 12 路同时发（★真子进程 ✓）
const codes = await Promise.all(Array.from({ length: N }, (_, i) => run([
  'send', '--as', 'web', '--to', 'qq', '--subject', `并发${i + 1}`,
  '--body', `并发压测第 ${i + 1} 封：正文各不相同，杜绝一切"按内容去重"的可能。`,
])))
check(`并发 ${N} 路 send 全部退出码 0`, codes.every((c) => c === 0), `codes=${codes.join(',')}`)

// ②③④
const files = lsInbox()
const seqs = files.map(seqOf)
check(`投出 ${N} 封（不多不少）`, files.length === N, `实际 ${files.length}`)
check('★★`seq` 全唯一（★本轮要害）', new Set(seqs).size === seqs.length, `seqs=${seqs.slice().sort((a, b) => a - b).join(',')}`)
const maxSeq = seqs.length ? Math.max(...seqs) : 0
check('水位线文件记到了最大号', watermark() === maxSeq, `水位线=${watermark()} 最大号=${maxSeq}`)

// ⑤ ★倒退复现：把 state 的 nextSeq 写回 1（＝旧代码 pump 拿旧快照回写的样子），再发一封
const stPath = join(tmp, 'state', 'web.json')
const st = JSON.parse(readFileSync(stPath, 'utf8'))
st.nextSeq = 1
writeFileSync(stPath, JSON.stringify(st, null, 2), 'utf8')
const wm = watermark()
const codeAfter = await run(['send', '--as', 'web', '--to', 'qq', '--subject', '倒退后', '--body', 'state 被写倒退之后，新信仍不许重号（正文有货，别当回执）'])
const after = lsInbox().map(seqOf).sort((a, b) => a - b)
const newSeq = after[after.length - 1]
check('★state 被写倒退后，新信仍拿新号（水位线兜底）', codeAfter === 0 && newSeq === wm + 1 && newSeq > maxSeq,
  `新号=${newSeq} 应有=${wm + 1} 倒退前最大=${maxSeq}`)
check('★★倒退之后 `seq` 仍全唯一', new Set(after).size === after.length, `seqs=${after.join(',')}`)
check('认领文件没堆成山（留最近 300 个以内）',
  (() => { try { return readdirSync(join(tmp, 'state')).filter((f) => /^web\.seq\.\d{6}$/.test(f)).length <= 300 } catch { return false } })())

// ★★★⑥⑦⑧ 并发记账：12 路**真子进程**各往同一个配额台账里记一笔 ⇒ 该正好 12 条 ✗✓
//   ★**这条是当晚抓真 bug 抓出来的** ✓ —— `gate` 的台账原来是"读 → 改 → 写回" ⇒
//     ★**12 路并发只记到 8／9／10 条** ✓（★而"配额是别人的钱"，它**没有任何兜底** ✓）。
//   ★现在改成"**各写各的增量文件**"（★正本给 `ack` 用的那个手法：★"每份各写各的文件 ⇒ 物理上不可能撞车" ✓）。
//   ⚠️ ★这里**故意不复用上面那个 `run`** ✗（★那个走 CLI、会被闸和别的逻辑影响 ✓）——
//     ★直接起一个**只调 `gate.record`** 的子进程 ✓ ⇒ ★测的**只有记账这一件事** ✓。
const acctRoot = join(tmp, 'acct')
mkdirSync(acctRoot, { recursive: true })
//   ★★子脚本是**仓库里的固定文件** ✗✓（`scripts/racetest-acct-one.mjs` ✓）——
//     ★为什么不用临时文件：★① Windows 的 ESM 吃不了 `D:/…` 这种绝对路径（★早先栽过 ✓）；
//     ★② 临时文件要么每次重写（★那会把工作区弄脏 ⇒ `git status` 老是有改动 ✗）、
//     ★   要么写完就删（★那"改了什么"就查不到了 ✓）⇒ ★放仓库里、跟着一起提交最干净 ✓。
const acctOne = join(here, 'racetest-acct-one.mjs')
const runAcct = () => new Promise((resolve) => {
  const c = spawn(process.execPath, [acctOne, acctRoot], { stdio: 'ignore' })
  c.on('exit', (code) => resolve(code === null ? -1 : code))
  c.on('error', () => resolve(-1))
})
const acctCodes = await Promise.all(Array.from({ length: N }, () => runAcct()))
check(`并发记账：${N} 路子进程全部退出码 0`, acctCodes.every((c) => c === 0), `codes=${acctCodes.join(',')}`)
check(`★★★并发记账：${N} 路各记一笔 ⇒ 台账**正好 ${N} 条**（★一条都不许丢 ✓）`,
  createGate({ root: acctRoot }).report({ as: 'w' }).letters === N,
  `实际 ${createGate({ root: acctRoot }).report({ as: 'w' }).letters} 条`)
check('★★并发记账：**换一个实例**再读仍是 12 条（★这才能验"增量真落盘了" ✓）',
  createGate({ root: acctRoot }).report({ as: 'w', days: 3650 }).letters === N)
check('★并发记账：增量文件**各写各的**（★带时间戳 ＋ 随机 ⇒ 物理上不撞车 ✓）',
  (() => {
    try {
      const fs2 = readdirSync(join(acctRoot, 'state', 'quota-w.d'))
      return fs2.length === N && new Set(fs2).size === N
    } catch { return false }
  })())

const pass = checks.filter((c) => c.ok).length
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
console.log(`\n${pass}/${checks.length} 通过   （临时邮局：${tmp}）`)
process.exit(pass === checks.length ? 0 : 1)
