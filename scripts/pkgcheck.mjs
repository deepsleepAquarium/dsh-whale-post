/**
 * ★★★包元数据检查（`pkgcheck`）✗✓ —— ★**"该一致的必须一致" ＋ ★"故意不一致的不许被顺手补齐"**
 *
 * ★为什么要有它 ✗：★"发布"这件事上我们踩过坑，而坑都长在**元数据**里（不是代码里）：
 *   · ★版本号：★七件**必须同一个版本** ✓ —— 发版时漏掉一件，★**装上去就是半新半旧** ✗；
 *   · ★★`dsh.bundle.patch`：★**插件包少了它，真引擎里就是"装上了但什么都不做"** ✗
 *     （★这条我们写在 `INSTALL` §五第 1 条里，★而**没有任何判据盯着它** ✓）；
 *   · ★`private: true` 的包**发不出去** ✓（★根 `package.json` 该 private，★而**七个包不该** ✓）。
 *
 * ★★**最要紧的一条是"故意的不一致"** ✗✓：★六件是**插件** ✓，★而 `cli` **是入口工具、不是插件** ✓
 *   （★正本纪律原话：★"`cli` 是入口工具（★**不是插件** ✗）" ✓）⇒ ★它**本来就该没有 `dsh`** ✓。
 *   ★★但"少了一个字段"看起来**特别像"忘了加"** ✗ ⇒ ★**下一个人会顺手补齐** ⇒ ★**把 CLI 也变成插件** ✗✓。
 *   ★所以这条判据**明着写"cli 必须没有"** ✓ —— ★让"故意的不一致"**看得见** ✓。
 *
 * ★判据看**退出码** ✓：0 全对／非 0 有不对 ✓。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGINS = ['bus', 'roster', 'types', 'deliver', 'gate', 'verify']
const CLI = 'cli'
const ALL = [...PLUGINS, CLI]

const checks = []
const check = (name, ok, extra = '') => checks.push({ name, ok: !!ok, extra: String(extra) })

/** ★读一个包的 package.json ✓ */
const pkgOf = (p) => {
  const f = join(repo, 'packages', p, 'package.json')
  if (!existsSync(f)) return null
  try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return null }
}

const pkgs = Object.fromEntries(ALL.map((p) => [p, pkgOf(p)]))
check(`① 七个包的 \`package.json\` 都在（★${ALL.join('、')} ✓）`, ALL.every((p) => pkgs[p] !== null),
  ALL.filter((p) => pkgs[p] === null).join('、'))

// ★★② 版本号**必须全等** ✗（★发版漏一件 ⇒ 装上去半新半旧 ✓）
const versions = [...new Set(ALL.map((p) => pkgs[p]?.version).filter(Boolean))]
check('② ★版本号**七件全等** ✗（★漏一件就是"半新半旧" ✓）', versions.length === 1,
  versions.length === 1 ? `全是 ${versions[0]}` : `出现了 ${versions.join('、')}`)

// ★★③ 六件插件**必须**有 `dsh.bundle.patch` ✗（★少了它，真引擎里"装上了但什么都不做" ✓）
const noDsh = PLUGINS.filter((p) => !pkgs[p]?.dsh?.bundle?.patch)
check('③ ★六件插件**都有** `dsh.bundle.patch` ✗（★少了它真引擎里"装上了但什么都不做" ✓）',
  noDsh.length === 0, noDsh.length ? `缺：${noDsh.join('、')}` : PLUGINS.join('、'))

// ★★★④ `cli` **必须没有** `dsh` ✗✓（★它是**入口工具、不是插件** ✓）——
//   ★★这条是"**故意的不一致**" ✗✓：★"少一个字段"看起来特别像"忘了加" ✓ ⇒
//     ★**下一个人会顺手补齐** ⇒ ★**把 CLI 也变成插件** ✗ ⇒ ★所以明着写出来 ✓。
check('④ ★★`cli` **必须没有** `dsh` ✗（★它是**入口工具、不是插件** ✓ —— ★故意的不一致，别顺手补齐 ✗）',
  pkgs[CLI] !== null && pkgs[CLI].dsh === undefined,
  pkgs[CLI]?.dsh === undefined ? '没有 ✓（正确）' : '★ 它有了 dsh ⇒ 被当成插件了')

// ★★★②b **包之间的依赖范围必须覆盖当前版本** ✗✓（2026-10-10 加 —— ★而它**当场就抓到一个真的** ✓）
//   ★**病** ✗：★`cli` 的 `dependencies` 里六个包都钉着 `^0.2.0` ✓ ⇒ ★而我们把版本升到 `0.3.0` ✓
//     ⇒ ★★**`^0.2.0` 的语义是 `>=0.2.0 <0.3.0`** ⇒ ★**它匹配不上 `0.3.0`** ✓✓
//     ⇒ ★★★**装 `cli@0.3.0` 会去要 `0.2.x` 的依赖 ⇒ 装出来是"半新半旧"** ✗✓。
//   ★★为什么这条**容易漏** ✗✓：★上面第②条"七个包的 `version` 全等"**看着已经对了** ✓ ——
//     ★而**依赖范围写在另一个字段里** ✓，★**版本号升了它不会自己动** ✓（★甚至可以说：★
//     "把七处版本号一起改"这个动作**恰好**会让人以为"版本的事都改完了" ✗）。
//   ★接受的写法：★`^x.y.z`／`~x.y.z`／`>=x.y.z`／精确 `x.y.z`／`*` ✓ —— ★**范围含当前版本**就算过 ✓。
const rangesOf = (p) => Object.entries({ ...(pkgs[p]?.dependencies ?? {}), ...(pkgs[p]?.peerDependencies ?? {}) })
  .filter(([n]) => n.startsWith('dsh-whale-post-'))
const badRanges = []
for (const p of ALL) {
  for (const [name, range] of rangesOf(p)) {
    const target = name.replace('dsh-whale-post-', '')
    const tv = pkgs[target]?.version
    if (!tv) continue
    const m = String(range).match(/\d+\.\d+\.\d+/)
    if (!m) continue                                   // ★`*` 之类 ⇒ 放行 ✓
    const [maj, min] = m[0].split('.')
    const [cmaj, cmin] = String(tv).split('.')
    if (maj !== cmaj || min !== cmin) badRanges.push(`${p}→${name}@${range}（★当前 ${tv}）`)
  }
}
check('②b ★★包内依赖的**版本范围覆盖当前版本** ✗（★否则装出来"半新半旧" ✓）',
  badRanges.length === 0, badRanges.length ? badRanges.join('、') : '全对上')
//   ⓘ ★这条**当场就抓到一个真的** ✗✓（2026-10-10）：★`cli` 的六个依赖原来都钉着 `^0.2.0` ✓，
//     而★版本升到 `0.3.0` 之后 —— ★**`^0.2.0` 的语义是 `>=0.2.0 <0.3.0`** ⇒ ★**它匹配不上 `0.3.0`** ✓
//     ⇒ ★★★**装 `cli@0.3.0` 会去要 `0.2.x` 的兄弟包 ⇒ 装出来是"半新半旧"** ✗✓。
//   ★★它为什么容易漏 ✗✓：★上面第②条"七处 `version` 全等"**看着已经对了** ✓ ——
//     ★而"**把七处版本号一起改**"这个动作**恰好会让人以为"版本的事都改完了"** ✗，
//     ★★而依赖范围写在**另一个字段**里、**不会跟着动** ✓。

const badName = ALL.filter((p) => !String(pkgs[p]?.name ?? '').startsWith('dsh-whale-post-'))
check('⑤ ★包名前缀统一（`dsh-whale-post-*` ✓）', badName.length === 0, badName.join('、'))
// ★⑥ **六件插件**的 `main`／`exports`／`files` 形状一致 ✓ —— ★★**而 `cli` 少一项，且那是故意的** ✗✓：
//   ★六件的 `files` 里有 `cordis.patch.yml`（★那是**插件**给引擎打补丁用的 ✓），
//   ★★而 `cli` **不是插件** ⇒ ★**它本来就该没有那个文件** ✓（★跟 ④ 同一条道理 ✓）。
//   ⚠️ ★**这一条也容易"被顺手补齐"** ✗：★"少一个文件"看起来就是漏了 ✓ ⇒ ★所以**明着判** ✓。
const shape = (p) => JSON.stringify([pkgs[p]?.main, Object.keys(pkgs[p]?.exports ?? {}), pkgs[p]?.files])
const pluginShapes = [...new Set(PLUGINS.map(shape))]
check('⑥ ★六件插件的 `main`／`exports`／`files` **形状一致** ✓', pluginShapes.length === 1,
  pluginShapes.length === 1 ? '六件全一致' : `${pluginShapes.length} 种形状`)
check('⑥b ★★`cli` 的 `files` **必须少 `cordis.patch.yml`** ✗（★它不是插件 ⇒ 没有补丁文件 ✓ —— ★故意的 ✓）',
  Array.isArray(pkgs[CLI]?.files) && !pkgs[CLI].files.includes('cordis.patch.yml'),
  Array.isArray(pkgs[CLI]?.files) ? pkgs[CLI].files.join(',') : '（没有 files）')

// ★★③b **`dsh.bundle.patch` 指向的那个文件，必须在 `files` 里** ✗✓（2026-10-10 加）
//   ★这是第③条的**下一层** ✓：★第③条只查"**字段在不在**" ✓；★而★**字段在、`files` 却漏了那个文件** ⇒
//     ★★★**发出去的 tarball 里就没有补丁 ⇒ 真引擎里照样"装上了但什么都不做"** ✗✓ ——
//     ★**同一个症状、两层原因** ✓。
//   ★实测（`npm pack --dry-run` 七个包 ✓）：★六件都带上 `LICENSE, README.md, cordis.patch.yml, index.js, package.json` ✓；
//     ★`cli` 带上 **4 个**（★没有 `cordis.patch.yml` ✓ —— ★它本来就不该有 ✓）。
const missingPatch = PLUGINS.filter((p) => {
  const files = pkgs[p]?.files
  const patch = String(pkgs[p]?.dsh?.bundle?.patch ?? '').replace(/^\.\//, '')
  if (!Array.isArray(files)) return true
  return patch !== '' && !files.includes(patch)
})
check('③b ★★`dsh.bundle.patch` 指的文件**在 `files` 里** ✗（★否则 tarball 里没补丁 ⇒ 真引擎里"什么都不做" ✓）',
  missingPatch.length === 0, missingPatch.length ? `缺：${missingPatch.join('、')}` : '六件都带上')

// ★★⑪ **发行清单里不许写死版本号** ✗✓（2026-10-10 加）——
//   ★`docs/RELEASE.md` 是"**怎么做**"的说明书 ✓ ⇒ ★**该用 `<本版>` 占位** ✓。
//   ★★★**写死的后果** ✗✓：★**每发一版都要回去改它** ✓ —— ★而**漏改的后果是"照着清单发错版本"** ✗✓
//     （★这是**唯一一种**"照文档做反而做错"的情形 ✓，★比文档缺一段更坏 ✓）。
//   ⓘ ★判据方向是**反的** ✗：★不是"清单里的版本要和 `package.json` 一致" ✓，★而是"**清单里不该有具体版本**" ✓ ——
//     ★因为清单是**长期**文档，★而版本号是**每版都变**的东西 ✓。
const relFiles = ['docs/RELEASE.md', 'docs/RELEASE.en.md']
const hardcoded = []
for (const f of relFiles) {
  if (!existsSync(join(repo, f))) { hardcoded.push(`★${f} 不存在`); continue }
  const text = readFileSync(join(repo, f), 'utf8')
  // ★只抓"像是要发的那一版"的写法：★`v0.3.0`／`@0.3.0`／`0.3.0`（★而 `<本版>` 这类占位符不算 ✓）
  for (const m of text.matchAll(/\bv?\d+\.\d+\.\d+\b/g)) {
    const line = text.slice(0, m.index).split('\n').length
    hardcoded.push(`${f}:${line} 里的「${m[0]}」`)
  }
}
check('⑪ ★★发行清单里**不许写死版本号** ✗（★该用 `<本版>` 占位 —— ★写死了每版都要改，漏改就发错 ✓）',
  hardcoded.length === 0, hardcoded.slice(0, 4).join('、'))

// ★⑦ `private`：★**七个包都不许 private** ✗（★private 的包发不出去 ✓）；★而根**该** private ✓
const priv = ALL.filter((p) => pkgs[p]?.private === true)
check('⑦ ★七个包都**不是** `private` ✗（★private 的包发不出去 ✓）', priv.length === 0, priv.join('、'))
{
  const root = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
  check('⑧ 根 `package.json` **是** `private` ✓（★它不该被发出去 ✓）', root.private === true)
}

// ★⑨ 每个包的 `exports` 指向的文件**真的存在** ✓（★指向空气是最容易犯的发布错 ✓）
const missing = []
for (const p of ALL) {
  const e = pkgs[p]?.exports
  const targets = typeof e === 'string' ? [e] : Object.values(e ?? {}).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v ?? {})))
  for (const t of targets) {
    if (typeof t !== 'string') continue
    if (!existsSync(join(repo, 'packages', p, t))) missing.push(`${p}→${t}`)
  }
}
check('⑨ ★`exports` 指向的文件**真的存在** ✗（★指向空气是最容易犯的发布错 ✓）',
  missing.length === 0, missing.join('、'))

// ★⑩ 仓库里不该有散落的临时文件（★我这几轮写过好几个探针 ✓）
const strays = readdirSync(repo).filter((f) => /^t-.*\.(mjs|cjs|js)$/.test(f))
check('⑩ ★仓库根目录没有散落的临时探针 ✗（`t-*.mjs` ✓ —— ★我自己犯过 ✓）', strays.length === 0, strays.join('、'))

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : '  :: ' + c.extra}`)
const pass = checks.filter((c) => c.ok).length
console.log(`\n${pass}/${checks.length} 合格   （查了 ${ALL.length} 个包 ✓）`)
process.exit(pass === checks.length ? 0 : 1)
