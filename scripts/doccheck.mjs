/**
 * ★★★中英文档的**结构对等**检查（`doccheck`）✗✓ —— **比"数标题"深一层**
 *
 * ★为什么要有它 ✗：★我们已经在"文档不对等"上栽过**两次**：
 *   ① ★中文 `README.md` 里**整整缺了两段**（★"并发抢号：已测" ＋ ★"**仍未测**" ✓），而英文有 ✓ ——
 *      ★★**而缺的偏偏是**诚实声明**那一段** ✗（★纪律写着"不许声称未验证的事" ✓）；
 *   ② ★我在中文里补完之后，★**英文又少了 `xcheck` 那段** ✗（★反向 ✓）。
 * ★★两次都是**"标题数一致"的复核放过去的** ✗✓ —— ★因为★**它只看标题** ✓，★看不出"正文缺段" ✓。
 *
 * ★这份脚本查什么 ✗（★逐份配对 ＋ 逐项计数 ✓）：
 *   · ★**标题数**（`^#{1,6} ` ✓）＋ ★**标题顺序**（去掉编号后逐条比 ✓）
 *   · ★★**条目数**（`^* ` 开头 ✓）—— ★**上一轮就是靠它看出 15 vs 14** ✓
 *   · ★**表格数** ＋ ★**每张表的列数**
 *   · ★**代码块数**（``` 配对数 ✓）
 *   · ★**链接数**（`](…)` ✓）
 *   · ★**行数**（★只报、不判 —— ★中英行数天然会差 ✓）
 *   · ★★**每份文档**内部：★**所有表格的列数必须一致** ✗（★这是 markdown 表格最常见的坏法 ✓）
 *
 * ★判据看**退出码** ✓：0 全对等／非 0 有不对等 ✓（★不看输出里的中文 ✗）。
 * ⚠️ ★配不上对的单份文档**不算错** ✗（★比如 `example/README.md` 可能本来就没有英文版 ✓）——
 *   ★只有"**一边有一边没有**"才报 ✓。
 */
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
//   ★★**计数口径只此一份** ✗✓：★`doccheck`（比中英）与★`check-doc-shape`（比改写前后）共用它 ✓
import { profile } from './doc-shape.mjs'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const rel = (p) => relative(repo, p).replace(/\\/g, '/')

/** ★扫出仓库里所有 `.md`（★排除 `node_modules` ＋ **改写时留的备份** ✓） */
//   ★★**为什么要排备份** ✗✓（2026-10-10 加）：★备份用 `cp` 留在 `.strip-backups/` ✓ ⇒
//     ★**它们和正本**同名**（★只是不同目录 ✓）⇒ ★★★**会被配成"一对中英文档"** ✗ ⇒
//     ★报出来的**份数和对数全是虚的**（★实测：★26 份 → 50 份、9 对 → 17 对 ✓）✓。
//   ★★**为什么不能只靠 `.gitignore`** ✗✓：★`.gitignore` 只对 **git** 生效 ✓ ⇒
//     ★**本工具是直接读目录的** ⇒ ★**它照样扫得到** ✓ —— ★**所以排除规则要在**这里**再写一遍** ✓。
//   ★**教训** ✗：★**"加了忽略"不等于"它不在了"** ✓ —— ★**要看**读的人是谁** ✓。
const SKIP_DIRS = new Set(['node_modules', '.git', '.strip-backups'])
const SKIP_FILE = /(^|\.)pilot-backup|\.pre[0-9]+$|\.bak-|^t-.*\.md$/
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name) || SKIP_FILE.test(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}

//   ★本地那份 `profile()` 已抽到 `./doc-shape.mjs` ✓（★共用，★不再各写一份 ✗）

const checks = []
const check = (name, ok, extra = '') => checks.push({ name, ok: !!ok, extra: String(extra) })
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const all = walk(repo)
const set = new Set(all.map(rel))
const pairs = []
for (const p of all) {
  const r = rel(p)
  if (r.endsWith('.en.md')) continue
  const en = r.replace(/\.md$/, '.en.md')
  if (set.has(en)) pairs.push([p, join(repo, en)])
}

check(`① 找到 ${pairs.length} 对中英文档（★配不上对的不算错 ✓）`, pairs.length > 0, pairs.map(([a]) => rel(a)).join('、'))

const diffs = []
for (const [cnPath, enPath] of pairs) {
  const cn = profile(readFileSync(cnPath, 'utf8'))
  const en = profile(readFileSync(enPath, 'utf8'))
  const name = rel(cnPath)
  if (cn.headings.length !== en.headings.length) {
    //   ★★报得**具体一点** ✗✓：★按层级列出来（★"哪个层级差了几个"比"总数差 2"好定位得多 ✓）
    const lv = [1, 2, 3, 4, 5, 6].map((k) => `h${k} ${cn.byLevel[k]}/${en.byLevel[k]}`).join(' ')
    diffs.push(`${name}: 标题数 ${cn.headings.length} vs ${en.headings.length}（${lv}）`)
  }
  if (cn.bullets !== en.bullets) diffs.push(`${name}: 条目数 ${cn.bullets} vs ${en.bullets}`)
  if (cn.tables !== en.tables) diffs.push(`${name}: 表格数 ${cn.tables} vs ${en.tables}`)
  //   ★★围栏：★**必须是偶数** ✗（★奇数 ⇒ 有一个没配上 ⇒ 后面全被当成代码块 ✓），★且两边要相等 ✓
  if (cn.fences % 2 !== 0 || en.fences % 2 !== 0) {
    diffs.push(`${name}: 代码围栏**没配对**（CN ${cn.fences} ／ EN ${en.fences} —— ★该是偶数 ✓）`)
  } else if (cn.fences !== en.fences) diffs.push(`${name}: 代码围栏数 ${cn.fences} vs ${en.fences}`)
  if (cn.links !== en.links) diffs.push(`${name}: 链接数 ${cn.links} vs ${en.links}`)
}

check('② ★中英**逐项对等**（标题／条目／表格／代码围栏／链接 ✓）', diffs.length === 0,
  diffs.length ? diffs.join(' ／ ') : `${pairs.length} 对全部对上`)

// ★★每份文档**内部**：★表格列数必须一致 ✗（★这是 markdown 表格最常见的坏法 ✓）
const badTables = []
for (const p of all) {
  const { tableWidths } = profile(readFileSync(p, 'utf8'))
  const bad = tableWidths.filter((w) => w === -1).length
  if (bad > 0) badTables.push(`${rel(p)}（${bad} 张表列数不齐）`)
}
check('③ ★每份文档内部：**表格列数一致** ✗（★列不齐是最常见的坏法 ✓）', badTables.length === 0,
  badTables.length ? badTables.join('、') : `${all.length} 份文档全齐`)

// ★★★④、**判据条数**那条：**写了又撤了** ✗✓（2026-10-10 15:1x）——
//   ★★**想防什么** ✗✓：★文档里写着“共 N 条判据” ✓ —— ★而 N 是手工抄的 ⇒ ★加一条它就过期 ✗。
//   ★★**为什么撤** ✗✓：★先去扫了一遍真的文档 ✓ ⇒ ★全文只有 3 处提条数 ✓，★而**它们指的都不是总数**（★一是 `racetest` 的 11 条、
//     ★一是 `gate` 那次改动加的 11 条 ✓）⇒ ★★**“总数会过期”这个前提本来就不成立** ✗✓。
//   ★★★**而判据改了四版全在同一处撞墙** ✗✓：
//     ① ★认窄（★只认一种句式 ⇒ 成摆设 ✗）；② ★认宽（★误报 ✗）；
//     ③ ★漏加粗（★负向测试没红 ✗）；④ ★改对了正则 ✓ —— ★而**这一次它红得对不对**？✗
//     ★它报 `README.md` L105 说 11 ✗ —— ★而**那一处说的是 `gate` 改动加的条数** ✓ ⇒ ★**它又误报了** ✗✓。
//   ★★★★**教训** ✗✓：★**同一句话在文档里有两种含义 ⇒ 判据无法从这句话本身分辨** ✓✓ ——
//     ★**那就是判据的前提不成立** ✓ ⇒ ★**而造一条会误报的判据，比没有判据更糟** ✗✓（★它会训练人忽略红 ✗）。
//   ★⇒ ★撤回 ✓。★而这段注释留着 ✓ —— ★下次想加类似判据时，先看它 ✓。
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
const pass = checks.filter((c) => c.ok).length
console.log(`\n${pass}/${checks.length} 对等   （扫了 ${all.length} 份 .md，配成 ${pairs.length} 对）`)
process.exit(pass === checks.length ? 0 : 1)
