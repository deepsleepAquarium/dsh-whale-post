/**
 * 假手机（`fake-phone`）—— **在没有 NAS、没有真手机的情况下，把手机那一端演出来**
 *
 * **它从哪来**：设计文档《跨设备邮局-1.0局域网实现清单》（2026-10-06 02:0x）**§三** 原话 ——
 *   「**另写一个"假手机"脚本** （用 `node` 直接读写"模拟邮筒"目录，
 *     完整体现手机的**五个动作**：`PUT hello`／`PROPFIND≈列目录`／`GET`／`MOVE⇒seen`／`PUT ack`）
 *     ⇒ **端到端跑通** （班级机投 ⇒ 假手机收 ⇒ 假手机回 ⇒ 班级机取）；
 *     **等维护者那五个字一齐** ⇒ 把远端根换成真地址 ⇒ **换一行配置**。」
 *
 * **为什么要有它**："班级内那半边"（`send` 投远端／`pickup` 搬回 ＋ `MOVE` ＋ 回执）早就写好了，
 *   而**另一端从来没有人演过** ⇒ **"端到端跑通"这句话一直只是**推断****。
 *   **它把推断变成演示**。
 *
 * **五个动作照实做** （不是"假装" —— **hello 与 ack 都是**真签的****）：
 *   ① **PUT hello** ⇒ 写 `<邮筒>/hello/<我>.json`（用 `bus` 真的 `seal` ⇒ 班级机验得过）；
 *   ② **列目录** ≈ `PROPFIND` ⇒ 列 `<邮筒>/inbox/<我>/`（只认 `*.msg.json` —— `.tmp` 一律忽略）；
 *   ③ **GET** ⇒ 读信；
 *   ④ **MOVE ⇒ seen** ⇒ 搬进 `<邮筒>/seen/<我>/`（**MOVE 是先写后删**：写成功才删原件）；
 *   ⑤ **PUT ack** ⇒ 写 `<邮筒>/ack/<原发件人>/<id>.<我>.ack.json`（**也是真签的**）。
 *
 * 用法：
 *   node scripts/fake-phone.mjs <邮筒根> <我的名字> --recv offline-only --cap 3
 *   node scripts/fake-phone.mjs <邮筒根> <我的名字> --drain      # 把收件箱里的都收下并回执 
 *
 * ⚠️ 它**不是生产代码** —— 是**端到端演示与自测的零件** （跟 `racetest-acct-one.mjs` 同级）。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBus } from '../packages/bus/index.js'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const [mailbox, me] = [process.argv[2], process.argv[3]]
if (!mailbox || !me) {
  console.error('用法：node scripts/fake-phone.mjs <邮筒根> <我的名字> [--recv offline-only] [--cap N] [--drain] [--quiet 22:00-09:00]')
  process.exit(2)
}
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : undefined }
const drain = process.argv.includes('--drain')

// 假手机**就是另一个进程里的另一个成员** —— 所以它有自己的根（放 `keys/` 之类的地方），
//   而**信与回执都落在邮筒上** （这才是"跨设备"的样子）。
const myRoot = join(mailbox, '.fake-phone', me)
mkdirSync(myRoot, { recursive: true })
const bus = createBus({ root: myRoot })

const boxInbox = join(mailbox, 'inbox', me)
const boxSeen = join(mailbox, 'seen', me)
const boxHello = join(mailbox, 'hello')

// ── ① PUT hello（真签）───────────────────────────────────────────────
const recv = arg('recv')
const cap = arg('cap') ? Number(arg('cap')) : undefined
const quiet = typeof arg('quiet') === 'string' ? String(arg('quiet')).split('-').map((x) => x.trim()) : undefined
mkdirSync(boxHello, { recursive: true })
const helloEnv = bus.hello({ as: me, recv, onlineCapPerDay: cap, quiet })
//   `bus.hello` 写的是**我自己的根** ⇒ 要把它**抄到邮筒上** （真手机就是这个动作）
writeFileSync(join(boxHello, `${me}.json`), JSON.stringify(helloEnv, null, 2), 'utf8')
console.log(`① PUT hello ⇒ ${join(boxHello, me + '.json')}${recv ? `（收件习惯=${recv}）` : ''}`)

// ── ② 列目录 ≈ PROPFIND ⇒ ③ GET ⇒ ④ MOVE to seen ⇒ ⑤ PUT ack ────────────
const list = () => { try { return readdirSync(boxInbox).filter((f) => f.endsWith('.msg.json')) } catch { return [] } }
if (!drain) {
  const got = list()
  console.log(`② 列目录 inbox/ ⇒ ${got.length} 封`)
  got.forEach((f) => console.log(`   · ${f}`))
  process.exit(0)
}
mkdirSync(boxSeen, { recursive: true })
let took = 0
for (const f of list()) {
  const src = join(boxInbox, f)
  let env
  try { env = JSON.parse(readFileSync(src, 'utf8')) } catch { console.log(`③ GET 失败（跳过，不删）：${f}`); continue }
  console.log(`③ GET ⇒ ${f}（${env.from} → ${env.to}）`)
  //   ④ MOVE ⇒ seen：**先写后删** —— 搬到一半崩了，邮筒上那份还在 （"信只会晚到，不会不到"）
  try {
    writeFileSync(join(boxSeen, f), JSON.stringify(env, null, 2), 'utf8')
    unlinkSync(src)
    took += 1
  } catch (e) { console.log(`④ MOVE 失败（原信仍在 inbox/）：${e.message}`); continue }
  //   ⑤ PUT ack ⇒ `<邮筒>/ack/<原发件人>/<id>.<我>.ack.json` （真签）
  const ackDir = join(mailbox, 'ack', String(env.from))
  mkdirSync(ackDir, { recursive: true })
  const ackEnv = bus.seal({
    v: 1, kind: 'ack', id: env.id, from: me, to: env.from, seq: env.seq ?? 0, body: '', sha256: '',
    sentAtMs: Date.now(), re: env.id, by: me, ok: true, note: '',
    recipientState: 'offline', disposition: 'delivered-offline',
    peerStateAtSend: 'offline',      // 假手机**只收离线** ⇒ 它看到对端是"没被叫醒"的 
  })
  const ackPath = join(ackDir, `${env.id}.${me}.ack.json`)
  writeFileSync(ackPath, JSON.stringify(ackEnv, null, 2), 'utf8')
  console.log(`⑤ PUT ack ⇒ ${ackPath}`)
}
console.log(`\n假手机（${me}）：收了 ${took} 封，回了 ${took} 份回执 `)
